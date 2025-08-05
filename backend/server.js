import { listen } from "./app";
import { config } from "dotenv";

// 환경 변수 로드
config();

// 포트 설정 (기본값 5000)
const PORT = process.env.PORT || 5000;

// 서버 시작
listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
