export type UnsupportedConnectionCancelItem = {
  requestMongoId: string;
  requestId?: string;
  tooth?: string;
  label: string;
  cancelVia: "status" | "design-handoff-tooth";
  rndRequestId?: string;
  /** 기공의뢰 수신 화면에서 치아 디자인만 걷어낼 때 */
  transferId?: string;
};

export const UNSUPPORTED_CONNECTION_REQUESTOR_LINE =
  "해당 의뢰건의 커넥션 타입은 지금은 제공하지 않습니다.";

export const UNSUPPORTED_CONNECTION_CANCEL_LINE = "이 건만 의뢰 취소합니다.";

export function unsupportedConnectionHistoryLabel(label: string) {
  const text = String(label || "").trim();
  return text ? `제공하지 않는 커넥션: ${text}` : "제공하지 않는 커넥션";
}

const STASH_PREFIX = "abuts:unsupported-connection-cancel:";

export function stashUnsupportedCancelItems(
  scope: string,
  items: UnsupportedConnectionCancelItem[],
) {
  if (typeof window === "undefined") return;
  const key = `${STASH_PREFIX}${scope}`;
  try {
    if (!items.length) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function loadStashedUnsupportedCancelItems(
  scope: string,
): UnsupportedConnectionCancelItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`${STASH_PREFIX}${scope}`);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) =>
        row &&
        String(row.requestMongoId || "").trim() &&
        String(row.label || "").trim(),
    );
  } catch {
    return [];
  }
}
