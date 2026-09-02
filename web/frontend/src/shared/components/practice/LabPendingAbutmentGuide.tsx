// related files:
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// change-log:
// - 2026-09-02: 라벨「기공소 자체 처리」·호버 상세 툴팁.
// - 2026-09-02: 어벗츠 생산의뢰 완료(업로드 후) 라벨 표시.
// - 2026-09-02: 자체 처리·어벗츠 생산의뢰 치아를 각각 표시. 문구 단문화.
// - 2026-08-23: `{치아} : 어벗츠 미제공 커스텀어벗은…` 한 줄 형식.
// - 2026-08-23: 채팅 높이 확보 — 치아 상세를 한 줄(인라인)로 압축.
// - 2026-08-21: 미제공 CA 안내 문구 단문화(INTRO/OUTRO).
// - 2026-08-21: 미제공 CA 안내 — 치아·임플란트 상세 + 기공소 자체 처리 문구.
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatPendingLabAbutmentDetailLine,
} from "@/shared/practice/practiceTransferLabReceive";
import {
  LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL,
  LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL,
  LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL,
  LAB_PENDING_ABUTMENT_TOOLTIP_MIXED,
  LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED,
  LAB_PENDING_ABUTMENT_TOOLTIP_SELF_ONLY,
} from "@/shared/practice/roundBarAbutment";
import {
  isPendingRoundBarAbutment,
  isSimpleAbutmentModeForFee,
} from "@/shared/practice/labFeeSchedule";
import {
  toToothMemoSortNumber,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type LabPendingAbutmentGuideProps = {
  toothWorks?: ToothWorkSelection[] | null;
  /** @deprecated 어벗츠 대상은 toothWorks에서 자동 판별 */
  mixedWithAbuts?: boolean;
  /** STL 업로드·제조사 큐 등록 후 — 「어벗츠 생산의뢰 완료」 */
  abutsProductionOrdered?: boolean;
  className?: string;
};

function sortByTooth(rows: ToothWorkSelection[]) {
  return rows.slice().sort(
    (a, b) =>
      toToothMemoSortNumber(a.toothNumber) -
      toToothMemoSortNumber(b.toothNumber),
  );
}

function listPendingRows(toothWorks: ToothWorkSelection[] | null | undefined) {
  if (!Array.isArray(toothWorks) || toothWorks.length === 0) return [];
  return sortByTooth(
    toothWorks.filter(
      (row) => Boolean(row.customAbutment) && isPendingRoundBarAbutment(row),
    ),
  );
}

function listAbutsOrderRows(
  toothWorks: ToothWorkSelection[] | null | undefined,
) {
  if (!Array.isArray(toothWorks) || toothWorks.length === 0) return [];
  return sortByTooth(
    toothWorks.filter(
      (row) =>
        Boolean(row.customAbutment) &&
        !isSimpleAbutmentModeForFee(row) &&
        !isPendingRoundBarAbutment(row),
    ),
  );
}

function formatDetailList(rows: ToothWorkSelection[]) {
  return rows.map((row) => formatPendingLabAbutmentDetailLine(row)).join(", ");
}

function GuideLine({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
      <span className="font-medium">{label}</span>
      {" — "}
      <span className="font-medium">{detail}</span>
    </p>
  );
}

function resolveTooltipBody(hasAbuts: boolean, ordered: boolean) {
  if (!hasAbuts) return LAB_PENDING_ABUTMENT_TOOLTIP_SELF_ONLY;
  if (ordered) return LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED;
  return LAB_PENDING_ABUTMENT_TOOLTIP_MIXED;
}

/**
 * 기공소 수신: 어벗츠 미제공(요청중) CA + 어벗츠 생산의뢰 대상 안내.
 * `기공소 자체 처리 — {치아}` / `어벗츠 생산의뢰[ 완료] — {치아}`
 * 호버 시 상세 툴팁(앱 기본 600ms).
 */
export function LabPendingAbutmentGuide({
  toothWorks,
  abutsProductionOrdered = false,
  className,
}: LabPendingAbutmentGuideProps) {
  const pendingRows = listPendingRows(toothWorks);
  if (pendingRows.length === 0) return null;

  const abutsRows = listAbutsOrderRows(toothWorks);
  const abutsLabel = abutsProductionOrdered
    ? LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL
    : LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL;
  const tooltipBody = resolveTooltipBody(
    abutsRows.length > 0,
    abutsProductionOrdered,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "w-fit max-w-full cursor-help space-y-0.5",
            className,
          )}
        >
          <GuideLine
            label={LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL}
            detail={formatDetailList(pendingRows)}
          />
          {abutsRows.length > 0 ? (
            <GuideLine
              label={abutsLabel}
              detail={formatDetailList(abutsRows)}
            />
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
        {tooltipBody}
      </TooltipContent>
    </Tooltip>
  );
}
