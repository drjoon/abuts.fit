// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningRequestLabel.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// change-log:
// - 2026-08-07: formatMachiningLabel에 의뢰자명(businessName) 포함.
import type { QueueItem } from "../types";

const normalizeLotPart = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/^CA/i, "")
    .replace(/-/g, " ")
    .trim();

const resolveRequestSuffix = (requestId?: string) => {
  const rid = String(requestId || "").trim();
  if (!rid) return "";
  return rid.includes("-") ? rid.split("-").pop() || rid : rid;
};

export const formatMachiningLabel = (q: QueueItem | null | undefined) => {
  if (!q) return "-";

  const lotPartRaw = String(
    q?.lotNumber?.value ||
      (q as any)?.lotPart ||
      (q as any)?.lotNumberValue ||
      "",
  ).trim();
  const lotPart = normalizeLotPart(lotPartRaw);

  const business = String((q as any)?.businessName || "").trim();
  const clinic = String(q.clinicName || "").trim();
  const patient = String(q.patientName || "").trim();
  const tooth = String((q as any)?.tooth || "").trim();
  const ridSuffix = resolveRequestSuffix(q.requestId);

  const parts = [business, clinic, patient, tooth, lotPart, ridSuffix]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(" ") : "-";
};

type LabelExtra = {
  camDiameter?: number | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  isSample?: boolean | null;
  isRndArchivedSample?: boolean | null;
  isCopiedSample?: boolean | null;
  showFastMachiningRebalance?: boolean | null;
  estimatedShipYmd?: string | null;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const buildLabelExtraProps = (slot?: QueueItem | null): LabelExtra => {
  if (!slot) return {};
  const ci = (slot as any)?.caseInfos || {};
  const schedule = (slot as any)?.productionSchedule || {};
  const requestCategory = String((slot as any)?.requestCategory || "").trim();
  const source = String((slot as any)?.source || "").trim();
  const priceRule = String((slot as any)?.price?.rule || "").trim();

  const isRndArchivedSample = requestCategory === "rnd_sample";
  const isCopiedSample = requestCategory === "copied_sample";
  const isSample =
    isRndArchivedSample ||
    isCopiedSample ||
    source === "manufacturer_sample" ||
    priceRule === "manufacturer_sample";

  const rebalance =
    (slot as any)?.fastMachiningRebalance || schedule?.fastMachiningRebalance;
  const rebalanceReason = String(rebalance?.reason || "").trim();
  // express 14:00 재배치만 「빠른 가공 재배치」뱃지. 수동 Next Up 이동 메타는 제외.
  const showFastMachiningRebalance = rebalanceReason === "express_deadline_14";

  const estimatedShipYmd = String(
    (slot as any)?.estimatedShipYmd ||
      (slot as any)?.timeline?.estimatedShipYmd ||
      "",
  ).trim();

  return {
    camDiameter:
      toNumber((slot as any)?.diameter) ??
      toNumber(ci?.camDiameter) ??
      toNumber(schedule?.diameter) ??
      toNumber(ci?.materialDiameter) ??
      null,
    implantManufacturer: ci?.implantManufacturer ?? null,
    implantBrand: ci?.implantBrand ?? null,
    implantFamily: ci?.implantFamily ?? null,
    isSample,
    isRndArchivedSample,
    isCopiedSample,
    showFastMachiningRebalance,
    estimatedShipYmd: estimatedShipYmd || null,
  };
};
