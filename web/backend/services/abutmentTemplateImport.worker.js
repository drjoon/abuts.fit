// 심플어벗 템플릿 .dcm 해석을 API 이벤트 루프 밖에서 돌린다. 검사를 통과한 원본만 온다.
// related files:
// - web/backend/services/abutmentTemplateUpload.service.js
// - web/backend/utils/scanbodyGeometry.js
import { parentPort, workerData } from "worker_threads";
import {
  ScanbodyInputError,
  canonicalStlHash,
  encodeCanonicalStl,
  trianglesFromHps,
} from "../utils/scanbodyGeometry.js";

try {
  const buffer = Buffer.from(workerData.buffer.buffer, workerData.buffer.byteOffset, workerData.buffer.length);
  // 템플릿은 스캐너 좌표 그대로라 범위를 넓게 준다.
  const stl = encodeCanonicalStl(trianglesFromHps(buffer), { maxAbsMm: 2000 });
  const out = new Uint8Array(stl.buffer, stl.byteOffset, stl.length).slice();
  parentPort.postMessage({ ok: true, hash: canonicalStlHash(stl), stl: out }, [out.buffer]);
} catch (error) {
  parentPort.postMessage({
    ok: false,
    input: error instanceof ScanbodyInputError,
    message: String(error?.message || error),
  });
}
