// related files:
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// change-log:
// - 2026-09-12: 준비 단계 — 치아번호 클릭=개별 취소 · (전체취소). 상태 문구 비표시.
// - 2026-09-12: 생산의뢰 완료 — (준비: 취소 가능) 클릭 취소 · (가공: 취소 불가).
// - 2026-09-11: 어벗츠 생산의뢰 줄 오른쪽 trailing(업로드 대기 배지).
// - 2026-09-03: 업로드 치아 — 에메랄드 + 굵은 취소선(decoration-2.5px).
// - 2026-09-03: 어벗 STL 업로드된 치아는 번호에 취소줄(line-through).
// - 2026-09-03: 모달 안내 상세는 치아번호만(`11, 21`). 임플란트 스펙은 의뢰 상세 등 다른 UI 유지.
// - 2026-09-02: 어벗츠 제공 CA만 있어도 안내 표시. 심플어벗은 항상 제외.
// - 2026-09-02: 미제공 안내 — 심플어벗(치과 재고)은 자체 처리 목록에서 제외.
// - 2026-09-02: 라벨「기공소 자체 처리」·호버 상세 툴팁.
// - 2026-09-02: 어벗츠 생산의뢰 완료(업로드 후) 라벨 표시.
// - 2026-09-02: 자체 처리·어벗츠 생산의뢰 치아를 각각 표시. 문구 단문화.
// - 2026-08-23: `{치아} : 어벗츠 미제공 커스텀어벗은…` 한 줄 형식.
// - 2026-08-23: 채팅 높이 확보 — 치아 상세를 한 줄(인라인)로 압축.
// - 2026-08-21: 미제공 CA 안내 문구 단문화(INTRO/OUTRO).
// - 2026-08-21: 미제공 CA 안내 — 치아·임플란트 상세 + 기공소 자체 처리 문구.
import { Fragment, type MouseEvent, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL,
  LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL,
  LAB_PENDING_ABUTMENT_CANCEL_ALL_SUFFIX,
  LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL,
  LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ONLY,
  LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED,
  LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED_BLOCKED,
  LAB_PENDING_ABUTMENT_TOOLTIP_MIXED,
  LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED,
  LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED_BLOCKED,
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

/** 생산의뢰 완료 줄 — 준비일 때만 취소 CTA (`ready`) */
export type LabPendingAbutsCancelAffinity = "ready" | "past_ready";

export type LabPendingAbutmentGuideProps = {
  toothWorks?: ToothWorkSelection[] | null;
  /** @deprecated 어벗츠 대상은 toothWorks에서 자동 판별 */
  mixedWithAbuts?: boolean;
  /** STL 업로드·제조사 큐 등록 후 — 「어벗츠 생산의뢰 완료」 */
  abutsProductionOrdered?: boolean;
  /**
   * 생산의뢰 완료일 때.
   * ready → 치아·(전체취소) 클릭 / past_ready → 취소 CTA 없음(리메이크는 바에서)
   */
  abutsCancelAffinity?: LabPendingAbutsCancelAffinity | null;
  /** ready — (전체취소) */
  onAbutsCancelAllClick?: (event: MouseEvent) => void;
  /** ready — 업로드된 치아번호 클릭 → 해당 치아만 취소 */
  onAbutsToothCancelClick?: (tooth: string, event: MouseEvent) => void;
  abutsCancelBusy?: boolean;
  /** 어벗 디자인 STL이 올라간 치아 — 번호에 취소줄 */
  uploadedAbutmentTeeth?: Iterable<string> | null;
  /** 어벗츠 생산의뢰 줄 맨 오른쪽(예: [업로드 대기] 배지) */
  abutsTrailing?: ReactNode;
  className?: string;
};

function sortByTooth(rows: ToothWorkSelection[]) {
  return rows.slice().sort(
    (a, b) =>
      toToothMemoSortNumber(a.toothNumber) -
      toToothMemoSortNumber(b.toothNumber),
  );
}

/** 커스텀어벗만 — 심플어벗(치과 재고)은 항상 제외 */
function isCustomAbutmentGuideRow(row: ToothWorkSelection) {
  return Boolean(row.customAbutment) && !isSimpleAbutmentModeForFee(row);
}

function listPendingRows(toothWorks: ToothWorkSelection[] | null | undefined) {
  if (!Array.isArray(toothWorks) || toothWorks.length === 0) return [];
  return sortByTooth(
    toothWorks.filter(
      (row) => isCustomAbutmentGuideRow(row) && isPendingRoundBarAbutment(row),
    ),
  );
}

function listAbutsOrderRows(
  toothWorks: ToothWorkSelection[] | null | undefined,
) {
  if (!Array.isArray(toothWorks) || toothWorks.length === 0) return [];
  return sortByTooth(
    toothWorks.filter(
      (row) => isCustomAbutmentGuideRow(row) && !isPendingRoundBarAbutment(row),
    ),
  );
}

function toUploadedToothSet(
  uploadedAbutmentTeeth: Iterable<string> | null | undefined,
) {
  const set = new Set<string>();
  if (!uploadedAbutmentTeeth) return set;
  for (const raw of uploadedAbutmentTeeth) {
    const tooth = String(raw || "").trim();
    if (tooth) set.add(tooth);
  }
  return set;
}

const uploadedToothClass =
  "text-emerald-700 line-through decoration-emerald-700 decoration-[2.5px] dark:text-emerald-300 dark:decoration-emerald-300";

/** 모달 안내 전용 — `11, 21` (업로드 번호 취소선 · ready면 클릭 취소) */
function ToothNumberDetail({
  rows,
  struckTeeth,
  cancelable,
  cancelBusy,
  onToothCancel,
}: {
  rows: ToothWorkSelection[];
  struckTeeth?: Set<string>;
  cancelable?: boolean;
  cancelBusy?: boolean;
  onToothCancel?: (tooth: string, event: MouseEvent) => void;
}) {
  const parts = rows
    .map((row) => String(row.toothNumber || "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="font-medium">
      {parts.map((tooth, index) => {
        const uploaded = Boolean(struckTeeth?.has(tooth));
        const canClick =
          cancelable && uploaded && typeof onToothCancel === "function";
        return (
          <Fragment key={`${tooth}-${index}`}>
            {index > 0 ? ", " : null}
            {canClick ? (
              <button
                type="button"
                disabled={cancelBusy}
                title={`치아 #${tooth} 어벗 취소`}
                className={cn(
                  uploadedToothClass,
                  "rounded-sm px-0.5 transition-colors",
                  "hover:bg-sky-100/90 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
                  "disabled:pointer-events-none disabled:opacity-60",
                  "dark:hover:bg-sky-950/50 dark:hover:text-sky-200",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onToothCancel?.(tooth, event);
                }}
              >
                {tooth}
              </button>
            ) : (
              <span
                title={uploaded ? "어벗 디자인 업로드 완료" : undefined}
                className={uploaded ? uploadedToothClass : undefined}
              >
                {tooth}
              </span>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

function GuideLine({
  label,
  detail,
  suffix,
}: {
  label: string;
  detail: ReactNode;
  suffix?: ReactNode;
}) {
  return (
    <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
      <span className="font-medium">{label}</span>
      {" — "}
      {typeof detail === "string" ? (
        <span className="font-medium">{detail}</span>
      ) : (
        detail
      )}
      {suffix ? (
        <>
          {" "}
          {suffix}
        </>
      ) : null}
    </p>
  );
}

function resolveTooltipBody(
  hasPending: boolean,
  hasAbuts: boolean,
  ordered: boolean,
  cancelAffinity: LabPendingAbutsCancelAffinity | null | undefined,
) {
  if (hasPending && hasAbuts) {
    if (!ordered) return LAB_PENDING_ABUTMENT_TOOLTIP_MIXED;
    return cancelAffinity === "past_ready"
      ? LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED_BLOCKED
      : LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED;
  }
  if (hasPending) return LAB_PENDING_ABUTMENT_TOOLTIP_SELF_ONLY;
  if (!ordered) return LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ONLY;
  return cancelAffinity === "past_ready"
    ? LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED_BLOCKED
    : LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED;
}

/**
 * 기공소 수신: 미제공(요청중·도입중) CA · 어벗츠 제공 CA 안내.
 * `기공소 자체 처리 — {치아}` / `어벗츠 생산의뢰[ 완료] — {치아} [(전체취소)]`
 * 심플어벗은 제외. 호버 시 상세 툴팁(앱 기본 600ms).
 */
export function LabPendingAbutmentGuide({
  toothWorks,
  abutsProductionOrdered = false,
  abutsCancelAffinity = null,
  onAbutsCancelAllClick,
  onAbutsToothCancelClick,
  abutsCancelBusy = false,
  uploadedAbutmentTeeth = null,
  abutsTrailing = null,
  className,
}: LabPendingAbutmentGuideProps) {
  const pendingRows = listPendingRows(toothWorks);
  const abutsRows = listAbutsOrderRows(toothWorks);
  if (pendingRows.length === 0 && abutsRows.length === 0) return null;

  const struckTeeth = toUploadedToothSet(uploadedAbutmentTeeth);
  const allAbutsUploaded =
    abutsRows.length > 0 &&
    abutsRows.every((row) =>
      struckTeeth.has(String(row.toothNumber || "").trim()),
    );
  const ordered = abutsProductionOrdered || allAbutsUploaded;
  const abutsLabel = ordered
    ? LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL
    : LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL;
  // 준비면 부분 업로드 중에도 치아·전체취소(상태 문구는 비표시)
  const cancelAffinity = abutsCancelAffinity;
  const readyCancel = cancelAffinity === "ready";
  const tooltipBody = resolveTooltipBody(
    pendingRows.length > 0,
    abutsRows.length > 0,
    ordered,
    cancelAffinity,
  );

  const cancelAllSuffix =
    readyCancel && typeof onAbutsCancelAllClick === "function" ? (
      <button
        type="button"
        disabled={abutsCancelBusy}
        className={cn(
          "font-semibold text-sky-700 underline-offset-2",
          "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
          "disabled:pointer-events-none disabled:opacity-60",
          "dark:text-sky-300",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onAbutsCancelAllClick(event);
        }}
      >
        {LAB_PENDING_ABUTMENT_CANCEL_ALL_SUFFIX}
      </button>
    ) : null;

  const abutsGuideLine = (
    <GuideLine
      label={abutsLabel}
      detail={
        <ToothNumberDetail
          rows={abutsRows}
          struckTeeth={struckTeeth}
          cancelable={readyCancel}
          cancelBusy={abutsCancelBusy}
          onToothCancel={onAbutsToothCancelClick}
        />
      }
      suffix={cancelAllSuffix}
    />
  );

  const abutsLine =
    abutsRows.length > 0 ? (
      <div className="flex w-full min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "min-w-0 flex-1",
                readyCancel ? "cursor-default" : "cursor-help",
              )}
            >
              {abutsGuideLine}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-xs text-xs leading-relaxed"
          >
            {readyCancel && abutsCancelBusy ? "처리 중..." : tooltipBody}
          </TooltipContent>
        </Tooltip>
        {abutsTrailing ? (
          <div className="ml-auto shrink-0">{abutsTrailing}</div>
        ) : null}
      </div>
    ) : null;

  const pendingLine =
    pendingRows.length > 0 ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-fit max-w-full cursor-help">
            <GuideLine
              label={LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL}
              detail={<ToothNumberDetail rows={pendingRows} />}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs text-xs leading-relaxed"
        >
          {tooltipBody}
        </TooltipContent>
      </Tooltip>
    ) : null;

  return (
    <div className={cn("w-full max-w-full space-y-0.5", className)}>
      {pendingLine}
      {abutsLine}
    </div>
  );
}
