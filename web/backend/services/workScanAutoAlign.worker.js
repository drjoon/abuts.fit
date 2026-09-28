// 작업 스캔 자동 정렬 계산을 API 이벤트 루프 밖에서 돌린다(스캔 3개면 CPU 수십 초).
// 계산은 프론트 AI 디자인과 같은 코드(vendor 번들)다.
// related files:
// - web/backend/services/workScanAutoAlign.service.js
// - web/frontend/src/shared/practice/workScanAutoAlign.ts
import { parentPort, workerData } from "worker_threads";
import { DOMParser } from "linkedom";
import sharp from "sharp";

globalThis.DOMParser ??= DOMParser;

const { alignWorkScansToBite, setHpsJpegDecoder } = await import(
  "../vendor/workScanAutoAlign/workScanAutoAlign.mjs"
);

setHpsJpegDecoder(async (bytes) => {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  };
});

try {
  const inputs = workerData.inputs.map((row) => ({
    role: row.role,
    fileName: row.fileName,
    bytes: row.bytes.buffer.slice(
      row.bytes.byteOffset,
      row.bytes.byteOffset + row.bytes.byteLength,
    ),
  }));
  const result = await alignWorkScansToBite(inputs);
  if (result.status !== "aligned") {
    parentPort.postMessage({ ok: true, status: result.status, files: [] });
  } else {
    parentPort.postMessage(
      { ok: true, status: "aligned", moved: result.moved, files: result.files },
      result.files.map((file) => file.bytes.buffer),
    );
  }
} catch (error) {
  parentPort.postMessage({ ok: false, message: String(error?.message || error) });
}
