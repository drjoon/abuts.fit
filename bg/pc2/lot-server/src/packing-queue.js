// change-log:
// - 2026-11-26: 작업 화면 의뢰 카드는 지금 세척.패킹에 들어와 있는 건만. 백엔드 큐(manufacturerStage=세척.패킹)에는
//   우편함 배정 규칙 이전에 남은 옛 건(우편함 없음, 6–11월)이 섞여 있어 우편함이 배정된 건만 남긴다.
//   가공→세척.패킹 진입 때 우편함이 항상 배정된다(web/backend/rules.md 우편함 배정 SSOT).
// related files:
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/public/station.js
// - bg/pc2/lot-server/test/packing-queue.test.js
// - web/backend/controllers/ai/packingStation.controller.js

export const DIAMETER_LABELS = ["6", "8", "10", "12"];

/** 백엔드 getDiameterBucketIndex와 같은 구간(≤6, ≤8, ≤10, 그 외). */
export function diameterBucketIndex(diameter) {
  if (diameter == null || diameter === "" || !Number.isFinite(Number(diameter))) return 3;
  const d = Number(diameter);
  if (d <= 6) return 0;
  if (d <= 8) return 1;
  if (d <= 10) return 2;
  return 3;
}

/** 지금 세척.패킹에서 작업 중인 건인가. 기본: 우편함이 배정된 건. */
export function isActivePackingItem(item, { requireMailbox = true } = {}) {
  if (!item || typeof item !== "object") return false;
  if (!requireMailbox) return true;
  return String(item.mailboxCode || "").trim() !== "";
}

/**
 * 백엔드 /api/bg/packing/queue 응답 본문을 거른다. total·counts를 다시 센다.
 * @param {object} body ApiResponse { success, data: { total, labels, counts, items } }
 * @param {{ requireMailbox?: boolean }} [opts]
 */
export function filterPackingQueueBody(body, opts = {}) {
  if (!body || typeof body !== "object" || !body.data || !Array.isArray(body.data.items)) return body;
  const all = body.data.items;
  const items = all.filter((item) => isActivePackingItem(item, opts));
  const labels = Array.isArray(body.data.labels) && body.data.labels.length === 4 ? body.data.labels : DIAMETER_LABELS;
  const counts = [0, 0, 0, 0];
  for (const item of items) counts[diameterBucketIndex(item.maxDiameter)] += 1;
  return {
    ...body,
    data: {
      ...body.data,
      total: items.length,
      labels,
      counts,
      items,
      hidden: all.length - items.length,
    },
  };
}

/** LOT_QUEUE_REQUIRE_MAILBOX=0이면 거르지 않는다(백엔드 목록 그대로). */
export function queueFilterOptionsFromEnv(env = process.env) {
  return { requireMailbox: String(env.LOT_QUEUE_REQUIRE_MAILBOX ?? "1").trim() !== "0" };
}
