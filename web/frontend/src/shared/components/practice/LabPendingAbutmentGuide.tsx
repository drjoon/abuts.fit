// related files:
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// change-log:
// - 2026-08-23: `{치아} : 어벗츠 미제공 커스텀어벗은…` 한 줄 형식.
// - 2026-08-23: 채팅 높이 확보 — 치아 상세를 한 줄(인라인)로 압축.
// - 2026-08-21: 미제공 CA 안내 문구 단문화(INTRO/OUTRO).
// - 2026-08-21: 미제공 CA 안내 — 치아·임플란트 상세 + 기공소 자체 처리 문구.
import {
  formatPendingLabAbutmentDetailLine,
} from "@/shared/practice/practiceTransferLabReceive";
import {
  LAB_PENDING_ABUTMENT_GUIDE_BODY,
  LAB_PENDING_ABUTMENT_MIXED_GUIDE_BODY,
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
 * `{치아 상세} : {안내}` 한 줄.
 */
export function LabPendingAbutmentGuide({
  toothWorks,
  mixedWithAbuts = false,
  className,
}: LabPendingAbutmentGuideProps) {
  const pendingRows = listPendingRows(toothWorks);
  if (pendingRows.length === 0) return null;

  const body = mixedWithAbuts
    ? LAB_PENDING_ABUTMENT_MIXED_GUIDE_BODY
    : LAB_PENDING_ABUTMENT_GUIDE_BODY;
  const detail = pendingRows
    .map((row) => formatPendingLabAbutmentDetailLine(row))
    .join(", ");

  return (
    <p
      className={
        className
          ? `text-xs leading-snug text-amber-800 dark:text-amber-200 ${className}`
          : "text-xs leading-snug text-amber-800 dark:text-amber-200"
      }
    >
      <span className="font-medium">{detail}</span>
      {" : "}
      {body}
    </p>
  );
}
