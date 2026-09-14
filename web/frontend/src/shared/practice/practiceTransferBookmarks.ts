// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferBookmarkControl.tsx
// - web/frontend/src/pages/practice/components/PracticeStatusFilterBadges.tsx
// - web/backend/controllers/practiceTransfers/practiceTransferBookmark.controller.js
// - 2026-09-14: 북마크 목록·hydrate·순회 헬퍼(전기간, 별도 컬렉션).
import { request } from "@/shared/api/apiClient";

export const PRACTICE_TRANSFER_BOOKMARK_BADGE_KEY = "bookmark" as const;

export type PracticeTransferBookmarkSide = "send" | "receive";

export type PracticeTransferBookmarkItem = {
  transferMongoId: string;
  transferId: string;
  side: PracticeTransferBookmarkSide | string;
  createdAt: string | null;
};

export type PracticeTransferBookmarksPayload = {
  side: PracticeTransferBookmarkSide | string;
  items: PracticeTransferBookmarkItem[];
  count: number;
};

export const parsePracticeTransferBookmarksPayload = (
  raw: unknown,
): PracticeTransferBookmarksPayload => {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: PracticeTransferBookmarkItem[] = itemsRaw
    .map((row) => {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const transferMongoId = String(r.transferMongoId || "").trim();
      const transferId = String(r.transferId || "").trim();
      if (!transferMongoId && !transferId) return null;
      return {
        transferMongoId,
        transferId,
        side: String(r.side || "").trim(),
        createdAt: r.createdAt ? String(r.createdAt) : null,
      };
    })
    .filter((row): row is PracticeTransferBookmarkItem => Boolean(row));
  return {
    side: String(data.side || "").trim(),
    items,
    count: Math.max(0, Number(data.count ?? items.length) || 0),
  };
};

export async function fetchPracticeTransferBookmarks(params: {
  token: string;
  side: PracticeTransferBookmarkSide;
}): Promise<PracticeTransferBookmarksPayload> {
  const raw = await request({
    path: `/api/practice/transfers/bookmarks?side=${encodeURIComponent(params.side)}`,
    method: "GET",
    token: params.token,
  });
  return parsePracticeTransferBookmarksPayload(raw);
}

export function transferMongoIdsQuery(ids: string[]): string {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))]
    .map((id) => encodeURIComponent(id))
    .join(",");
}

/** 배지 클릭 순회 — lastId 다음 항목(끝이면 처음). */
export function pickNextBookmarkItem<T extends { transferId?: string; id?: string }>(
  items: readonly T[],
  lastTransferId: string,
): T | null {
  if (!items.length) return null;
  const idOf = (row: T) => String(row.transferId || row.id || "").trim();
  if (!lastTransferId) return items[0] || null;
  const idx = items.findIndex((row) => idOf(row) === lastTransferId);
  if (idx < 0) return items[0] || null;
  return items[(idx + 1) % items.length] || items[0] || null;
}

export function bookmarkIdSetFromItems(
  items: readonly PracticeTransferBookmarkItem[],
): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    const mongo = String(item.transferMongoId || "").trim();
    const tid = String(item.transferId || "").trim();
    if (mongo) set.add(mongo);
    if (tid) set.add(tid);
  }
  return set;
}
