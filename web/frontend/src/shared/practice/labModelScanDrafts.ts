// related files:
// - web/frontend/src/pages/requestor/practice/LabModelScanComposeDialog.tsx
// - web/frontend/src/pages/requestor/practice/LabModelScanDraftPanels.tsx
// - 2026-11-28: 기공소 모델스캔 임시저장·휴지통. 브라우저에만 둔다.
import { useEffect, useMemo, useState } from "react";
import { isPracticeTransferDraftStaleHighlight } from "@/shared/practice/practiceTransferDraft";

const STORAGE_PREFIX = "abutsfit:lab-model-scan-drafts:v1:";
const CHANGE_EVENT = "abutsfit:lab-model-scan-drafts";
const MAX_DRAFTS = 40;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export type LabModelScanDraftFile = {
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
};

export type LabModelScanDraft = {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  clinicLabel: string;
  patientName: string;
  doctorName: string;
  orderYmd: string;
  arrivalYmd: string;
  requestMemo: string;
  toothWorks: unknown[];
  isRemake: boolean;
  files: LabModelScanDraftFile[];
};

const storageKey = (userId: string) =>
  `${STORAGE_PREFIX}${String(userId || "").trim() || "anon"}`;

const notify = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const asFile = (value: unknown): LabModelScanDraftFile | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as LabModelScanDraftFile;
  const s3Key = String(row.s3Key || "").trim();
  const originalName = String(row.originalName || "").trim();
  if (!s3Key || !originalName) return null;
  return {
    originalName,
    mimetype: String(row.mimetype || "").trim(),
    size: Number(row.size || 0) || 0,
    s3Key,
  };
};

const asDraft = (value: unknown): LabModelScanDraft | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as LabModelScanDraft;
  const id = String(row.id || "").trim();
  const patientName = String(row.patientName || "").trim();
  if (!id || !patientName) return null;
  const files = Array.isArray(row.files)
    ? row.files.map(asFile).filter((file): file is LabModelScanDraftFile => Boolean(file))
    : [];
  return {
    id,
    updatedAt: String(row.updatedAt || "").trim() || new Date().toISOString(),
    deletedAt: row.deletedAt ? String(row.deletedAt) : null,
    clinicLabel: String(row.clinicLabel || "").trim(),
    patientName,
    doctorName: String(row.doctorName || "").trim(),
    orderYmd: String(row.orderYmd || "").trim(),
    arrivalYmd: String(row.arrivalYmd || "").trim(),
    requestMemo: String(row.requestMemo || ""),
    toothWorks: Array.isArray(row.toothWorks) ? row.toothWorks : [],
    isRemake: Boolean(row.isRemake),
    files,
  };
};

const readAll = (userId: string): LabModelScanDraft[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.drafts)
        ? parsed.drafts
        : [];
    return rows
      .map(asDraft)
      .filter((row): row is LabModelScanDraft => Boolean(row));
  } catch {
    return [];
  }
};

const writeAll = (userId: string, drafts: LabModelScanDraft[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(drafts.slice(0, MAX_DRAFTS)),
    );
  } catch {
    // 용량 초과면 이번 저장만 건너뛴다.
  }
  notify();
};

const isExpired = (updatedAt: string, now: number) => {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return false;
  return now - ts > KEEP_MS;
};

export function purgeExpiredLabModelScanDrafts(userId: string, now = Date.now()) {
  const rows = readAll(userId);
  const next = rows.filter((row) => !isExpired(row.updatedAt, now));
  if (next.length === rows.length) return;
  writeAll(userId, next);
}

export function listLabModelScanDrafts(userId: string, trashed: boolean) {
  return readAll(userId)
    .filter((row) => Boolean(row.deletedAt) === trashed)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function upsertLabModelScanDraft(userId: string, draft: LabModelScanDraft) {
  const next = asDraft(draft);
  if (!next) return;
  const rows = readAll(userId).filter((row) => row.id !== next.id);
  writeAll(userId, [next, ...rows]);
}

export function trashLabModelScanDraft(userId: string, id: string) {
  const key = String(id || "").trim();
  if (!key) return;
  const now = new Date().toISOString();
  writeAll(
    userId,
    readAll(userId).map((row) =>
      row.id === key ? { ...row, deletedAt: row.deletedAt || now, updatedAt: now } : row,
    ),
  );
}

export function restoreLabModelScanDraft(userId: string, id: string) {
  const key = String(id || "").trim();
  if (!key) return;
  const now = new Date().toISOString();
  writeAll(
    userId,
    readAll(userId).map((row) =>
      row.id === key ? { ...row, deletedAt: null, updatedAt: now } : row,
    ),
  );
}

export function purgeLabModelScanDraft(userId: string, id: string) {
  const key = String(id || "").trim();
  if (!key) return;
  writeAll(
    userId,
    readAll(userId).filter((row) => row.id !== key),
  );
}

export function subscribeLabModelScanDrafts(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useLabModelScanDrafts(userId: string) {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeLabModelScanDrafts(() => setVersion((n) => n + 1)), []);
  useEffect(() => {
    purgeExpiredLabModelScanDrafts(userId);
  }, [userId, version]);
  return useMemo(() => {
    void version;
    const active = listLabModelScanDrafts(userId, false);
    const trashed = listLabModelScanDrafts(userId, true);
    return {
      active,
      trashed,
      activeCount: active.length,
      trashCount: trashed.length,
      hasStale: active.some((row) =>
        isPracticeTransferDraftStaleHighlight(row.updatedAt),
      ),
    };
  }, [userId, version]);
}
