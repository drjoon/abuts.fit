// 커프 이음부 보정을 API 이벤트 루프 밖에서 돌린다.
// related files:
// - web/backend/services/abutmentStl/cuffBlendJob.js (보정 한 건 — 람다와 공유)
// - web/backend/services/abutmentStl/cuffBlend.service.js
import { parentPort, workerData } from "worker_threads";
import { runCuffBlendJob } from "./cuffBlendJob.js";

try {
  const input = Buffer.from(workerData.input.buffer, workerData.input.byteOffset, workerData.input.byteLength);
  const result = runCuffBlendJob(input, workerData.mode || "auto", workerData.options || {});
  if (result.buffer) {
    const out = result.buffer;
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice();
    parentPort.postMessage({ result: { ...result, buffer: null }, output: bytes }, [bytes.buffer]);
  } else {
    parentPort.postMessage({ result });
  }
} catch (error) {
  parentPort.postMessage({ result: { ok: false, status: "failed", reason: String(error?.message || error) } });
}
