// 스크류홀 메우기를 API 이벤트 루프 밖에서 돌린다(1M 삼각형 ≈ 3초, +400MB).
// related files:
// - web/backend/utils/screwHoleFill.js
// - web/backend/utils/screwHoleFill.service.js
import { parentPort, workerData } from "worker_threads";
import { fillUpperScrewHole } from "./screwHoleFill.js";

try {
  const input = Buffer.from(workerData.input.buffer, workerData.input.byteOffset, workerData.input.byteLength);
  const result = fillUpperScrewHole(input);
  if (result.ok && result.buffer) {
    const out = result.buffer;
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice();
    parentPort.postMessage({ result: { ...result, buffer: null }, output: bytes }, [bytes.buffer]);
  } else {
    parentPort.postMessage({ result });
  }
} catch (error) {
  parentPort.postMessage({ result: { ok: false, reason: String(error?.message || error) } });
}
