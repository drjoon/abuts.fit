import axios from "axios";
import { getIO } from "../socket.js";

const BRIDGE_BASE_URL =
  process.env.BRIDGE_SERVER_URL || "http://localhost:5000";
const POLL_INTERVAL = 2000; // 2초
const MAX_POLL_DURATION = 20 * 60 * 1000; // 20분

// 활성 폴링 작업 추적
const activePolls = new Map();

/**
 * 브리지 서버에서 가공 완료 여부를 폴링하고, 완료 시 프론트에 WebSocket으로 알림
 * 브리지는 단일 파일만 처리하고, 가공 완료 후 백엔드 DB에서 다음 작업을 조회하여 자동 연속 가공
 * @param {string} machineId - CNC 장비 ID
 * @param {string} jobId - 브리지 작업 ID
 */
export async function startMachiningPoller(machineId, jobId) {
  const pollKey = `${machineId}:${jobId}`;

  // 이미 폴링 중이면 중복 실행 방지
  if (activePolls.has(pollKey)) {
    console.log(`[CNC Poller] 이미 폴링 중: ${pollKey}`);
    return;
  }

  console.log(`[CNC Poller] 시작: ${pollKey}`);
  activePolls.set(pollKey, true);

  const startTime = Date.now();
  let completed = false;

  try {
    while (!completed && Date.now() - startTime < MAX_POLL_DURATION) {
      try {
        // 브리지에서 작업 상태 조회
        const response = await axios.get(
          `${BRIDGE_BASE_URL}/api/cnc/machines/${encodeURIComponent(machineId)}/smart/status`,
          { timeout: 5000 },
        );

        const { data } = response.data;
        const { workerRunning, current } = data || {};

        // 워커가 멈추고 current가 없으면 가공 완료
        if (!workerRunning && !current) {
          completed = true;
          console.log(`[CNC Poller] 완료: ${pollKey}`);

          // WebSocket으로 프론트에 알림
          const io = getIO();
          io.to(`cnc:${machineId}:${jobId}`).emit("cnc-machining-completed", {
            machineId,
            jobId,
            status: "COMPLETED",
            completedAt: new Date(),
          });

          break;
        }

        // 아직 진행 중이면 대기 후 재시도
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      } catch (pollErr) {
        console.error(`[CNC Poller] 폴링 오류 ${pollKey}:`, pollErr.message);
        // 폴링 오류는 무시하고 계속 시도
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    }

    if (!completed) {
      console.warn(`[CNC Poller] 타임아웃: ${pollKey}`);
      const io = getIO();
      io.to(`cnc:${machineId}:${jobId}`).emit("cnc-machining-timeout", {
        machineId,
        jobId,
        timedOutAt: new Date(),
      });
    }
  } finally {
    activePolls.delete(pollKey);
    console.log(`[CNC Poller] 종료: ${pollKey}`);
  }
}

export default {
  startMachiningPoller,
};
