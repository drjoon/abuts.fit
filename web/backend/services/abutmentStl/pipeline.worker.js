// Rhino 대체 파이프라인을 API 이벤트 루프 밖에서 돌린다(건당 CPU 수백 ms~수 초).
// related files:
// - web/backend/services/abutmentStl/pipeline.js
// - web/backend/services/abutmentStl/runPipelineInWorker.js
import { parentPort, workerData } from "worker_threads";
import { runAbutmentStlPipeline } from "./pipeline.js";

try {
  const input = Buffer.from(
    workerData.input.buffer,
    workerData.input.byteOffset,
    workerData.input.byteLength,
  );
  const result = await runAbutmentStlPipeline(input, workerData.options || {});
  const out = result.outputBuffer;
  const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice();
  parentPort.postMessage({ ok: true, result: { ...result, outputBuffer: null }, output: bytes }, [bytes.buffer]);
} catch (error) {
  parentPort.postMessage({ ok: false, message: String(error?.message || error) });
}
