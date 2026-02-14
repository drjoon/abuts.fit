import { getIO } from "../socket.js";

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
  if (activePolls.has(pollKey)) return;
  activePolls.set(pollKey, true);
  try {
    console.warn(
      `[CNC Poller] disabled by policy (no polling in backend). machineId=${machineId} jobId=${jobId}`,
    );
    const io = getIO();
    io.to(`cnc:${machineId}:${jobId}`).emit("cnc-machining-timeout", {
      machineId,
      jobId,
      timedOutAt: new Date(),
      reason: "BACKEND_POLLING_DISABLED",
    });
  } finally {
    activePolls.delete(pollKey);
  }
}

export default {
  startMachiningPoller,
};
