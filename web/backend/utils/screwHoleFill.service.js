// related files:
// - web/backend/utils/screwHoleFill.worker.js
// - web/backend/services/abutmentStl/workerSlots.js (메시 worker 동시 개수·힙 한도 공유)
// - web/backend/controllers/requests/common.files.controller.js
import {
  MeshWorkerQueueTimeoutError,
  MeshWorkerTimeoutError,
  runMeshWorker,
} from "../services/abutmentStl/workerSlots.js";

const WORKER_URL = new URL("./screwHoleFill.worker.js", import.meta.url);
const TIMEOUT_MS = Number(process.env.SCREW_HOLE_FILL_TIMEOUT_MS || 30 * 1000);
const QUEUE_TIMEOUT_MS = Number(process.env.SCREW_HOLE_FILL_QUEUE_TIMEOUT_MS || 30 * 1000);

/**
 * fillUpperScrewHole을 worker에서 돌린다. timeout은 슬롯을 얻은 뒤부터 센다.
 * @returns {Promise<{ ok: boolean, reason?: string, buffer?: Buffer, stats?: object, busy?: boolean }>}
 */
export async function fillUpperScrewHoleInWorker(buffer) {
  try {
    const msg = await runMeshWorker(WORKER_URL, {
      label: "screw-hole-fill",
      timeoutMs: TIMEOUT_MS,
      queueTimeoutMs: QUEUE_TIMEOUT_MS,
      buildWorkerData: () => {
        const input = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
        return { workerData: { input }, transferList: [input.buffer] };
      },
    });
    const result = msg?.result || { ok: false, reason: "스크류홀 메우기 결과가 없습니다." };
    if (msg?.output) {
      result.buffer = Buffer.from(msg.output.buffer, msg.output.byteOffset, msg.output.byteLength);
    }
    return result;
  } catch (error) {
    if (error instanceof MeshWorkerQueueTimeoutError) {
      return { ok: false, busy: true, reason: "다른 메시 작업이 진행 중입니다. 잠시 후 다시 시도해주세요." };
    }
    if (error instanceof MeshWorkerTimeoutError) {
      return { ok: false, reason: `스크류홀 메우기 시간 초과(${TIMEOUT_MS}ms)` };
    }
    return { ok: false, reason: String(error?.message || error) };
  }
}
