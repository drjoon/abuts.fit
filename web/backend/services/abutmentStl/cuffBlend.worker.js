// 커프 이음부 보정을 API 이벤트 루프 밖에서 돌린다.
// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffBlend.service.js
import { parentPort, workerData } from "worker_threads";
import { blendCuffJunction, proposeCuffRedesign, redesignCuffBowl } from "./cuffBlend.js";

const RUNNERS = { auto: blendCuffJunction, redesign: redesignCuffBowl, propose: proposeCuffRedesign };

try {
  const input = Buffer.from(workerData.input.buffer, workerData.input.byteOffset, workerData.input.byteLength);
  const run = RUNNERS[workerData.mode] || blendCuffJunction;
  const result = run(input, workerData.options || {});
  if (result.ok && result.buffer) {
    const out = result.buffer;
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice();
    parentPort.postMessage({ result: { ...result, buffer: null }, output: bytes }, [bytes.buffer]);
  } else {
    parentPort.postMessage({ result });
  }
} catch (error) {
  parentPort.postMessage({ result: { ok: false, status: "failed", reason: String(error?.message || error) } });
}
