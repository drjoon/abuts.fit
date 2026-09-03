// related files:
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// change-log:
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
import { Fragment, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL,
  LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL,
  LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL,
  LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ONLY,
  LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED,
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
  /** 어벗 디자인 STL이 올라간 치아 — 해당 번호에 취소줄 */
  uploadedAbutmentTeeth?: Iterable<string> | null;
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

/** 모달 안내 전용 — `11, 21` (업로드된 번호은 굵은 취소선 + 완료 색) */
function ToothNumberDetail({
  rows,
  struckTeeth,
}: {
  rows: ToothWorkSelection[];
  struckTeeth?: Set<string>;
}) {
  const parts = rows
    .map((row) => String(row.toothNumber || "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="font-medium">
      {parts.map((tooth, index) => {
        const uploaded = Boolean(struckTeeth?.has(tooth));
        return (
          <Fragment key={`${tooth}-${index}`}>
            {index > 0 ? ", " : null}
            <span
              title={uploaded ? "어벗 디자인 업로드 완료" : undefined}
              className={
                uploaded
                  ? "text-emerald-700 line-through decoration-emerald-700 decoration-[2.5px] dark:text-emerald-300 dark:decoration-emerald-300"
                  : undefined
              }
            >
              {tooth}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

function GuideLine({
  label,
  detail,
}: {
  label: string;
  detail: ReactNode;
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
    </p>
  );
}

function resolveTooltipBody(
  hasPending: boolean,
  hasAbuts: boolean,
  ordered: boolean,
) {
  if (hasPending && hasAbuts) {
    return ordered
      ? LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED
      : LAB_PENDING_ABUTMENT_TOOLTIP_MIXED;
  }
  if (hasPending) return LAB_PENDING_ABUTMENT_TOOLTIP_SELF_ONLY;
  return ordered
    ? LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED
    : LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ONLY;
}

/**
 * 기공소 수신: 미제공(요청중·도입중) CA · 어벗츠 제공 CA 안내.
 * `기공소 자체 처리 — {치아}` / `어벗츠 생산의뢰[ 완료] — {치아}`
 * 심플어벗은 제외. 호버 시 상세 툴팁(앱 기본 600ms).
 */
export function LabPendingAbutmentGuide({
  toothWorks,
  abutsProductionOrdered = false,
  uploadedAbutmentTeeth = null,
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
  const tooltipBody = resolveTooltipBody(
    pendingRows.length > 0,
    abutsRows.length > 0,
    ordered,
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
          {pendingRows.length > 0 ? (
            <GuideLine
              label={LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL}
              detail={
                <ToothNumberDetail rows={pendingRows} />
              }
            />
          ) : null}
          {abutsRows.length > 0 ? (
            <GuideLine
              label={abutsLabel}
              detail={
                <ToothNumberDetail
                  rows={abutsRows}
                  struckTeeth={struckTeeth}
                />
              }
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
