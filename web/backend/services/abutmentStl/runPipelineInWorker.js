// related files:
// - web/backend/services/abutmentStl/pipeline.worker.js
// - web/backend/services/abutmentStl/shadow.service.js
import { Worker } from "worker_threads";

const WORKER_URL = new URL("./pipeline.worker.js", import.meta.url);
const EVALUATE_WORKER_URL = new URL("./evaluate.worker.js", import.meta.url);
const TIMEOUT_MS = Number(process.env.ABUTMENT_STL_JS_TIMEOUT_MS || 120 * 1000);

const copyBytes = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();

/** evaluateAgainstRhino 전체(파이프라인 + 비교)를 worker에서 돌린다. */
export function evaluateAgainstRhinoInWorker({ inputBuffer, rhinoFilledBuffer, ...args }) {
  return new Promise((resolve, reject) => {
    const input = copyBytes(inputBuffer);
    const rhinoFilled = copyBytes(rhinoFilledBuffer);
    const worker = new Worker(EVALUATE_WORKER_URL, {
      workerData: { input, rhinoFilled, args },
      transferList: [input.buffer, rhinoFilled.buffer],
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`abutment STL JS evaluate timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS * 2);
    worker.once("message", (msg) => {
      clearTimeout(timer);
      void worker.terminate();
      if (!msg?.ok) {
        reject(new Error(msg?.message || "abutment STL JS evaluate failed"));
        return;
      }
      const record = msg.record;
      if (msg.output) record.outputBuffer = Buffer.from(msg.output.buffer, msg.output.byteOffset, msg.output.byteLength);
      resolve(record);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** @returns {Promise<object>} runAbutmentStlPipeline 결과(outputBuffer는 Buffer) */
export function runAbutmentStlPipelineInWorker(inputBuffer, options = {}) {
  return new Promise((resolve, reject) => {
    const input = new Uint8Array(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength).slice();
    const { log, ...serializable } = options;
    const worker = new Worker(WORKER_URL, {
      workerData: { input, options: serializable },
      transferList: [input.buffer],
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error(`abutment STL JS pipeline timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    worker.once("message", (msg) => {
      clearTimeout(timer);
      void worker.terminate();
      if (!msg?.ok) {
        reject(new Error(msg?.message || "abutment STL JS pipeline failed"));
        return;
      }
      resolve({ ...msg.result, outputBuffer: Buffer.from(msg.output.buffer, msg.output.byteOffset, msg.output.byteLength) });
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
