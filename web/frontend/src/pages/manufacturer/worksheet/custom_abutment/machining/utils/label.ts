import type { QueueItem } from "../types";

const normalizeLotPart = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/^CAP/i, "")
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
    q?.lotNumber?.part || (q as any)?.lotPart || (q as any)?.lotNumberPart || "",
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
