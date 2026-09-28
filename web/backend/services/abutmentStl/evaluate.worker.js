// JS 파이프라인 + Rhino 비교(표면 거리 포함)를 API 이벤트 루프 밖에서 돌린다.
// related files:
// - web/backend/services/abutmentStl/evaluate.js
// - web/backend/services/abutmentStl/shadow.service.js
import { parentPort, workerData } from "worker_threads";
import { evaluateAgainstRhino } from "./evaluate.js";

const toBuffer = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

try {
  const record = await evaluateAgainstRhino({
    ...workerData.args,
    inputBuffer: toBuffer(workerData.input),
    rhinoFilledBuffer: toBuffer(workerData.rhinoFilled),
    useWorker: false,
  });
  const out = record.outputBuffer;
  delete record.outputBuffer;
  const bytes = out ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice() : null;
  parentPort.postMessage({ ok: true, record, output: bytes }, bytes ? [bytes.buffer] : []);
} catch (error) {
  parentPort.postMessage({ ok: false, message: String(error?.message || error) });
}
