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
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Rate Limiting 설정
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 요청 수
  standardHeaders: true,
  legacyHeaders: false,
  message: "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.",
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
import adminRoutes from "./routes/admin.routes.js";
import machineRoutes from "./routes/machine.routes.js";

// 라우트 설정
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/machines", machineRoutes);

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
