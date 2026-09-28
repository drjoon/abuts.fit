// related files:
// - web/backend/services/abutmentStl/pipeline.worker.js
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/services/abutmentStl/workerSlots.js (동시 개수·힙 한도 공유, timeout은 슬롯 획득 뒤부터)
import { runMeshWorker } from "./workerSlots.js";

const WORKER_URL = new URL("./pipeline.worker.js", import.meta.url);
const EVALUATE_WORKER_URL = new URL("./evaluate.worker.js", import.meta.url);
const TIMEOUT_MS = Number(process.env.ABUTMENT_STL_JS_TIMEOUT_MS || 120 * 1000);

const copyBytes = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
const toBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

/** evaluateAgainstRhino 전체(파이프라인 + 비교)를 worker에서 돌린다. */
export async function evaluateAgainstRhinoInWorker({ inputBuffer, rhinoFilledBuffer, ...args }) {
  const msg = await runMeshWorker(EVALUATE_WORKER_URL, {
    label: "abutment STL JS evaluate",
    timeoutMs: TIMEOUT_MS * 2,
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
  const { log, ...serializable } = options;
  const msg = await runMeshWorker(WORKER_URL, {
    label: "abutment STL JS pipeline",
    timeoutMs: TIMEOUT_MS,
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
