// 작업완료 보철 STL과 상악·하악·바이트를 학습 쌍으로 묶는다.
// 마진·정합은 있으면 품질 표시. 파일 쌍이 있으면 ready.
import { resolveStoredScanRole } from "./oralScanRole.js";

const DESIGNABLE = new Set(["크라운", "인레이", "온레이", "브리지"]);
const MESH = /\.(stl|ply|obj)$/i;

function scanOf(row) {
  const fileName = String(row?.file?.originalName || "").trim();
  const s3Key = String(row?.file?.s3Key || "").trim();
  const stored = resolveStoredScanRole({
    originalName: fileName,
    scanRole: row?.scanRole,
    scanRoleSetBy: row?.scanRoleSetBy,
  });
  return { role: stored.scanRole, s3Key, fileName };
}

/**
 * @returns {{
 *   status: "pending" | "ready" | "incomplete",
 *   preparedAt: Date,
 *   alignmentStatus: string,
 *   missing: string[],
 *   pairs: Array<Record<string, unknown>>,
 * }}
 */
export function buildAiTrainingRecord(doc, now = new Date()) {
  const scans = { upper: "", lower: "", bite: "" };
  const scanNames = { upper: "", lower: "", bite: "" };
  for (const row of Array.isArray(doc?.files) ? doc.files : []) {
    const scan = scanOf(row);
    if (
      (scan.role === "upper" || scan.role === "lower" || scan.role === "bite") &&
      scan.s3Key &&
      !scans[scan.role]
    ) {
      scans[scan.role] = scan.s3Key;
      scanNames[scan.role] = scan.fileName;
    }
  }

  const pairs = [];
  for (const row of Array.isArray(doc?.resultFiles) ? doc.resultFiles : []) {
    const fileName = String(row?.file?.originalName || "").trim();
    const s3Key = String(row?.file?.s3Key || "").trim();
    if (!fileName || !s3Key || !MESH.test(fileName)) continue;
    const tooth = String(row?.tooth || "").trim();
    const prosthesisType = String(row?.prosthesisType || "").trim();
    const marginPoints = Array.isArray(row?.marginPoints) ? row.marginPoints : [];
    pairs.push({
      tooth,
      prosthesisType,
      s3Key,
      fileName,
      marginArch: String(row?.marginArch || "").trim(),
      marginPointCount: marginPoints.length,
      upperS3Key: scans.upper,
      lowerS3Key: scans.lower,
      biteS3Key: scans.bite,
      designable: DESIGNABLE.has(prosthesisType) && Boolean(tooth),
    });
  }

  const completed = Boolean(doc?.autoMatch?.completedAt);
  const alignmentStatus = String(doc?.scanAlignment?.status || "").trim();
  const designable = pairs.filter((pair) => pair.designable);
  const missing = [];
  if (!completed) missing.push("work");
  if (!scans.upper) missing.push("upper");
  if (!scans.lower) missing.push("lower");
  if (!scans.bite) missing.push("bite");
  if (!designable.length) missing.push("prosthesis");
  for (const pair of designable) {
    if (pair.marginPointCount < 8) missing.push(`margin:${pair.tooth}`);
  }
  if (alignmentStatus !== "native" && alignmentStatus !== "aligned") {
    missing.push("alignment");
  }

  const ready =
    completed &&
    Boolean(scans.upper && scans.lower && scans.bite) &&
    designable.length > 0;

  return {
    status: !completed ? "pending" : ready ? "ready" : "incomplete",
    preparedAt: now,
    alignmentStatus,
    scanFileNames: scanNames,
    missing,
    pairs: pairs.map(({ designable, ...pair }) => pair),
  };
}
