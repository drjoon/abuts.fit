// 업로드 묶음 해석을 API 이벤트 루프 밖에서 돌린다(수십 MB면 CPU 수 초).
// related files:
// - web/backend/services/scanbodyLibraryImport.service.js
// - web/backend/services/scanbodyLibraryUpload.service.js
import { parentPort, workerData } from "worker_threads";
import { parseScanbodyBundle } from "./scanbodyLibraryImport.service.js";
import { ScanbodyInputError } from "../utils/scanbodyGeometry.js";

try {
  const buffer = Buffer.from(workerData.buffer.buffer, workerData.buffer.byteOffset, workerData.buffer.length);
  const { libraries, notes } = parseScanbodyBundle(buffer, workerData.fileName);
  const transfer = [];
  const rows = libraries.map((lib) => ({
    source: lib.source,
    systemName: lib.systemName,
    fileNames: lib.fileNames,
    containerVersions: lib.containerVersions,
    kits: [...lib.kits.values()],
    parts: [...lib.parts.values()].map((part) => {
      const stl = new Uint8Array(part.stl);
      transfer.push(stl.buffer);
      return { name: part.name, hash: part.hash, stl };
    }),
  }));
  parentPort.postMessage({ ok: true, libraries: rows, notes }, transfer);
} catch (error) {
  parentPort.postMessage({
    ok: false,
    input: error instanceof ScanbodyInputError,
    message: String(error?.message || error),
  });
}
