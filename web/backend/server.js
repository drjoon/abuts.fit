import { createServer } from "http";
import app, { dbReady } from "./app.js";
import supportRoutes from "./routes/support.routes.js";
import implantPresetRoutes from "./routes/implantPreset.routes.js";
import { config } from "dotenv";
import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
import { startCreditJobs } from "./utils/creditJobs.js";
import { initializeSocket } from "./socket.js";

// 환경 변수 로드
const envFile = String(process.env.ENV_FILE || "").trim();
if (envFile) {
  const candidates = isAbsolute(envFile)
    ? [envFile]
    : [
        resolve(process.cwd(), envFile),
        resolve(process.cwd(), "..", envFile),
        resolve(process.cwd(), "..", "..", envFile),
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

// 포트 설정 (기본값 5001)
const PORT = process.env.PORT || 5001;

// HTTP 서버 생성
const server = createServer(app);

// Socket.io 초기화
initializeSocket(server);

// 서버 시작
(async () => {
  try {
    await dbReady;
    server.listen(PORT, () => {
      console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
      console.log(`Socket.io가 활성화되었습니다.`);
      startCreditJobs();
    });
  } catch (err) {
    console.error("서버 시작 실패:", err);
    process.exit(1);
  }
})();
