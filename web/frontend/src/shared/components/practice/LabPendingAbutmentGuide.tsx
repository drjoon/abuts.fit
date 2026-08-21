// related files:
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// change-log:
// - 2026-08-21: 미제공 CA 안내 문구 단문화(INTRO/OUTRO).
// - 2026-08-21: 미제공 CA 안내 — 치아·임플란트 상세 + 기공소 자체 처리 문구.
import {
  formatPendingLabAbutmentDetailLine,
} from "@/shared/practice/practiceTransferLabReceive";
import {
  LAB_PENDING_ABUTMENT_GUIDE_INTRO,
  LAB_PENDING_ABUTMENT_GUIDE_OUTRO,
  LAB_PENDING_ABUTMENT_MIXED_GUIDE_INTRO,
  LAB_PENDING_ABUTMENT_MIXED_GUIDE_OUTRO,
} from "@/shared/practice/roundBarAbutment";
import { isPendingRoundBarAbutment } from "@/shared/practice/labFeeSchedule";
import {
  toToothMemoSortNumber,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export type LabPendingAbutmentGuideProps = {
  toothWorks?: ToothWorkSelection[] | null;
  /** 어벗츠 CNC 대상과 혼재 */
  mixedWithAbuts?: boolean;
  className?: string;
};

function listPendingRows(toothWorks: ToothWorkSelection[] | null | undefined) {
  if (!Array.isArray(toothWorks) || toothWorks.length === 0) return [];
  return toothWorks
    .filter((row) => Boolean(row.customAbutment) && isPendingRoundBarAbutment(row))
    .slice()
    .sort(
      (a, b) =>
        toToothMemoSortNumber(a.toothNumber) -
        toToothMemoSortNumber(b.toothNumber),
    );
}

/**
 * 기공소 수신: 어벗츠 미제공 임플란트(요청중 CA) 안내.
 * 인트로 → 치아·임플란트 상세 → 자체 처리 안내.
 */
export function LabPendingAbutmentGuide({
  toothWorks,
  mixedWithAbuts = false,
  className,
}: LabPendingAbutmentGuideProps) {
  const pendingRows = listPendingRows(toothWorks);
  if (pendingRows.length === 0) return null;

  const intro = mixedWithAbuts
    ? LAB_PENDING_ABUTMENT_MIXED_GUIDE_INTRO
    : LAB_PENDING_ABUTMENT_GUIDE_INTRO;
  const outro = mixedWithAbuts
    ? LAB_PENDING_ABUTMENT_MIXED_GUIDE_OUTRO
    : LAB_PENDING_ABUTMENT_GUIDE_OUTRO;

  return (
    <div
      className={
        className
          ? `space-y-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200 ${className}`
          : "space-y-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200"
      }
    >
      <p>{intro}</p>
      <ul className="list-none space-y-0.5 pl-0 font-medium">
        {pendingRows.map((row) => {
          const tooth = String(row.toothNumber || "").trim() || "—";
          return (
            <li key={`pending-ca-${tooth}-${formatPendingLabAbutmentDetailLine(row)}`}>
              {formatPendingLabAbutmentDetailLine(row)}
            </li>
          );
        })}
      </ul>
      <p>{outro}</p>
    </div>
  );
}
