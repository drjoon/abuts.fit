// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/practice/practiceTransferAccept.ts
// - web/backend/services/practiceTransferProduction.service.js
// - 2026-09-12: 의뢰 파일 업로드 웨이브(첫/두 번째/…) 클러스터 SSOT.

export type PracticeTransferFileWaveItem = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
  uploadBatchId?: string | null;
  uploadedAt?: string | null;
};

export type PracticeTransferFileWave = {
  batchId: string;
  uploadedAt: string | null;
  label: string;
  files: PracticeTransferFileWaveItem[];
};

const LEGACY_BATCH_ID = "__legacy__";

export const formatPracticeUploadWaveLabel = (index: number): string => {
  if (index <= 0) return "첫 업로드";
  if (index === 1) return "두 번째 업로드";
  if (index === 2) return "세 번째 업로드";
  return `${index + 1}번째 업로드`;
};

export const formatPracticeUploadWaveTime = (
  uploadedAt: string | null | undefined,
): string => {
  const raw = String(uploadedAt || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "";
  }
};

/**
 * uploadBatchId 기준 웨이브 묶음. 없으면 전부시(첫 업로드) 한 그룹.
 * 시각(uploadedAt) 오름차순 → 첫/두 번째/…
 */
export const clusterPracticeTransferFileWaves = (
  files: PracticeTransferFileWaveItem[],
): PracticeTransferFileWave[] => {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return [];

  const groups = new Map<
    string,
    { uploadedAtMs: number; uploadedAt: string | null; files: PracticeTransferFileWaveItem[] }
  >();

  for (const file of list) {
    const batchId = String(file.uploadBatchId || "").trim() || LEGACY_BATCH_ID;
    const uploadedAt = String(file.uploadedAt || "").trim() || null;
    const uploadedAtMs = uploadedAt ? new Date(uploadedAt).getTime() : Number.NaN;
    const prev = groups.get(batchId);
    if (!prev) {
      groups.set(batchId, {
        uploadedAtMs: Number.isFinite(uploadedAtMs) ? uploadedAtMs : Number.POSITIVE_INFINITY,
        uploadedAt,
        files: [file],
      });
      continue;
    }
    prev.files.push(file);
    if (Number.isFinite(uploadedAtMs) && uploadedAtMs < prev.uploadedAtMs) {
      prev.uploadedAtMs = uploadedAtMs;
      prev.uploadedAt = uploadedAt;
    }
  }

  const ordered = [...groups.entries()].sort((a, b) => {
    const aMs = a[1].uploadedAtMs;
    const bMs = b[1].uploadedAtMs;
    if (aMs !== bMs) return aMs - bMs;
    return a[0].localeCompare(b[0]);
  });

  return ordered.map(([batchId, group], index) => ({
    batchId,
    uploadedAt: group.uploadedAt,
    label: formatPracticeUploadWaveLabel(index),
    files: group.files,
  }));
};
