// 업로드 묶음 해석을 API 이벤트 루프 밖에서 돌린다(수십 MB면 CPU 수 초).
// related files:
// - web/backend/services/scanbodyLibraryImport.service.js
// - web/backend/services/scanbodyLibraryUpload.service.js
import { parentPort, workerData } from "worker_threads";
import { parseScanbodyBundle, parseScanbodyMesh, parseScanbodySpec } from "./scanbodyLibraryImport.service.js";
import { ScanbodyInputError } from "../utils/scanbodyGeometry.js";

/**
 * 모델 좌표 STL(축 +Y)의 직경·높이(mm). 의뢰의 「직경/높이」와 같은 뜻이라 후보를 치수로 거른다.
 * 직경은 X·Z 폭 중 큰 값, 높이는 Y 폭.
 */
function stlExtentMm(stl) {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  if (stl.byteLength < 84) return { diameterMm: null, heightMm: null };
  const count = Math.min(view.getUint32(80, true), Math.floor((stl.byteLength - 84) / 50));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    for (let v = 0; v < 3; v += 1) {
      const at = 84 + i * 50 + 12 + v * 12;
      for (let k = 0; k < 3; k += 1) {
        const x = view.getFloat32(at + k * 4, true);
        if (x < min[k]) min[k] = x;
        if (x > max[k]) max[k] = x;
      }
    }
  }
  if (count === 0) return { diameterMm: null, heightMm: null };
  const round = (x) => Math.round(x * 100) / 100;
  return {
    diameterMm: round(Math.max(max[0] - min[0], max[2] - min[2])),
    heightMm: round(max[1] - min[1]),
  };
}

try {
  const buffer = Buffer.from(workerData.buffer.buffer, workerData.buffer.byteOffset, workerData.buffer.length);
  const { libraries, notes } = workerData.specMeta
    ? await parseScanbodySpec(buffer, workerData.fileName, workerData.specMeta)
    : workerData.meshMeta
      ? parseScanbodyMesh(buffer, workerData.fileName, workerData.meshMeta)
      : await parseScanbodyBundle(buffer, workerData.fileName);
  const transfer = [];
  const rows = libraries.map((lib) => ({
    source: lib.source,
    systemName: lib.systemName,
    fileNames: lib.fileNames,
    containerVersions: lib.containerVersions,
    implantManufacturer: lib.implantManufacturer || "",
    brand: lib.brand || "",
    implantType: lib.implantType || "",
    kits: [...lib.kits.values()].map((kit) => ({
      ...kit,
      spec: kit.spec || "",
      code: kit.code || "",
    })),
    parts: [...lib.parts.values()].map((part) => {
      const stl = new Uint8Array(part.stl);
      const extent = stlExtentMm(stl);
      transfer.push(stl.buffer);
      return {
        name: part.name,
        hash: part.hash,
        stl,
        diameterMm: part.diameterMm ?? extent.diameterMm,
        heightMm: part.heightMm ?? extent.heightMm,
      };
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
