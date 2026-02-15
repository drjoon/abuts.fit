import express, { json, urlencoded, static as staticMiddleware } from "express";
import "./bootstrap/env.js";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import mongoose, { connect } from "mongoose";
import RequestorOrganization from "./models/requestorOrganization.model.js";
import ChargeOrder from "./models/chargeOrder.model.js";
import BankTransaction from "./models/bankTransaction.model.js";
import Counter from "./models/counter.model.js";
import AdminAuditLog from "./models/adminAuditLog.model.js";
import SignupVerification from "./models/signupVerification.model.js";
import TaxInvoiceDraft from "./models/taxInvoiceDraft.model.js";
import { requestFloodBlocker } from "./middlewares/requestFloodBlocker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Express 앱 초기화
const app = express();

// 프록시(CloudFront/ELB) 뒤에서 원래 프로토콜(https)을 인식하도록 설정
app.set("trust proxy", 1);

// 데이터베이스 연결
// MONGO_URI는 기존 레거시 키를 위한 백업으로 유지
const mongoUri =
  process.env.NODE_ENV === "test"
    ? process.env.MONGODB_URI_TEST ||
      process.env.MONGO_URI_TEST ||
      "mongodb://localhost:27017/abutsFitTest"
    : process.env.NODE_ENV === "production"
      ? process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        "mongodb://localhost:27017/abutsFit"
      : process.env.MONGODB_URI_TEST ||
        process.env.MONGO_URI_TEST ||
        process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        "mongodb://localhost:27017/abutsFit";

const mongoSource =
  process.env.NODE_ENV === "test"
    ? "TEST DB"
    : process.env.NODE_ENV === "production"
      ? process.env.MONGODB_URI || process.env.MONGO_URI
        ? "PROD DB"
        : "LOCAL DB"
      : process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST
        ? "TEST DB"
        : process.env.MONGODB_URI || process.env.MONGO_URI
          ? "PROD DB"
          : "LOCAL DB";

const dbReady = connect(mongoUri)
  .then(async () => {
    if (process.env.NODE_ENV !== "test") {
      console.log(`MongoDB 연결 성공: ${mongoSource}`);
      console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
      // URI에서 DB 이름만 추출하여 로그 (보안상 전체 URI는 출력하지 않음)
      const dbName = mongoUri.split("/").pop()?.split("?")[0] || "unknown";
      console.log(`연결된 DB: ${dbName}`);
    }

    const readyState = mongoose.connection.readyState;
    console.log("[mongoose] readyState after connect:", readyState);

    const shouldSync =
      String(process.env.ENABLE_SYNC_INDEXES || "").toLowerCase() === "true";
    const isDev = process.env.NODE_ENV !== "production";
    if (shouldSync && isDev) {
      console.warn(
        "[syncIndexes] dev 환경에서는 기본적으로 스킵합니다. 필요 시 ENABLE_SYNC_INDEXES_DEV=true 설정",
      );
    }

    if (
      shouldSync &&
      (!isDev ||
        String(process.env.ENABLE_SYNC_INDEXES_DEV || "").toLowerCase() ===
          "true")
    ) {
      if (readyState !== 1) {
        console.warn(
          `[syncIndexes] skipped because connection not ready (readyState=${readyState})`,
        );
        return;
      }

      const targets = [
        ["RequestorOrganization", RequestorOrganization],
        ["ChargeOrder", ChargeOrder],
        ["BankTransaction", BankTransaction],
        ["TaxInvoiceDraft", TaxInvoiceDraft],
        ["Counter", Counter],
        ["AdminAuditLog", AdminAuditLog],
        ["SignupVerification", SignupVerification],
      ];

      for (const [name, model] of targets) {
        try {
          await model.syncIndexes();
        } catch (err) {
          console.error(`[${name}] syncIndexes failed:`, err);
        }
      }
    }
  })
  .catch((err) => {
    console.error("MongoDB 연결 실패:", err);
    throw err;
  });

// 기본 미들웨어
// CNC/브리지 업로드에서 비교적 큰 텍스트 파일을 주고받기 위해 바디 용량 제한을 완화한다.
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Monaco Editor(web worker) 실행을 위해 blob worker 허용
        "worker-src": ["'self'", "blob:"],
        // Monaco Editor 로더/번들에서 eval 기반 코드를 사용하는 경우가 있어 허용
        "script-src": ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        "script-src-elem": [
          "'self'",
          "'unsafe-eval'",
          "https://cdn.jsdelivr.net",
        ],
        // S3 업로드/다운로드 허용
        "default-src": [
          "'self'",
          "https://abuts-fit.s3.ap-south-1.amazonaws.com",
          "https://*.amazonaws.com",
          "blob:",
          "data:",
        ],
        // 업로드/정적 파일을 S3에서 직접 읽을 수 있도록 허용
        "connect-src": [
          "'self'",
          // Socket.io (운영: 동일 오리진 wss/https)
          "wss:",
          "https://abuts-fit.s3.ap-south-1.amazonaws.com",
          "https://*.amazonaws.com",
          "https://cdn.jsdelivr.net",
          ...(process.env.NODE_ENV === "development"
            ? ["http://localhost:8080", "ws://localhost:8080"]
            : []),
        ],
        "img-src": [
          "'self'",
          "data:",
          "https://robohash.org",
          "https://abuts-fit.s3.ap-south-1.amazonaws.com",
          "https://*.amazonaws.com",
        ],
      },
    },
  }),
);
app.use(morgan("dev"));

// Rate Limiting 설정
const limiter = rateLimit({
  // 15분 기준, 대시보드/폴링 트래픽을 고려해 상당히 여유 있게 설정
  windowMs: 15 * 60 * 1000,
  max: 1000, // IP당 최대 요청 수 상향
  standardHeaders: true,
  legacyHeaders: false,
  message: "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.",
  // 리퀘스터 대시보드 전용 엔드포인트는 Rate Limit에서 제외
  skip: (req) => {
    // 개발 환경에서는 전체 Rate Limit 비활성화
    if (process.env.NODE_ENV === "development") {
      return true;
    }

    // app.use("/api", limiter) 아래에서의 req.path 예시:
    //   /requests/my/dashboard-summary
    //   /requests/my/bulk-shipping
    if (req.path.startsWith("/requests/my")) {
      return true;
    }

    return false;
  },
});

// API 요청에 Rate Limiting 적용
app.use("/api", limiter);
// 동일 콜 과도 반복 차단 (최근 100개, 5초 내 동일 콜 5회 이상)
app.use("/api", requestFloodBlocker);

// 정적 파일 제공 (업로드된 파일 등)
app.use("/uploads", staticMiddleware(resolve(__dirname, "uploads")));

// 라우트 모듈 가져오기
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import requestRoutes from "./routes/request.routes.js";
import draftRequestRoutes from "./routes/draftRequest.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import machineRoutes from "./routes/machine.routes.js";
import bridgeStoreRoutes from "./routes/bridgeStore.routes.js";
import supportRoutes from "./routes/support.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import fileRoutes from "./routes/file.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import parseLogRoutes from "./routes/parseLog.routes.js";
import filenameRuleRoutes from "./routes/filenameRule.routes.js";
import requestorOrganizationRoutes from "./routes/requestorOrganization.routes.js";
import guideProgressRoutes from "./routes/guideProgress.routes.js";
import rhinoRoutes from "./routes/rhino.routes.js";
import bgRoutes from "./routes/bg.routes.js";

import creditRoutes from "./routes/credit.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import manufacturerRoutes from "./routes/manufacturer.routes.js";
import cncMachineRoutes from "./routes/cncMachine.routes.js";
import salesmanRoutes from "./routes/salesman.routes.js";

// 라우트 설정
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests/drafts", draftRequestRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/bridge-store", bridgeStoreRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/parse-logs", parseLogRoutes);
app.use("/api/filename-rules", filenameRuleRoutes);
app.use("/api/requestor-organizations", requestorOrganizationRoutes);
app.use("/api/guide-progress", guideProgressRoutes);
app.use("/api/rhino", rhinoRoutes);
app.use("/api/bg", bgRoutes);

app.use("/api/credits", creditRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/manufacturer", manufacturerRoutes);
app.use("/api/cnc-machines", cncMachineRoutes);
app.use("/api/salesman", salesmanRoutes);
// 호환: 프런트에서 /api/cnc/machines/... 로 호출하는 경우도 지원
app.use("/api/cnc/machines", cncMachineRoutes);

const FRONTEND_DIST_PATH = resolve(__dirname, "../frontend/dist");
const shouldServeFrontendDist =
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "test" ||
  process.env.NODE_ENV === "development";
const FRONTEND_INDEX_PATH = join(FRONTEND_DIST_PATH, "index.html");
const hasFrontendDist =
  shouldServeFrontendDist && existsSync(FRONTEND_DIST_PATH);
const hasFrontendIndex = hasFrontendDist && existsSync(FRONTEND_INDEX_PATH);

app.get("/", (req, res) => {
  if (hasFrontendIndex) {
    return res.sendFile(FRONTEND_INDEX_PATH);
  }
  return res.send("어벗츠.핏 API 서버에 오신 것을 환영합니다.");
});

if (hasFrontendIndex) {
  app.use(staticMiddleware(FRONTEND_DIST_PATH));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    if (req.path.startsWith("/uploads/")) {
      return next();
    }
    res.sendFile(FRONTEND_INDEX_PATH);
  });
}

// 404 에러 처리
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res
      .status(404)
      .json({ message: "요청한 리소스를 찾을 수 없습니다." });
  }
  res.status(404).send("Not Found");
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || "서버 내부 오류가 발생했습니다.",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

export default app;

export { dbReady };
