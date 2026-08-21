// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/types/request.ts
// change-log:
// - 2026-08-21: 한진 운송중 뱃지 라벨(예: 여수 SUB 도착) SSOT. 기공의뢰 CA 배송 단계 문구 포함.

import type { DeliveryInfoSummary } from "@/types/request";

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
  "세척.패킹",
  "생산",
  "CAM",
  "가공",
  "준비",
  "의뢰",
] as const;

const stageToPendingLabel = (stages: string[]): string | null => {
  const set = new Set(stages.map((s) => String(s || "").trim()).filter(Boolean));
  for (const stage of STAGE_PRIORITY) {
    if (!set.has(stage)) continue;
    if (stage === "추적관리" || stage === "포장.발송") return "출고 대기";
    if (stage === "세척.패킹" || stage === "생산" || stage === "CAM" || stage === "가공") {
      return "생산 중";
    }
    if (stage === "준비" || stage === "의뢰") return "생산 준비";
  }
  return stages.length ? "생산 중" : null;
};

/**
 * 기공의뢰(구강스캔으로) 커스텀어벗 배송 표시 라벨.
 * 한진 운송 현황이 있으면 우선, 없으면 연동 CA 공정/생산 전 문구.
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

/** 캘린더 칩 등 — 실제 운송/배송완료만 (생산 전·준비 문구는 제외) */
export const getPracticeAbutmentDeliveryChipLabel = (input: {
  hasCustomAbutment?: boolean;
  abutmentDeliveryInfo?: PracticeAbutmentDeliveryInfo | null;
}): string | null => {
  if (!input.hasCustomAbutment) return null;
  const di = input.abutmentDeliveryInfo || null;
  return getHanjinDeliveryStatusLabel(di);
};
