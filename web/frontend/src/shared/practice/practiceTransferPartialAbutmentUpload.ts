// related files:
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/LabPartialAbutmentUploadToolbarAlert.tsx
// change-log:
// - 2026-11-07: PTX 다치아 — 당일 일부만 어벗 STL 업로드 시 기공소 헤더 경고용 판정.

import { toKstYmd } from "@/shared/date/kst";
import {
  countPracticeTransferDesignFiles,
  listPracticeTransferAbutsCustomAbutmentToothWorks,
  listPracticeTransferUploadedAbutmentTeeth,
  practiceTransferNeedsMoreAbutmentDesigns,
  type PracticeTransferLabReceiveItem,
} from "@/shared/practice/practiceTransferLabReceive";
import type { RoundBarCatalogRow } from "@/shared/practice/roundBarAbutment";

/** designFiles.uploadedAt → 없으면 designReadyAt */
export function resolvePracticeTransferLatestAbutmentDesignAt(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
): Date | null {
  if (!transfer) return null;
  let latestMs = 0;
  const files = Array.isArray(transfer.production?.designFiles)
    ? transfer.production.designFiles
    : [];
  for (const row of files) {
    const raw = row?.uploadedAt;
    if (raw == null || raw === "") continue;
    const ms = new Date(String(raw)).getTime();
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }
  if (latestMs > 0) return new Date(latestMs);
  const ready = transfer.production?.designReadyAt;
  if (ready == null || ready === "") return null;
  const readyMs = new Date(String(ready)).getTime();
  return Number.isFinite(readyMs) && readyMs > 0 ? new Date(readyMs) : null;
}

/**
 * 동일 PTX에서 어벗 STL이 일부만 올랐고, 그 업로드가 KST 오늘인 경우.
 * (당일 나머지 업로드 독촉 — 기공소 수신 헤더 경고)
 */
export function isPracticeTransferSameDayPartialAbutmentUpload(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
  catalog: RoundBarCatalogRow[] = [],
  now: Date = new Date(),
): boolean {
  if (!transfer) return false;
  if (countPracticeTransferDesignFiles(transfer) <= 0) return false;
  if (!practiceTransferNeedsMoreAbutmentDesigns(transfer, catalog)) return false;
  const latest = resolvePracticeTransferLatestAbutmentDesignAt(transfer);
  if (!latest) return false;
  const todayYmd = toKstYmd(now);
  const uploadYmd = toKstYmd(latest);
  return Boolean(todayYmd && uploadYmd && todayYmd === uploadYmd);
}

export function listPracticeTransferPendingAbutmentTeeth(
  transfer: PracticeTransferLabReceiveItem | null | undefined,
  catalog: RoundBarCatalogRow[] = [],
): string[] {
  if (!transfer) return [];
  const uploaded = listPracticeTransferUploadedAbutmentTeeth(transfer, catalog);
  return listPracticeTransferAbutsCustomAbutmentToothWorks(transfer, catalog)
    .map((row) => String(row.toothNumber || "").trim())
    .filter((tooth) => tooth && !uploaded.has(tooth));
}
