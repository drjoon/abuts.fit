// related files:
// - web/backend/services/abutmentStl/pipeline.worker.js
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/services/abutmentStl/workerSlots.js (동시 개수·힙 한도 공유, timeout은 슬롯 획득 뒤부터)
import { runMeshWorker } from "./workerSlots.js";

const WORKER_URL = new URL("./pipeline.worker.js", import.meta.url);
const EVALUATE_WORKER_URL = new URL("./evaluate.worker.js", import.meta.url);
/** Filled STL JS 계산 한도. 로컬은 10초 안쪽이라 60초를 넘기면 문제 케이스로 본다. */
export const FILLED_STL_JS_LIMIT_MS = Number(process.env.ABUTMENT_STL_JS_TIMEOUT_MS || 60 * 1000);
const EVALUATE_TIMEOUT_MS = 240 * 1000;

export function filledStlJsLimitSec() {
  return Math.max(1, Math.round(FILLED_STL_JS_LIMIT_MS / 1000));
}

/** 카드에 남길 실패 문구. 시간 초과는 원인 코드 대신 초 단위로 적는다. */
export function describeJsPipelineFailure(error) {
  const code = String(error?.code || error?.reason || "");
  const sec = filledStlJsLimitSec();
  if (code === "MESH_WORKER_TIMEOUT" || code === "js_timeout") {
    return { reason: "js_timeout", detail: `JS 실행이 ${sec}초를 넘겼습니다.` };
  }
  if (code === "MESH_WORKER_QUEUE_TIMEOUT") {
    return { reason: "js_queue_timeout", detail: `JS 실행 대기가 ${sec}초를 넘겼습니다.` };
  }
  return {
    reason: error?.reason || "js_error",
    detail: String(error?.message || error),
  };
}

const copyBytes = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
const toBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

/** evaluateAgainstRhino 전체(파이프라인 + 비교)를 worker에서 돌린다. */
export async function evaluateAgainstRhinoInWorker({ inputBuffer, rhinoFilledBuffer, ...args }) {
  const msg = await runMeshWorker(EVALUATE_WORKER_URL, {
    label: "abutment STL JS evaluate",
    timeoutMs: EVALUATE_TIMEOUT_MS,
    buildWorkerData: () => {
      const input = copyBytes(inputBuffer);
      const rhinoFilled = copyBytes(rhinoFilledBuffer);
      return {
        workerData: { input, rhinoFilled, args },
        transferList: [input.buffer, rhinoFilled.buffer],
      };
    },
  });
  if (!msg?.ok) {
    throw new Error(msg?.message || "abutment STL JS evaluate failed");
  }
  const record = msg.record;
  if (msg.output) record.outputBuffer = toBuffer(msg.output);
  return record;
}

/** @returns {Promise<object>} runAbutmentStlPipeline 결과(outputBuffer는 Buffer) */
export async function runAbutmentStlPipelineInWorker(inputBuffer, options = {}) {
  const { log, queueTimeoutMs, ...serializable } = options;
  const msg = await runMeshWorker(WORKER_URL, {
    label: "abutment STL JS pipeline",
    timeoutMs: FILLED_STL_JS_LIMIT_MS,
    queueTimeoutMs: Number(queueTimeoutMs) > 0 ? Number(queueTimeoutMs) : 0,
    buildWorkerData: () => {
      const input = copyBytes(inputBuffer);
      return { workerData: { input, options: serializable }, transferList: [input.buffer] };
    },
  });
  if (!msg?.ok) {
    throw new Error(msg?.message || "abutment STL JS pipeline failed");
  }
  return { ...msg.result, outputBuffer: toBuffer(msg.output) };
}
