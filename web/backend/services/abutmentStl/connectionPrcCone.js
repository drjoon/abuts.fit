// related files:
// - bg/pc1/esprit-addin/AcroDent/2_Connection/*_Connection.prc (Finish Connection 면)
// - web/backend/services/abutmentStl/cuffBlend.js (STL 원뿔을 이 면에 맞춤)
// - web/backend/services/abutmentStl/cuffConnectionSpecs.js (브랜드 원점·Z_a)
//
// 커넥션 PRC Finish Connection이 11° 원뿔에 들어가는 면(NC Z offset · 면 직경).
// Esprit: NC Z = #520+#523 − STL_Z 이므로 면의 STL Z = −(Z[#520+#523+offset]의 offset).
// Finish_Back은 STL Z=0에서 끝나므로, 그 높이의 STL 직경을 이 원뿔에 맞춰야 선삭과 맞는다.
// 파일마다 면 높이가 달라 0.26 같은 고정값을 쓰지 않는다.
import { TAPER_SLOPE } from "./cuffConnectionSpecs.js";

/**
 * @typedef {{
 *   fileName: string,
 *   faceZOffset: number,
 *   faceDiameter: number,
 * }} ConnectionPrcFace
 */

/** Finish Connection 면. Mini/Narrow의 첫 X는 접근, F0.01 뒤 W 직전이 면. */
const CONNECTION_PRC_FACES = [
  { fileName: "오스템_TS_RH_Connection.prc", faceZOffset: -0.038, faceDiameter: 3.467 },
  { fileName: "오스템_TS_MH_Connection.prc", faceZOffset: -0.22, faceDiameter: 2.849 },
  { fileName: "디오_UF_RH_Connection.prc", faceZOffset: -0.038, faceDiameter: 3.467 },
  { fileName: "디오_UF_NH_Connection.prc", faceZOffset: -0.22, faceDiameter: 2.549 },
  { fileName: "네오_IS_RH_Connection.prc", faceZOffset: -0.008, faceDiameter: 3.455 },
  { fileName: "네오_IS_SNH_Connection.prc", faceZOffset: -0.22, faceDiameter: 2.849 },
  { fileName: "덴티스_SQ_RH_Connection.prc", faceZOffset: -0.133, faceDiameter: 3.504 },
  { fileName: "덴티스_SQ_MH_Connection.prc", faceZOffset: -0.22, faceDiameter: 3.049 },
  { fileName: "덴티스_SQ_NH_Connection.prc", faceZOffset: -0.22, faceDiameter: 2.549 },
  { fileName: "덴티움_SuperLine_RH_Connection.prc", faceZOffset: -0.058, faceDiameter: 3.455 },
  { fileName: "메가젠_AnyOne_RH_Connection.prc", faceZOffset: -0.138, faceDiameter: 3.456 },
  { fileName: "메가젠_AnyOne_MH_Connection.prc", faceZOffset: -0.22, faceDiameter: 3.349 },
  { fileName: "메가젠_MiNi_H_Connection.prc", faceZOffset: -0.22, faceDiameter: 2.549 },
];

const FACE_BY_FILE = new Map(
  CONNECTION_PRC_FACES.map((row) => [row.fileName.normalize("NFC"), row]),
);

export function normalizeConnectionPrcFileName(fileName) {
  return String(fileName || "").normalize("NFC").trim();
}

/**
 * @returns {{
 *   fileName: string,
 *   faceZOffset: number,
 *   faceStlZ: number,
 *   faceDiameter: number,
 *   slope: number,
 *   coneAt: (z: number) => number,
 * } | null}
 */
export function resolveConnectionPrcCone(options = {}) {
  if (options.prcCone?.coneAt) return options.prcCone;
  const fileName = normalizeConnectionPrcFileName(options.connectionPrcFileName);
  const face = FACE_BY_FILE.get(fileName);
  if (!face) return null;
  const faceStlZ = -face.faceZOffset;
  const faceR = face.faceDiameter / 2;
  const slope = TAPER_SLOPE;
  return {
    fileName: face.fileName,
    faceZOffset: face.faceZOffset,
    faceStlZ,
    faceDiameter: face.faceDiameter,
    slope,
    coneAt: (z) => faceR + slope * (z - faceStlZ),
  };
}
