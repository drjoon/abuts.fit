import express, { json, urlencoded, static as staticMiddleware } from "express";
import { connect } from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "dotenv";
import { existsSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import CreditOrder from "./models/creditOrder.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 환경 변수 로드
const envFile = String(process.env.ENV_FILE || "").trim();
if (envFile) {
  const candidates = isAbsolute(envFile)
    ? [envFile]
    : [
        resolve(process.cwd(), envFile),
        resolve(__dirname, envFile),
        resolve(__dirname, "../../", envFile),
      ];
  const found = candidates.find((p) => existsSync(p));

  if (found) {
    config({ path: found });
  } else {
    console.warn(
      `[dotenv] ENV_FILE not found. ENV_FILE=${envFile}. Tried: ${candidates.join(
        ", "
      )}`
    );
    config();
  }
} else {
  config();
}

// Express 앱 초기화
const app = express();

// 프록시(CloudFront/ELB) 뒤에서 원래 프로토콜(https)을 인식하도록 설정
app.set("trust proxy", 1);

// 데이터베이스 연결
const mongoUri =
  process.env.NODE_ENV === "test"
    ? process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFitTest"
    : process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI || "mongodb://localhost:27017/abutsFit"
    : process.env.MONGODB_URI_TEST ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/abutsFit";

const mongoSource =
  process.env.NODE_ENV === "test"
    ? "TEST DB"
    : process.env.NODE_ENV === "production"
    ? process.env.MONGODB_URI
      ? "PROD DB"
      : "LOCAL DB"
    : process.env.MONGODB_URI_TEST
    ? "TEST DB"
    : process.env.MONGODB_URI
    ? "PROD DB"
    : "LOCAL DB";

const dbReady = connect(mongoUri)
  .then(async () => {
    if (process.env.NODE_ENV !== "test") {
      console.log(`MongoDB 연결 성공: ${mongoSource}`);
    }

    if (
      String(process.env.ENABLE_SYNC_INDEXES || "").toLowerCase() === "true"
    ) {
      try {
        await CreditOrder.syncIndexes();
      } catch (err) {
        console.error("[CreditOrder] syncIndexes failed:", err);
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
app.use(helmet());
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

import creditRoutes from "./routes/credit.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import notificationRoutes from "./routes/notification.routes.js";

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

app.use("/api/credits", creditRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/notifications", notificationRoutes);

const FRONTEND_DIST_PATH = resolve(__dirname, "../frontend/dist");
const hasFrontendDist = existsSync(FRONTEND_DIST_PATH);

if (hasFrontendDist) {
  app.use(staticMiddleware(FRONTEND_DIST_PATH));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    if (req.path.startsWith("/uploads/")) {
      return next();
    }
    res.sendFile(join(FRONTEND_DIST_PATH, "index.html"));
  });
}

// 기본 라우트
if (!hasFrontendDist) {
  app.get("/", (req, res) => {
    res.send("어벗츠.핏 API 서버에 오신 것을 환영합니다.");
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
