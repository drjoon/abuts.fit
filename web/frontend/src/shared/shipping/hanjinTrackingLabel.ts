// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/shared/practice/practiceSenderTransferDetailModel.ts
// - web/frontend/src/types/request.ts
// change-log:
// - 2026-08-29: 기공의뢰 CA — 제목「어벗 진행상황」, 제조 공정(준비·가공·세척·패킹 등) 그대로 표시(생산 중 합침 제거).
// - 2026-08-21: 한진 운송중 뱃지 라벨(예: 여수 SUB 도착) SSOT. 기공의뢰 CA 배송 단계 문구 포함.
// - 2026-09-01: 캘린더 칩용 getPracticeAbutmentDeliveryChipLabel 제거 — 칩은 기공소/환자·치식만.

import type { DeliveryInfoSummary } from "@/types/request";

/** 치과·기공소 의뢰상세 요약 필드명 */
export const PRACTICE_ABUTMENT_PROGRESS_FIELD_LABEL = "어벗 진행상황";

type TrackingEventLike = {
  statusCode?: string;
  statusText?: string;
  occurredAt?: string;
  location?: string;
};

const pickLatestEvent = (
  events: TrackingEventLike[],
): TrackingEventLike | null => {
  if (!events.length) return null;
  const sorted = [...events].sort((a, b) => {
    const at = a?.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const bt = b?.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return at - bt;
  });
  return (
    [...sorted]
      .reverse()
      .find(
        (e) =>
          String(e?.location || "").trim() ||
          String(e?.statusText || "").trim(),
      ) || null
  );
};

/** 한진 "상품도착"/"상품출발" → "도착"/"출발" */
const shortenHanjinStatusText = (statusText: string) =>
  String(statusText || "")
    .trim()
    .replace(/^상품/, "")
    .trim();

/**
 * 집하 후·배송완료 전 한진 현황 라벨.
 * 예: "여수 SUB 도착", "Mega-Hub HUB 출발"
 * 해당 없으면 null.
 */
export const getHanjinInTransitBadgeLabel = (
  di?: DeliveryInfoSummary | null,
  options?: { requirePickedUpColumn?: boolean },
): string | null => {
  if (!di) return null;
  if (di.deliveredAt) return null;
  if (options?.requirePickedUpColumn !== false && !di.pickedUpAt) return null;

  const code = String(di?.tracking?.lastStatusCode || "").trim();
  if (code === "66") return null;

  const carrier = String(di?.carrier || "hanjin")
    .trim()
    .toLowerCase();
  if (carrier && carrier !== "hanjin") return null;

  const events = Array.isArray(di?.events)
    ? (di.events as TrackingEventLike[])
    : [];
  const lastEvent = pickLatestEvent(events);
  const location = String(
    lastEvent?.location || (di?.tracking as any)?.lastLocation || "",
  ).trim();
  const statusText = String(
    lastEvent?.statusText || di?.tracking?.lastStatusText || "",
  ).trim();
  const shortStatus = shortenHanjinStatusText(statusText);

  if (location && shortStatus) return `${location} ${shortStatus}`;
  if (location) return location;
  if (shortStatus) return shortStatus;
  if (di.pickedUpAt) return "한진 미처리";
  return null;
};

/** 배송완료 포함 의뢰자/추적 요약 라벨 */
export const getHanjinDeliveryStatusLabel = (
  di?: DeliveryInfoSummary | null,
): string | null => {
  if (!di) return null;
  if (di.deliveredAt) return "배송완료";
  return getHanjinInTransitBadgeLabel(di, { requirePickedUpColumn: true });
};

export type PracticeAbutmentDeliveryInfo = DeliveryInfoSummary & {
  relatedCount?: number;
  manufacturerStages?: string[];
};

const STAGE_PRIORITY = [
  "추적관리",
  "포장.발송",
  "발송",
  "세척.패킹",
  "세척.포장",
  "생산",
  "CAM",
  "가공",
  "준비",
  "의뢰",
] as const;

/** 제조사 워크시트와 맞춘 표시 라벨(가운뎃점). */
const manufacturerStageToProgressLabel = (stage: string): string | null => {
  const s = String(stage || "").trim();
  if (!s) return null;
  if (s === "추적관리" || s === "tracking") return "추적관리";
  if (s === "포장.발송" || s === "발송" || s === "shipping") return "포장·발송";
  if (
    s === "세척.패킹" ||
    s === "세척.포장" ||
    s === "packing" ||
    s === "cleaning"
  ) {
    return "세척·패킹";
  }
  if (s === "생산" || s === "CAM" || s === "가공" || s === "machining") {
    return "가공";
  }
  if (s === "준비" || s === "의뢰" || s === "request") return "준비";
  return null;
};

const stageToPendingLabel = (stages: string[]): string | null => {
  const normalized = stages.map((s) => String(s || "").trim()).filter(Boolean);
  const set = new Set(normalized);
  for (const stage of STAGE_PRIORITY) {
    if (!set.has(stage)) continue;
    const label = manufacturerStageToProgressLabel(stage);
    if (label) return label;
  }
  for (const raw of normalized) {
    const label = manufacturerStageToProgressLabel(raw);
    if (label) return label;
  }
  return normalized.length ? "가공" : null;
};

/**
 * 기공의뢰(구강스캔으로) 어벗 진행상황 표시 라벨.
 * 한진 운송 현황이 있으면 우선, 없으면 연동 CA 제조 공정/생산 전 문구.
 */
export const getPracticeAbutmentDeliveryLabel = (input: {
  hasCustomAbutment?: boolean;
  abutmentDeliveryInfo?: PracticeAbutmentDeliveryInfo | null;
}): string | null => {
  if (!input.hasCustomAbutment) return null;
  const di = input.abutmentDeliveryInfo || null;
  const hanjin = getHanjinDeliveryStatusLabel(di);
  if (hanjin) return hanjin;
  if (di?.shippedAt) return "발송접수";
  const fromStage = stageToPendingLabel(
    Array.isArray(di?.manufacturerStages) ? di.manufacturerStages : [],
  );
  if (fromStage) return fromStage;
  if (Number(di?.relatedCount || 0) > 0) return "생산 준비";
  return "생산 전";
};

/** 요약/뱃지 톤: 완료·제조공정·운송중 */
export type PracticeAbutmentProgressTone = "done" | "pending" | "transit";

export const getPracticeAbutmentProgressTone = (
  label: string | null | undefined,
): PracticeAbutmentProgressTone => {
  const v = String(label || "").trim();
  if (v === "배송완료") return "done";
  if (
    v === "생산 전" ||
    v === "생산 준비" ||
    v === "생산 중" || // 레거시 합침 라벨
    v === "출고 대기" || // 레거시
    v === "준비" ||
    v === "가공" ||
    v === "세척·패킹" ||
    v === "포장·발송" ||
    v === "추적관리"
  ) {
    return "pending";
  }
  return "transit";
};

export const practiceAbutmentProgressValueClassName = (
  label: string | null | undefined,
): string => {
  const tone = getPracticeAbutmentProgressTone(label);
  if (tone === "done") return "text-emerald-700";
  if (tone === "pending") return "text-slate-600";
  return "text-amber-800";
};

export const practiceAbutmentProgressBadgeClassName = (
  label: string | null | undefined,
): string => {
  const base =
    "inline-block max-w-[9.5rem] truncate rounded px-2 py-0.5 text-[11px] font-semibold";
  const tone = getPracticeAbutmentProgressTone(label);
  if (tone === "done") return `${base} bg-emerald-100 text-emerald-800`;
  if (tone === "pending") return `${base} bg-slate-100 text-slate-700`;
  return `${base} bg-amber-100 text-amber-800`;
};
