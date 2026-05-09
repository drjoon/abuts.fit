import { createServer } from "http";
import "./bootstrap/env.js";
import app, { dbReady } from "./app.js";
import { initializeSocket } from "./socket.js";
import {
  warmupCache,
  startPeriodicCacheRefresh,
} from "./utils/cacheWarming.js";
import { startDummyCncScheduler } from "./jobs/dummyCncWorker.js";
import { startReviewApprovalWorker } from "./services/reviewApprovalQueue.service.js";
import { seedCoreShared } from "./scripts/db/_core.shared.js";

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

    // subRole null 사용자 자동 수정 (1회성)
    (async () => {
      try {
        const User = (await import("./models/user.model.js")).default;
        const result = await User.updateMany(
          { businessAnchorId: { $ne: null }, subRole: null },
          { $set: { subRole: "owner" } },
        );
        if (result.modifiedCount > 0) {
          console.log(
            `[subRole fix] ${result.modifiedCount}명의 사용자 subRole을 'owner'로 업데이트했습니다.`,
          );
        }
      } catch (error) {
        console.error("[subRole fix] 오류:", error.message);
      }
    })();

    // Connection 컬렉션 diameter 필드 보장 (브랜드별 원점 정렬 직경)
    // connections.seed.js에 정의된 diameter 값이 DB에 반영되도록 idempotent 업서트 실행
    (async () => {
      try {
        const result = await seedCoreShared();
        console.log("[startup] Connection 시드 적용 완료", result.connections);
      } catch (err) {
        console.error("[startup] Connection 시드 적용 실패:", err?.message);
      }
    })();

    // 캐시 워밍 실행
    await warmupCache();

    // 주기적 캐시 갱신 시작 (선택적)
    if (process.env.NODE_ENV === "production") {
      startPeriodicCacheRefresh();
    }

    startDummyCncScheduler();

    // 의뢰/CAM 단계 승인 직렬 큐 워커 시작
    // 작업자 연속 승인 시 BG 앱(rhino, esprit, bridge, lot, pack, wbls) 과부하 방지
    startReviewApprovalWorker();
  })
  .catch((err) => {
    console.error("MongoDB 연결 실패(서버는 계속 실행):", err);
  });
