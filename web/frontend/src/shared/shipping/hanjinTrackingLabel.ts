// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/types/request.ts
// change-log:
// - 2026-08-21: 한진 운송중 뱃지 라벨(예: 여수 SUB 도착) SSOT.

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
