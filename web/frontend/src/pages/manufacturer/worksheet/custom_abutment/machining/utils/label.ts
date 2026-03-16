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

  const clinic = String(q.clinicName || "").trim();
  const patient = String(q.patientName || "").trim();
  const tooth = String((q as any)?.tooth || "").trim();
  const ridSuffix = resolveRequestSuffix(q.requestId);

  const parts = [clinic, patient, tooth, lotPart, ridSuffix]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(" ") : "-";
};

type LabelExtra = {
  maxDiameter?: number | null;
  camDiameter?: number | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const buildLabelExtraProps = (slot?: QueueItem | null): LabelExtra => {
  if (!slot) return {};
  const ci = (slot as any)?.caseInfos || {};
  const schedule = (slot as any)?.productionSchedule || {};
  return {
    maxDiameter:
      toNumber((slot as any)?.maxDiameter) ??
      toNumber(ci?.maxDiameter) ??
      toNumber(ci?.diameter) ??
      null,
    camDiameter:
      toNumber((slot as any)?.diameter) ??
      toNumber(ci?.camDiameter) ??
      toNumber(schedule?.diameter) ??
      toNumber(ci?.materialDiameter) ??
      null,
    implantManufacturer: ci?.implantManufacturer ?? null,
    implantBrand: ci?.implantBrand ?? null,
    implantFamily: ci?.implantFamily ?? null,
    implantType: ci?.implantType ?? null,
  };
};
