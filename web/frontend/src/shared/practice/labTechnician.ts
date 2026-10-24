export type LabTechnician = {
  userId: string;
  name: string;
};

export function parseLabTechnician(raw: unknown): LabTechnician | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const userId = String(row.userId || "").trim();
  const name = String(row.name || "").trim();
  if (!userId && !name) return null;
  return { userId, name };
}

/** 수행 기공소 계정만 담당 기사를 바꾼다. 서버 플래그가 있으면 그걸 따른다. */
export function viewerCanAssignLabTechnician(
  row: {
    isAccepted?: boolean | null;
    isDownloaded?: boolean | null;
    requestorDownloadedAt?: string | null;
    requestorAcceptedAt?: string | null;
    workCanceledAt?: string | null;
    performingLabAnchorId?: string | null;
    canAssignLabTechnician?: boolean | null;
  } | null | undefined,
  viewerAnchorId?: string | null,
): boolean {
  if (!row || String(row.workCanceledAt || "").trim()) return false;
  const accepted =
    Boolean(row.isAccepted) ||
    Boolean(row.isDownloaded) ||
    Boolean(String(row.requestorDownloadedAt || row.requestorAcceptedAt || "").trim());
  if (!accepted) return false;
  if (row.canAssignLabTechnician) return true;
  const performing = String(row.performingLabAnchorId || "").trim();
  const viewer = String(viewerAnchorId || "").trim();
  return Boolean(performing && viewer && performing === viewer);
}
