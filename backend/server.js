import app from "./app.js";
import supportRoutes from "./routes/support.routes.js";
import implantPresetRoutes from "./routes/implantPreset.routes.js";
import { config } from "dotenv";

// 환경 변수 로드
config();

// 포트 설정 (기본값 5001)
const PORT = process.env.PORT || 5001;

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
