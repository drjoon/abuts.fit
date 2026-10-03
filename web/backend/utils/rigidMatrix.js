// 강체(회전+이동) 4×4 행 우선 행렬 검사.
// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferAbutmentSeat.controller.js

const ORTHO_TOL = 1e-3;
const MAX_TRANSLATION_MM = 500;

/** 회전+이동만 있는 4×4(행 우선)인지. 배율·전단·뒤집기는 거절한다. */
export function isRigidRowMajorMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 16) return false;
  if (!matrix.every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  const [a, b, c, tx, d, e, f, ty, g, h, i, tz, p, q, r, s] = matrix;
  if (Math.abs(p) > ORTHO_TOL || Math.abs(q) > ORTHO_TOL || Math.abs(r) > ORTHO_TOL) return false;
  if (Math.abs(s - 1) > ORTHO_TOL) return false;
  const cols = [
    [a, d, g],
    [b, e, h],
    [c, f, i],
  ];
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      const dot = cols[x][0] * cols[y][0] + cols[x][1] * cols[y][1] + cols[x][2] * cols[y][2];
      if (Math.abs(dot - (x === y ? 1 : 0)) > ORTHO_TOL) return false;
    }
  }
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (det < 0) return false;
  return Math.hypot(tx, ty, tz) <= MAX_TRANSLATION_MM;
}
