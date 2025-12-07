import express, { json, urlencoded, static as staticMiddleware } from "express";
import { connect } from "mongoose";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "dotenv";
import { join } from "path";
import rateLimit from "express-rate-limit";

// 환경 변수 로드
config();

// Express 앱 초기화
const app = express();

// 데이터베이스 연결
const mongoUri =
  process.env.NODE_ENV === "test"
    ? process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFitTest"
    : process.env.MONGODB_URI || "mongodb://localhost:27017/abutsFit";

connect(mongoUri)
  .then(() =>
    console.log(
      `MongoDB 연결 성공: ${
        process.env.NODE_ENV === "test" ? "TEST DB" : "PROD DB"
      }`
    )
  )
  .catch((err) => console.error("MongoDB 연결 실패:", err));

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
// ESM 환경에서는 __dirname이 없으므로 process.cwd()를 기준으로 업로드 경로를 지정
app.use("/uploads", staticMiddleware(join(process.cwd(), "uploads")));

// 라우트 모듈 가져오기
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import requestRoutes from "./routes/request.routes.js";
import draftRequestRoutes from "./routes/draftRequest.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import machineRoutes from "./routes/machine.routes.js";
import bridgeStoreRoutes from "./routes/bridgeStore.routes.js";
import supportRoutes from "./routes/support.routes.js";
import implantPresetRoutes from "./routes/implantPreset.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import fileRoutes from "./routes/file.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import clinicRoutes from "./routes/clinic.routes.js";

// 라우트 설정
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/request-drafts", draftRequestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/machines", machineRoutes);
app.use("/api/bridge-store", bridgeStoreRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/implant-presets", implantPresetRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/clinics", clinicRoutes);

// 기본 라우트
app.get("/", (req, res) => {
  res.send("어벗츠.핏 API 서버에 오신 것을 환영합니다.");
});

// 404 에러 처리
app.use((req, res) => {
  res.status(404).json({ message: "요청한 리소스를 찾을 수 없습니다." });
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
