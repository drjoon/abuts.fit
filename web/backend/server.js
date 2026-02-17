import { createServer } from "http";
import "./bootstrap/env.js";
import app, { dbReady } from "./app.js";
import implantPresetRoutes from "./modules/implantPresets/implantPreset.routes.js";
import { initializeSocket } from "./socket.js";
import {
  warmupCache,
  startPeriodicCacheRefresh,
} from "./utils/cacheWarming.js";

// 포트 설정 (EB 기본 upstream 포트는 8080)
const PORT = process.env.PORT || 8080;

// HTTP 서버 생성
const server = createServer(app);

// Socket.io 초기화
initializeSocket(server);

// 서버 시작 (DB 연결과 무관하게 우선 기동하여 EB 헬스체크/프로세스 트래킹을 통과)
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Socket.io가 활성화되었습니다.`);
});

dbReady
  .then(async () => {
    console.log("MongoDB 연결 준비 완료");

    // 캐시 워밍 실행
    await warmupCache();

    // 주기적 캐시 갱신 시작 (선택적)
    if (process.env.NODE_ENV === "production") {
      startPeriodicCacheRefresh();
    }
  })
  .catch((err) => {
    console.error("MongoDB 연결 실패(서버는 계속 실행):", err);
  });
