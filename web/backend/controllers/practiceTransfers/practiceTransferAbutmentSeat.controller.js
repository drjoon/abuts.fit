// 프리뷰에서 어벗을 보철에 맞춘 자세를 의뢰에 남긴다. 어벗·보철 파일은 건드리지 않는다.
// 확인하면 자세(행 우선 4×4)와 편차를, 거절하면 원래 위치(matrix null)를 저장해 다음에 다시 묻지 않는다.
// related files:
// - web/backend/utils/rigidMatrix.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/components/RequestFilesPreviewDialog.tsx
// - web/frontend/src/shared/share/seatAbutmentToProsthesis.ts
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  PRACTICE_TRANSFER_CASE_VIEW_SELECT,
  buildTransferLookupFilter,
  isPracticeTransferRemoved,
  resolvePracticeTransferCaseViewerSide,
} from "../../utils/practiceTransferCaseView.js";
import { isRigidRowMajorMatrix } from "../../utils/rigidMatrix.js";

const SEAT_SELECT = { ...PRACTICE_TRANSFER_CASE_VIEW_SELECT, "production.abutmentSeats": 1 };
const DEVIATION_KEYS = [
  "meanMm",
  "medianMm",
  "p90Mm",
  "maxGapMm",
  "maxPenetrationMm",
  "contact",
  "penetration",
];

const loadTransfer = async (req, res) => {
  const filter = buildTransferLookupFilter(req.params?.transferId);
  if (!filter) {
    res.status(400).json({ success: false, message: "의뢰 ID가 필요합니다." });
    return null;
  }
  const transfer = await PracticeTransfer.findOne(filter).select(SEAT_SELECT).lean();
  if (!transfer || isPracticeTransferRemoved(transfer)) {
    res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    return null;
  }
  const side = await resolvePracticeTransferCaseViewerSide(req.user, transfer);
  if (!side) {
    res.status(403).json({
      success: false,
      message: "이 의뢰에 참여한 치과·기공소만 볼 수 있습니다.",
    });
    return null;
  }
  return { transfer, side };
};

const fileKeys = (rows) =>
  new Set(
    (Array.isArray(rows) ? rows : [])
      .map((r) => String(r?.file?.s3Key || "").trim())
      .filter(Boolean),
  );

/** 지금 파일과 키가 맞는 기록만. 파일을 다시 올리면 옛 기록은 버린다. */
const currentSeats = (transfer) => {
  const abuts = fileKeys(transfer?.production?.designFiles);
  const crowns = fileKeys(transfer?.resultFiles);
  return (transfer?.production?.abutmentSeats || []).filter(
    (s) => abuts.has(s?.abutmentS3Key) && crowns.has(s?.prosthesisS3Key),
  );
};

const toApi = (s) => ({
  abutmentS3Key: s.abutmentS3Key,
  prosthesisS3Key: s.prosthesisS3Key,
  status: s.status,
  matrix: s.status === "confirmed" ? s.matrix : null,
  deviation: s.deviation || null,
  decidedAt: s.decidedAt || null,
});

const cleanDeviation = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of DEVIATION_KEYS) {
    const v = Number(raw[key]);
    if (Number.isFinite(v)) out[key] = Math.round(v * 10000) / 10000;
  }
  return Object.keys(out).length ? out : null;
};

/** GET /api/practice/transfers/:transferId/abutment-seats */
export async function listPracticeTransferAbutmentSeats(req, res) {
  try {
    const loaded = await loadTransfer(req, res);
    if (!loaded) return;
    return res.status(200).json({
      success: true,
      data: { seats: currentSeats(loaded.transfer).map(toApi) },
    });
  } catch (error) {
    console.error("[practiceTransferAbutmentSeat] list", error);
    return res.status(500).json({ success: false, message: "어벗 위치를 불러오지 못했습니다." });
  }
}

/**
 * POST /api/practice/transfers/:transferId/abutment-seats
 * body: { prosthesisS3Key, confirmed: boolean,
 *         abutments: [{ s3Key, matrix?: number[16] | null, deviation? }] }
 * 보철 하나에 꽂힌 어벗들을 한 번에 확인·거절한다.
 */
export async function savePracticeTransferAbutmentSeat(req, res) {
  try {
    const prosthesisS3Key = String(req.body?.prosthesisS3Key || "").trim();
    const confirmed = req.body?.confirmed === true;
    const abutments = Array.isArray(req.body?.abutments) ? req.body.abutments : [];
    if (!prosthesisS3Key || abutments.length === 0 || abutments.length > 16) {
      return res.status(400).json({ success: false, message: "보철과 어벗이 필요합니다." });
    }
    const loaded = await loadTransfer(req, res);
    if (!loaded) return;
    const { transfer, side } = loaded;
    const abutKeys = fileKeys(transfer.production?.designFiles);
    if (!fileKeys(transfer.resultFiles).has(prosthesisS3Key)) {
      return res.status(409).json({ success: false, code: "stale", message: "보철 파일이 바뀌었습니다." });
    }
    const now = new Date();
    const rows = [];
    for (const a of abutments) {
      const s3Key = String(a?.s3Key || "").trim();
      if (!abutKeys.has(s3Key)) {
        return res.status(409).json({ success: false, code: "stale", message: "어벗 파일이 바뀌었습니다." });
      }
      const matrix = a?.matrix ?? null;
      if (confirmed && matrix !== null && !isRigidRowMajorMatrix(matrix)) {
        return res.status(400).json({ success: false, message: "어벗 자세가 올바르지 않습니다." });
      }
      rows.push({
        abutmentS3Key: s3Key,
        prosthesisS3Key,
        status: confirmed ? "confirmed" : "rejected",
        matrix: confirmed ? matrix : null,
        deviation: confirmed ? cleanDeviation(a?.deviation) : null,
        decidedAt: now,
        decidedBy: req.user?._id || null,
        decidedSide: side,
      });
    }
    const replaced = new Set(rows.map((r) => r.abutmentS3Key));
    const next = [
      ...currentSeats(transfer).filter((s) => !replaced.has(s.abutmentS3Key)),
      ...rows,
    ];
    await PracticeTransfer.updateOne(
      { _id: transfer._id },
      { $set: { "production.abutmentSeats": next } },
    );
    return res.status(200).json({ success: true, data: { seats: next.map(toApi) } });
  } catch (error) {
    console.error("[practiceTransferAbutmentSeat] save", error);
    return res.status(500).json({ success: false, message: "어벗 위치를 저장하지 못했습니다." });
  }
}
