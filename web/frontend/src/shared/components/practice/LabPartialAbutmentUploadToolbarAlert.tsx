// related files:
// - web/frontend/src/shared/practice/practiceTransferPartialAbutmentUpload.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// change-log:
// - 2026-11-07: 기공소 수신 캘린더 툴바 — 당일 어벗 STL 일부 미업로드 깜빡임 경고.

import { AlertTriangle } from "lucide-react";
import { listPracticeTransferPendingAbutmentTeeth } from "@/shared/practice/practiceTransferPartialAbutmentUpload";
import type { PracticeTransferLabReceiveItem } from "@/shared/practice/practiceTransferLabReceive";
import { resolvePracticeTransferListPatientName } from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import type { RoundBarCatalogRow } from "@/shared/practice/roundBarAbutment";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";

type LabPartialAbutmentUploadToolbarAlertProps = {
  transfers: PracticeTransferLabReceiveItem[];
  catalog?: RoundBarCatalogRow[];
  onSelect?: (transfer: PracticeTransferLabReceiveItem) => void;
  className?: string;
};

function buildLabel(
  transfer: PracticeTransferLabReceiveItem,
  catalog: RoundBarCatalogRow[],
  totalCount: number,
): string {
  if (totalCount > 1) {
    return `어벗 STL 미업로드 ${totalCount}건. 오늘 안에 올려 주세요.`;
  }
  const patient = resolvePracticeTransferListPatientName(transfer) || "환자";
  const pending = listPracticeTransferPendingAbutmentTeeth(transfer, catalog);
  const toothPart = pending.length > 0 ? pending.join(", ") : "나머지";
  return `${patient} · ${toothPart} 어벗 STL을 오늘 안에 업로드해 주세요.`;
}

/**
 * 기공소 수신 캘린더 툴바(월 네비 오른쪽) — 당일 부분 업로드 독촉.
 * CONTENT_MEASURED_CHROME: flex-1/w-full 금지.
 */
export function LabPartialAbutmentUploadToolbarAlert({
  transfers,
  catalog = [],
  onSelect,
  className,
}: LabPartialAbutmentUploadToolbarAlertProps) {
  if (!Array.isArray(transfers) || transfers.length === 0) return null;
  const first = transfers[0];
  if (!first) return null;
  const label = buildLabel(first, catalog, transfers.length);

  return (
    <button
      type="button"
      role="status"
      onClick={() => onSelect?.(first)}
      className={cn(
        CONTENT_MEASURED_CHROME_CLASS,
        "lab-partial-abutment-upload-attention inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-xs font-semibold text-amber-950 sm:text-[13px]",
        onSelect ? "cursor-pointer" : "cursor-default",
        className,
      )}
      title="같은 기공의뢰에서 일부 치아만 어벗 STL이 올라왔습니다. 클릭하면 해당 의뢰를 엽니다."
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
