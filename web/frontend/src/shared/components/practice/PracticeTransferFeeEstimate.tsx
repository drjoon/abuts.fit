// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - 2026-08-17: 견적 한줄 요약 — CA 디자인비(+지그)는 기공비, 어벗은 생산비만(툴팁 기공비 총액·어벗생산비와 일치).
// - 2026-08-17: 신속처리 시 디자인비(+지그)·어벗생산비 분해에도 rush 배수 적용.
// - 2026-08-16: 기공의뢰수신 카드 — 기공비·수령·수수료를 한 줄로 표시.
// - 2026-08-16: 기공소 카드 기공비=툴팁 라인 합(별점 확정가)+디자인. 스냅샷 상한과 불일치 방지.
// - 2026-08-16: 자동매칭 구간은 치과만. 기공소는 유효 별점 배수 단일 확정가.
// - 2026-08-16: 치과 견적 툴팁도 기공소와 동일 — 기공소몫|어벗츠몫 헤더·가운데 정렬·소계.
// - 2026-08-16: 크레딧 소비 총액에 배송비 합산. 배송 안내 → 총액 순.
// - 2026-08-16: 치과 툴팁 — CA 디자인+생산을 생산/디자인(+지그)로 분해, 배송비(치과→기공소·어벗츠) 안내.
// - 2026-08-16: 기공소몫|어벗츠몫 — slate 구분선, 수수료 수령을 기공비 총액 아래 정렬.
// - 2026-08-16: 기공소 몫 표 — 열·총액 가운데 정렬, 기공소몫|어벗츠몫 구분선.
// - 2026-08-16: 기공소 CA 지급 라벨 어벗디자인비 → 디자인비+지그제작비.
// - 2026-08-15: 기공소 뷰 어벗생산비 = 치과 납부(abutmentRetail) − 어벗디자인비.
// - 2026-08-15: 기공소 뷰 — 기공소몫(보철기공비·어벗디자인비) / 어벗츠몫(어벗생산비) 2단 헤더.
// - 2026-08-15: 기공소 수령 — 어벗디자인비를 기공비 총액에 합산 후 수수료 차감(연기 안내 제거).
// - 2026-08-15: 기공소 뷰 — 보철기공비|어벗디자인비|어벗생산비, 소계(열별)+기공비 총액.
// - 2026-08-15: 기공소 뷰 — 어벗디자인비를 기공수가·어벗츠 몫 사이 컬럼으로 표시.
// - 2026-08-15: 기공소 뷰 — CA 시 어벗디자인비(플랫폼 단가×어벗수) 툴팁 행 추가.
// - 2026-08-14: 기공소 기공비 Off면 미설정 안내.
// - 2026-08-13: 치아번호 10→20→30→40번대 순으로 표시.
// - 2026-08-17: 번대 안은 임상 치식(18→11, 21→28, 31→38, 48→41).
// - 2026-08-14: 기공소 미선택 시 견적 계산 없이 안내만.
// - 2026-08-14: 환봉 단가 0원은 어벗츠 열에「별도 고지」.
// - 2026-08-14: 툴팁 컬럼 기공소 기공물 / 기공소 어벗 / 어벗츠 어벗. 환봉 요청중은 기공소 어벗.
// - 2026-08-14: 기공소 뷰 — 주 표기는 설정 수가. 수수료 수령은 보조. 총액 텍스트만 툴팁 트리거.
// - 2026-08-14: 기공소 툴팁 컬럼 기공수가/어벗츠 몫. 어벗츠 열은 금액 대신「커스텀어벗」표기.
// - 2026-08-14: 카드 density에서 trailingAction(기공수가 할증)을 총액 오른쪽 끝에 배치.
// - 2026-08-14: 할증 안내를「Nx 할증 적용」만 표시(견적은 생성 시 스냅샷 배수).
// - 2026-08-14: 자동매칭 예산 툴팁도 치아번호별 기공소·어벗츠 어벗 + 하한~상한 총액.
// - 2026-08-14: 치과-기공의뢰 견적에서 할증 문구 숨김(결과 가격만 표시).
// - 2026-08-14: 기공소 뷰만 총액 옆·툴팁에 할증 표기. 의뢰카드 trailingAction은 채팅 헤더로 이동.
// - 2026-08-14: 기공소 뷰는 설정 수가(labFeeTotal)를 제시. 수수료 차감 수령은 보조 표기.
// - 2026-08-14: 합산 라벨은「기공비」, 단위(툴팁 컬럼)는「기공수가」.
// - 2026-08-14: 수락·청구(billed) 후 치과는 예산 구간 대신「확정 기공비」표시.
// - 2026-08-16: 자동매칭 툴팁 — 합산 minLabFee 없어도 라인 labFeeMin으로 하한~상한 표시.
// - 2026-08-16: v4 고정수가 — min=max면 구간(~) 없이 단일가 표시. 예산 구간 안내 제거.
// - 2026-08-16: 수락·청구(billed) 후 치과 툴팁도 구간 제거·확정 단일가.
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  formatFeeRatePct,
  formatManWon,
  formatWonRange,
  sortPracticeTransferFeeLines,
  type PracticeTransferFeeQuote,
  type PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  formatLabFeeMultiplierLabel,
  formatRushFeeMultiplierLabel,
  normalizeConfiguredRushFeeMultiplier,
  normalizeLabFeeMultiplier,
  normalizeRushFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";
import { scaleAutoMatchFeeToLabStars } from "@/shared/practice/practiceLabRating";
import { useSystemSettings } from "@/hooks/useSystemSettings";

type PracticeTransferFeeEstimateProps = {
  quote: PracticeTransferFeeQuote;
  viewer: PracticeTransferFeeQuoteViewer;
  className?: string;
  /** compact: 상·하악 사이 / card: 의뢰카드 */
  density?: "chart" | "card";
  /** 기공소 미선택 — 기공비 미산출 안내 */
  labPending?: boolean;
  /** 카드 총액 오른쪽(선택) */
  trailingAction?: ReactNode;
  /** 지그 제작 불필요 — 기공소→치과 배송비 면제, 라벨은 디자인비 */
  skipJig?: boolean;
  /** 신속처리 할증 표기 */
  rushProcessing?: boolean;
  /** 기공소 뷰 — 자동매칭 기공비를 유효 별점 배수로 단일 확정 */
  labEffectiveStars?: number | null;
};

const formatCell = (value: number) => (value > 0 ? formatManWon(value) : "—");

type FeeBreakdownLine = {
  toothNumber: string;
  prosthesisType: string;
  labFee: number;
  labFeeMin?: number;
  labAbutmentFee: number;
  labAbutmentPending?: boolean;
  abutmentRetail: number;
  abutmentRetailNote?: "quote";
};

const formatLabAbutmentCell = (line: {
  labAbutmentFee: number;
  labAbutmentPending?: boolean;
}) => {
  if (line.labAbutmentFee > 0) return formatManWon(line.labAbutmentFee);
  if (line.labAbutmentPending) return "요청중";
  return "—";
};

const formatAbutsCell = (line: {
  abutmentRetail: number;
  abutmentRetailNote?: "quote";
}) => {
  if (line.abutmentRetail > 0) return formatManWon(line.abutmentRetail);
  if (line.abutmentRetailNote === "quote") return "별도 고지";
  return "—";
};

/** 기공소 뷰: 어벗생산비 = 치과 납부 − 어벗디자인비(멤버·일반 동일). */
const formatLabFacingAbutsProductionCell = (
  line: {
    abutmentRetail: number;
    abutmentRetailNote?: "quote";
  },
  designFee: number,
) => {
  if (line.abutmentRetailNote === "quote" && line.abutmentRetail <= 0) {
    return "별도 고지";
  }
  if (line.abutmentRetail <= 0) return "—";
  const production = Math.max(
    0,
    Math.round(Number(line.abutmentRetail || 0)) -
      Math.max(0, Math.round(Number(designFee || 0))),
  );
  return formatManWon(production);
};

const labFacingAbutsProductionAmount = (
  line: {
    abutmentRetail: number;
    abutmentRetailNote?: "quote";
  },
  designFee: number,
) => {
  if (line.abutmentRetail <= 0) return 0;
  return Math.max(
    0,
    Math.round(Number(line.abutmentRetail || 0)) -
      Math.max(0, Math.round(Number(designFee || 0))),
  );
};

const formatLabShareCell = (
  line: FeeBreakdownLine,
  labShare: number,
  labFacing: boolean,
) => {
  if (labFacing && labShare <= 0 && line.labAbutmentPending) return "요청중";
  // 치과만 하한~상한. 기공소는 설정 수가(단일).
  if (
    !labFacing &&
    line.labFeeMin != null &&
    Number.isFinite(line.labFeeMin)
  ) {
    const minShare = Math.max(0, Math.round(Number(line.labFeeMin)));
    if (minShare > 0 || labShare > 0) {
      return formatWonRange(minShare, labShare);
    }
    return "—";
  }
  return formatCell(labShare);
};

function FeeBreakdownTable({
  lines,
  showLabColumn,
  showLabAbutmentColumn,
  showAbutmentColumn,
  labFacing = false,
  labTotalMinOverride = null,
  labTotalMaxOverride = null,
  abutmentDesignLabFee = 0,
  abutmentDesignQty = 0,
  labSettlementHint = null,
  /** 치과·기공소 공통: CA 디자인비를 생산가와 분리 표시 */
  splitDesignFee = false,
  designFeeLabel = "디자인비+지그제작비",
}: {
  lines: FeeBreakdownLine[];
  showLabColumn: boolean;
  showLabAbutmentColumn: boolean;
  showAbutmentColumn: boolean;
  labFacing?: boolean;
  /** 라인에 labFeeMin이 없을 때 합계만 예산 하한~상한으로 표시 */
  labTotalMinOverride?: number | null;
  labTotalMaxOverride?: number | null;
  /** 어벗디자인비(1어벗당) — 기공소 몫 / 치과 툴팁 분해 */
  abutmentDesignLabFee?: number;
  abutmentDesignQty?: number;
  /** 기공비 총액 아래(기공소몫 가운데) 수수료 수령 안내 */
  labSettlementHint?: ReactNode;
  splitDesignFee?: boolean;
  designFeeLabel?: string;
}) {
  // 치과·기공소 공통: 기공소몫 | 어벗츠몫 2단 헤더(+ slate 구분선).
  // 기공소: 보철기공비(+어벗디자인비) | 어벗생산비.
  // 치과: 보철기공비·기공소어벗·디자인(+지그) | 어벗생산비. CA면 생산/디자인 분해.
  // 소계=열별 합산, 기공비 총액=기공소몫 합(보철+기공소어벗+디자인).
  const labShareColumn = labFacing
    ? showLabColumn || showLabAbutmentColumn
    : showLabColumn;
  const labAbutmentColumn = labFacing ? false : showLabAbutmentColumn;
  const abutsColumn = showAbutmentColumn;
  const unitDesignFee = Math.max(0, Math.round(Number(abutmentDesignLabFee || 0)));
  const designFeeColumn =
    splitDesignFee &&
    unitDesignFee > 0 &&
    Math.max(0, Math.round(Number(abutmentDesignQty || 0))) > 0;
  const designFeeForLine = (line: FeeBreakdownLine) => {
    if (!designFeeColumn) return 0;
    const hasCa =
      line.abutmentRetail > 0 || line.abutmentRetailNote === "quote";
    return hasCa ? unitDesignFee : 0;
  };
  const designFeeTotal = lines.reduce(
    (sum, line) => sum + designFeeForLine(line),
    0,
  );
  const abutsProductionTotal = lines.reduce(
    (sum, line) =>
      sum + labFacingAbutsProductionAmount(line, designFeeForLine(line)),
    0,
  );
  const abutsQuotePending = lines.some(
    (line) => line.abutmentRetailNote === "quote" && line.abutmentRetail <= 0,
  );
  const labSubtotal = lines.reduce(
    (sum, line) =>
      sum + line.labFee + (labFacing ? line.labAbutmentFee : 0),
    0,
  );
  const labAbutmentTotal = lines.reduce((sum, line) => sum + line.labAbutmentFee, 0);
  const labAbutmentPending = lines.some((line) => line.labAbutmentPending);
  // 기공소몫 합: 기공소는 labSubtotal에 어벗 포함, 치과는 labAbutment 열 별도.
  const labGrandTotal =
    labSubtotal + (labFacing ? 0 : labAbutmentTotal) + designFeeTotal;
  const labTotalMin = lines.reduce((sum, line) => {
    const min =
      line.labFeeMin != null && Number.isFinite(line.labFeeMin)
        ? Math.max(0, Math.round(Number(line.labFeeMin)))
        : line.labFee;
    return sum + min + (labFacing ? line.labAbutmentFee : 0);
  }, 0);
  const hasLabFeeRange = lines.some(
    (line) => line.labFeeMin != null && Number.isFinite(line.labFeeMin),
  );
  const labSubtotalDisplay =
    !labFacing &&
    labTotalMinOverride != null &&
    labTotalMaxOverride != null
      ? formatWonRange(labTotalMinOverride, labTotalMaxOverride)
      : hasLabFeeRange && !labFacing
        ? formatWonRange(labTotalMin, labSubtotal)
        : formatCell(labSubtotal);
  const labGroupColSpan =
    Number(labShareColumn) + Number(designFeeColumn) + Number(labAbutmentColumn);
  const colCount =
    1 +
    Number(labShareColumn) +
    Number(designFeeColumn) +
    Number(labAbutmentColumn) +
    Number(abutsColumn);
  const gridClass =
    colCount === 5
      ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto_auto_auto]"
      : colCount === 4
        ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto_auto]"
        : colCount === 3
          ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto]"
          : colCount === 2
            ? "grid-cols-[minmax(6.5rem,1fr)_auto]"
            : "grid-cols-1";
  const showShareGroupHeaders = labGroupColSpan > 0 && abutsColumn;
  const labColumnLabel = showShareGroupHeaders ? "보철기공비" : "기공소 기공물";
  const abutsColumnLabel =
    showShareGroupHeaders || designFeeColumn ? "어벗생산비" : "어벗츠 어벗";
  // 치과 예산 구간(min≠max)일 때는 소계만 구간 표시, 기공비 총액 행은 생략.
  const hasPracticeLabFeeSpread =
    !labFacing &&
    ((hasLabFeeRange && labTotalMin !== labSubtotal) ||
      (labTotalMinOverride != null &&
        labTotalMaxOverride != null &&
        labTotalMinOverride !== labTotalMaxOverride));
  const showLabGrandTotal =
    showShareGroupHeaders &&
    designFeeColumn &&
    labGrandTotal > 0 &&
    (labFacing || !hasPracticeLabFeeSpread);
  const showAbutsProductionSplit = designFeeColumn && !labFacing;
  const subtotalLabel = showShareGroupHeaders ? "소계" : "합계";
  const amountAlign = showShareGroupHeaders ? "text-center" : "text-right";
  const groupHeaderClass =
    "whitespace-nowrap border-b border-slate-300 pb-0.5 text-center text-[10px] font-semibold tracking-tight text-slate-600";
  const columnHeaderClass = cn(
    "whitespace-nowrap pb-0.5 text-[10px] font-medium text-muted-foreground",
    amountAlign,
  );
  const amountCellClass = cn("whitespace-nowrap", amountAlign);
  // CNC/환봉 SelectSeparator와 동일: slate-300 · 2px 라운드 바
  const renderShareDivider = (key: string, withTopRule = false) =>
    showShareGroupHeaders ? (
      <span
        key={key}
        aria-hidden
        className={cn(
          "relative w-0.5 justify-self-center self-stretch",
          withTopRule && "mt-0.5 border-t border-transparent pt-1.5",
        )}
      >
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-slate-300" />
      </span>
    ) : null;
  const labGroupSpanClass =
    labGroupColSpan >= 3
      ? "col-span-3"
      : labGroupColSpan === 2
        ? "col-span-2"
        : "col-span-1";
  // 치과는 기공소어벗 열이 있어 기공소보다 열이 많을 수 있음.
  const shareGridClass = showShareGroupHeaders
    ? labGroupColSpan >= 3
      ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto_auto_0.5rem_auto]"
      : designFeeColumn || labGroupColSpan >= 2
        ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto_0.5rem_auto]"
        : "grid-cols-[minmax(6.5rem,1fr)_auto_0.5rem_auto]"
    : gridClass;

  return (
    <div
      className={cn(
        "grid gap-y-0.5 tabular-nums",
        showShareGroupHeaders ? "gap-x-2" : "gap-x-3",
        shareGridClass,
      )}
    >
      {showShareGroupHeaders ? (
        <>
          <span aria-hidden className="pb-0.5" />
          <span className={cn(groupHeaderClass, labGroupSpanClass)}>
            기공소몫
          </span>
          {renderShareDivider("hdr-div")}
          <span className={groupHeaderClass}>어벗츠몫</span>
        </>
      ) : null}
      <span className="pb-0.5 text-[10px] font-medium text-muted-foreground">
        보철물
      </span>
      {labShareColumn ? (
        <span className={columnHeaderClass}>{labColumnLabel}</span>
      ) : null}
      {designFeeColumn ? (
        <span className={columnHeaderClass}>{designFeeLabel}</span>
      ) : null}
      {labAbutmentColumn ? (
        <span className={columnHeaderClass}>기공소 어벗</span>
      ) : null}
      {renderShareDivider("col-div")}
      {abutsColumn ? (
        <span className={columnHeaderClass}>{abutsColumnLabel}</span>
      ) : null}
      {lines.map((line, idx) => {
        const labShare = labFacing
          ? line.labFee + line.labAbutmentFee
          : line.labFee;
        const lineDesignFee = designFeeForLine(line);
        return (
          <div key={`${line.toothNumber}:${idx}`} className="contents">
            <span className="min-w-0 truncate">
              {line.toothNumber ? `${line.toothNumber} ` : ""}
              {line.prosthesisType || "보철"}
            </span>
            {labShareColumn ? (
              <span className={amountCellClass}>
                {formatLabShareCell(line, labShare, labFacing)}
              </span>
            ) : null}
            {designFeeColumn ? (
              <span className={amountCellClass}>
                {lineDesignFee > 0 ? formatManWon(lineDesignFee) : "—"}
              </span>
            ) : null}
            {labAbutmentColumn ? (
              <span className={amountCellClass}>
                {formatLabAbutmentCell(line)}
              </span>
            ) : null}
            {renderShareDivider(`line-div-${idx}`)}
            {abutsColumn ? (
              <span className={amountCellClass}>
                {labFacing || showAbutsProductionSplit
                  ? formatLabFacingAbutsProductionCell(line, lineDesignFee)
                  : formatAbutsCell(line)}
              </span>
            ) : null}
          </div>
        );
      })}
      {colCount > 1 ? (
        <>
          <span className="mt-0.5 border-t border-foreground/15 pt-1.5 font-medium">
            {subtotalLabel}
          </span>
          {labShareColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {labFacing && labSubtotal <= 0 && labAbutmentPending
                ? "요청중"
                : labSubtotalDisplay}
            </span>
          ) : null}
          {designFeeColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {designFeeTotal > 0 ? formatManWon(designFeeTotal) : "—"}
            </span>
          ) : null}
          {labAbutmentColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {labAbutmentTotal > 0
                ? formatManWon(labAbutmentTotal)
                : labAbutmentPending
                  ? "요청중"
                  : "—"}
            </span>
          ) : null}
          {renderShareDivider("sub-div", true)}
          {abutsColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {labFacing || showAbutsProductionSplit
                ? abutsProductionTotal > 0
                  ? formatManWon(abutsProductionTotal)
                  : abutsQuotePending
                    ? "별도 고지"
                    : "—"
                : lines.reduce((sum, line) => sum + line.abutmentRetail, 0) > 0
                  ? formatManWon(
                      lines.reduce((sum, line) => sum + line.abutmentRetail, 0),
                    )
                  : lines.some((line) => line.abutmentRetailNote === "quote")
                    ? "별도 고지"
                    : "—"}
            </span>
          ) : null}
        </>
      ) : null}
      {showLabGrandTotal ? (
        <>
          <span className="mt-0.5 border-t border-foreground/15 pt-1.5 font-semibold">
            기공비 총액
          </span>
          {labGroupColSpan > 0 ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 text-center font-semibold",
                labGroupSpanClass,
              )}
            >
              <span className="block whitespace-nowrap">
                {formatManWon(labGrandTotal)}
              </span>
              {labSettlementHint ? (
                <span className="mt-0.5 block text-[10px] font-normal leading-snug text-muted-foreground">
                  {labSettlementHint}
                </span>
              ) : null}
            </span>
          ) : null}
          {renderShareDivider("grand-div", true)}
          {abutsColumn ? (
            <span className="mt-0.5 border-t border-foreground/15 pt-1.5" />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function PracticeTransferFeeEstimate({
  quote,
  viewer,
  className,
  density = "chart",
  labPending = false,
  trailingAction = null,
  skipJig = true,
  rushProcessing = false,
  labEffectiveStars = null,
}: PracticeTransferFeeEstimateProps) {
  const isLab = viewer === "lab";
  const isCard = density === "card";
  const showLabPendingHint = Boolean(labPending) && !isLab;
  const hasTrailing = Boolean(trailingAction);
  const { data: systemSettings } = useSystemSettings();
  const rushFeeMultiplier = (() => {
    const fromQuote = normalizeRushFeeMultiplier(quote.rushFeeMultiplier);
    if (fromQuote > 1) return fromQuote;
    if (rushProcessing) {
      return normalizeConfiguredRushFeeMultiplier(
        systemSettings?.creditSettings?.practiceRushFeeMultiplier,
      );
    }
    return 1;
  })();
  const abutmentDesignLabFeeBase = Math.max(
    0,
    Math.round(
      Number(systemSettings?.creditSettings?.abutmentDesignLabFee ?? 10000) || 0,
    ),
  );
  // 어벗 소매(디자인+생산)는 quote에 rush가 이미 반영됨. 분해용 디자인비도 동일 배수.
  const abutmentDesignLabFee =
    rushFeeMultiplier > 1
      ? Math.max(0, Math.round(abutmentDesignLabFeeBase * rushFeeMultiplier))
      : abutmentDesignLabFeeBase;
  const abutmentDesignQty = Math.max(
    0,
    Math.round(Number(quote.abutmentQty || 0)),
  );
  const shippingFeePerBox = Math.max(
    0,
    Math.round(
      Number(systemSettings?.creditSettings?.shippingFee ?? 3500) || 3500,
    ),
  );
  const designFeeLabel = skipJig ? "디자인비" : "디자인비+지그제작비";
  const splitDesignFee =
    abutmentDesignQty > 0 &&
    abutmentDesignLabFee > 0 &&
    (isLab ||
      quote.lines.some(
        (line) =>
          line.abutmentRetail > 0 || line.abutmentRetailNote === "quote",
      ));

  if (showLabPendingHint) {
    return (
      <div
        data-no-tooth-marquee=""
        className={cn(
          "flex items-center justify-center text-center",
          isCard
            ? "mt-2 justify-start text-left"
            : "rounded-lg border border-primary-muted/50 bg-primary-soft/40 px-3 py-1.5",
          className,
        )}
        role="note"
      >
        <p className="text-sm text-muted-foreground">
          기공소를 선택하시면 기공비가 계산됩니다.
        </p>
      </div>
    );
  }

  const budget = quote.autoMatchBudget;
  const confirmed = Boolean(quote.billed);
  const feeRateApplied = Math.min(
    1,
    Math.max(0, Number(quote.feeRateApplied || 0)),
  );
  // 기공소: 설정 스케줄(labFeeTotal) + CA 어벗디자인비. 치과 예산 min~max는 수락 전 필터용.
  // 수락·청구 후(billed)에는 치과도 확정 기공비(total)를 표시.
  // 어벗디자인비도 보철기공비와 동일 — 기공비 총액에 합산 후 수수료 차감해 수령 표시.
  // 자동매칭·기공소: 상한 수가를 유효 별점 배수로 환산한 단일가.
  const labDesignFeePreview =
    isLab && abutmentDesignQty > 0 && abutmentDesignLabFee > 0
      ? abutmentDesignLabFee * abutmentDesignQty
      : 0;
  const scaleLabAutoMatchFee = (feeAtMax: number, feeAtMin?: number) => {
    if (!isLab || confirmed || !budget) return Math.max(0, Math.round(feeAtMax || 0));
    const maxFee = Math.max(0, Math.round(feeAtMax || 0));
    const minFee =
      feeAtMin != null && Number.isFinite(Number(feeAtMin))
        ? Math.max(0, Math.round(Number(feeAtMin)))
        : null;
    // BE가 이미 별점 확정가(하한=표시가)로 내려준 경우 재환산 금지.
    if (minFee != null && minFee === maxFee) return maxFee;
    return scaleAutoMatchFeeToLabStars({
      feeAtMax: maxFee,
      feeAtMin: minFee ?? undefined,
      budgetStars: budget.stars,
      budgetMaxStars: budget.maxStars,
      labStars: labEffectiveStars,
    });
  };
  const breakdownLines =
    quote.lines.length > 0
      ? sortPracticeTransferFeeLines(quote.lines).map((line) => {
          const labFeeMax = Math.max(0, Math.round(Number(line.labFee || 0)));
          const labFeeMinRaw =
            line.labFeeMin != null && Number.isFinite(Number(line.labFeeMin))
              ? Math.max(0, Math.round(Number(line.labFeeMin)))
              : undefined;
          return {
            toothNumber: line.toothNumber,
            prosthesisType: line.prosthesisType,
            // 기공소 뷰: 별점 확정 단일가(수수료 비례 삭감 금지 — 수령은 별도 표기).
            labFee: scaleLabAutoMatchFee(labFeeMax, labFeeMinRaw),
            // 치과·수락 전만 자동매칭 하한. 확정·기공소는 단일 수가.
            labFeeMin:
              !isLab && !confirmed && labFeeMinRaw != null
                ? labFeeMinRaw
                : undefined,
            labAbutmentFee: Math.max(
              0,
              Math.round(Number(line.labAbutmentFee || 0)),
            ),
            labAbutmentPending: Boolean(line.labAbutmentPending),
            abutmentRetail: Math.max(
              0,
              Math.round(Number(line.abutmentRetail || 0)),
            ),
            abutmentRetailNote: line.abutmentRetailNote,
          };
        })
      : [];
  const linesLabFeeMax = breakdownLines.reduce(
    (sum, line) => sum + line.labFee,
    0,
  );
  const linesLabFeeMin = breakdownLines.reduce((sum, line) => {
    const min =
      line.labFeeMin != null && Number.isFinite(line.labFeeMin)
        ? Math.max(0, Math.round(Number(line.labFeeMin)))
        : line.labFee;
    return sum + min;
  }, 0);
  const hasLineLabFeeRange = breakdownLines.some(
    (line) => line.labFeeMin != null && Number.isFinite(line.labFeeMin),
  );
  const budgetLabFeeMax = Math.max(
    0,
    Math.round(
      Number(
        budget?.maxLabFee != null && Number(budget.maxLabFee) > 0
          ? budget.maxLabFee
          : hasLineLabFeeRange
            ? linesLabFeeMax
            : 0,
      ),
    ),
  );
  const budgetLabFeeMin = Math.max(
    0,
    Math.round(
      Number(
        budget?.minLabFee != null && Number.isFinite(Number(budget.minLabFee))
          ? budget.minLabFee
          : hasLineLabFeeRange
            ? linesLabFeeMin
            : 0,
      ),
    ),
  );
  const hasBudgetRange =
    !confirmed && Boolean(budget) && budgetLabFeeMax > 0;
  /** v4 고정수가(min=max)는 구간 UI·안내 불필요. 치과만 구간 표기(기공소는 단일). */
  const hasBudgetSpread =
    !isLab && hasBudgetRange && budgetLabFeeMin !== budgetLabFeeMax;
  const labFeeTotalRaw = Math.max(0, Math.round(Number(quote.labFeeTotal || 0)));
  const labFeeTotalForLab = scaleLabAutoMatchFee(
    labFeeTotalRaw,
    budget?.minLabFee,
  );
  // 기공소: 툴팁 보철·기공소어벗 합과 동일 기준. billed 스냅샷이 대역 상한이면
  // labFeeTotal만 높아져 카드(15.2)↔툴팁(14) 불일치가 난다.
  const labShareFromBreakdown = breakdownLines.reduce(
    (sum, line) => sum + line.labFee + line.labAbutmentFee,
    0,
  );
  const amount = isLab
    ? (labShareFromBreakdown > 0 ? labShareFromBreakdown : labFeeTotalForLab) +
      labDesignFeePreview
    : hasBudgetRange
      ? budgetLabFeeMax +
        Math.max(0, Math.round(Number(quote.abutmentRetailTotal || 0)))
      : quote.total;
  const creditMin = hasBudgetRange
    ? budgetLabFeeMin +
      Math.max(0, Math.round(Number(quote.abutmentRetailTotal || 0)))
    : quote.total;
  const title = quote.isRemake
    ? isLab
      ? "리메이크 기공비"
      : "리메이크 견적"
    : isLab
      ? "기공비"
      : confirmed
        ? "확정 기공비"
        : "견적";
  const labProsthesisTotal = Math.max(
    0,
    Math.round(Number(quote.labFeeTotal || 0) - Number(quote.labAbutmentTotal || 0)),
  );
  // CA 디자인비(+지그)는 기공소몫(기공비). abutmentRetail(디자인+생산)에서 생산비만 어벗으로 표기.
  const designFeeTotalForSummary =
    !isLab && splitDesignFee ? abutmentDesignLabFee * abutmentDesignQty : 0;
  const labFeeWithDesignTotal = labProsthesisTotal + designFeeTotalForSummary;
  const abutmentProductionTotalForSummary = Math.max(
    0,
    Math.round(Number(quote.abutmentRetailTotal || 0)) - designFeeTotalForSummary,
  );
  // (보철기공비 + 어벗디자인비) × (1 − 수수료율). splitPracticeTransferSettlement와 동일.
  const labSettlementDisplay = isLab
    ? Math.max(0, amount - Math.round(amount * feeRateApplied))
    : Math.max(0, Math.round(Number(quote.labSettlementAmount || 0)));
  const labSettlementDiffers =
    isLab &&
    feeRateApplied > 0 &&
    labSettlementDisplay !== amount;
  const labFeeLabel = hasBudgetRange
    ? `기공비 ${formatWonRange(
        budgetLabFeeMin + designFeeTotalForSummary,
        budgetLabFeeMax + designFeeTotalForSummary,
      )}`
    : labFeeWithDesignTotal > 0
      ? `기공비 ${formatManWon(labFeeWithDesignTotal)}`
      : "";
  const simple = isLab
    ? labSettlementDiffers
      ? `수령 ${formatManWon(labSettlementDisplay)} · 수수료 ${formatFeeRatePct(feeRateApplied)}`
      : null
    : quote.isRemake
      ? `리메이크 기공비 ${formatManWon(quote.labFeeTotal)}`
      : [
          labFeeLabel,
          quote.labAbutmentTotal > 0
            ? `기공소어벗 ${formatManWon(quote.labAbutmentTotal)}`
            : quote.labAbutmentPending
              ? "기공소어벗 요청중"
              : "",
          quote.abutmentRetailTotal > 0
            ? `어벗 ${formatManWon(
                designFeeTotalForSummary > 0
                  ? abutmentProductionTotalForSummary
                  : quote.abutmentRetailTotal,
              )}`
            : quote.abutmentQuotePending
              ? "어벗 별도 고지"
              : "",
        ]
          .filter(Boolean)
          .join(" · ") ||
        (hasBudgetRange
          ? `기공비 ${formatWonRange(
              budgetLabFeeMin + designFeeTotalForSummary,
              budgetLabFeeMax + designFeeTotalForSummary,
            )}`
          : `기공비 ${formatManWon(labFeeWithDesignTotal || quote.labFeeTotal)}`);
  const labFeeUnset = !isLab && quote.labFeeConfigured === false;
  /** 기공소만: 생성 스냅샷 배수. 치과 견적에는 표기하지 않음 */
  const surchargeLabel =
    isLab && normalizeLabFeeMultiplier(quote.labFeeMultiplier) > 1
      ? formatLabFeeMultiplierLabel(quote.labFeeMultiplier)
      : null;
  const rushLabel =
    rushFeeMultiplier > 1
      ? `신속처리 ${formatRushFeeMultiplierLabel(rushFeeMultiplier)}`
      : null;

  const labTotalMinOverride =
    hasBudgetSpread && !hasLineLabFeeRange ? budgetLabFeeMin : null;
  const labTotalMaxOverride =
    hasBudgetSpread && labTotalMinOverride != null ? budgetLabFeeMax : null;

  // 출고 출발지별 배송비 안내(치과 뷰). 박스당 shippingFee.
  // 기공소 출발: 보철기공·기공소어벗·(지그 포함 CA 디자인). 지그 불필요면 CA만으로는 기공소 배송 없음.
  // 어벗츠 출발: 어벗츠 커스텀어벗.
  const hasLabProsthesisShip = breakdownLines.some(
    (line) =>
      line.labFee > 0 ||
      (line.labFeeMin != null && line.labFeeMin > 0) ||
      line.labAbutmentFee > 0 ||
      Boolean(line.labAbutmentPending),
  );
  const hasCaDesignShip =
    !skipJig &&
    splitDesignFee &&
    !isLab &&
    breakdownLines.some(
      (line) =>
        line.abutmentRetail > 0 || line.abutmentRetailNote === "quote",
    );
  const hasLabOriginShip = hasLabProsthesisShip || hasCaDesignShip;
  const hasAbutsOriginShip = breakdownLines.some(
    (line) =>
      line.abutmentRetail > 0 || line.abutmentRetailNote === "quote",
  );
  const shippingHintLines =
    !isLab && shippingFeePerBox > 0
      ? [
          ...(hasLabOriginShip
            ? [
                {
                  key: "lab",
                  label: "치과→기공소",
                  amount: shippingFeePerBox,
                },
              ]
            : []),
          ...(hasAbutsOriginShip
            ? [
                {
                  key: "abuts",
                  label: "치과→어벗츠",
                  amount: shippingFeePerBox,
                },
              ]
            : []),
        ]
      : [];
  const shippingTotal = shippingHintLines.reduce(
    (sum, row) => sum + row.amount,
    0,
  );

  return (
    <TooltipProvider>
      <div
        data-no-tooth-marquee=""
        className={cn(
          "group flex items-center gap-2 text-center",
          isCard
            ? cn(
                "mt-1.5 text-left",
                hasTrailing ? "w-full justify-between" : "justify-start gap-1.5",
              )
            : "justify-center rounded-lg border border-primary-muted/50 bg-primary-soft/40 px-3 py-1.5",
          className,
        )}
        role="note"
        title={!isLab ? "마우스를 올리면 금액이 보입니다" : undefined}
        onClick={isCard ? (event) => event.stopPropagation() : undefined}
        onKeyDown={isCard ? (event) => event.stopPropagation() : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "min-w-0 cursor-default",
                isCard
                  ? "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm"
                  : "",
                !isLab &&
                  "select-none blur-[8px] transition-[filter] duration-150 group-hover:select-text group-hover:blur-none group-focus-within:select-text group-focus-within:blur-none",
              )}
            >
              <span
                className={cn(
                  "font-semibold tabular-nums text-slate-800",
                  isCard ? "text-sm" : "text-sm sm:text-base",
                )}
              >
                <span className="font-medium text-slate-600">{title} </span>
                {hasBudgetRange && !isLab
                  ? formatWonRange(creditMin, amount)
                  : formatManWon(amount)}
                {surchargeLabel ? (
                  <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                    {surchargeLabel}
                  </span>
                ) : null}
                {rushLabel ? (
                  <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                    {rushLabel}
                  </span>
                ) : null}
              </span>
              {simple ? (
                <span
                  className={cn(
                    "tabular-nums text-muted-foreground",
                    isCard ? "text-[12px]" : "mt-0.5 block truncate text-[11px]",
                  )}
                >
                  {simple}
                </span>
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side={isCard ? "top" : "bottom"}
            data-no-tooth-marquee=""
            className="pointer-events-auto w-max max-w-[min(100vw-2rem,36rem)] select-text px-3 py-3 text-xs leading-relaxed"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {labFeeUnset ? (
              <p className="text-muted-foreground">
                기공소에서 아직 기공료를 설정하지 않았습니다. 기공소에
                문의해주세요.
              </p>
            ) : breakdownLines.length > 0 ? (
              <div className="space-y-1.5">
                <FeeBreakdownTable
                  lines={breakdownLines}
                  showLabColumn={
                    breakdownLines.some(
                      (line) =>
                        line.labFee > 0 ||
                        (line.labFeeMin != null && line.labFeeMin > 0),
                    ) ||
                    (isLab &&
                      abutmentDesignQty > 0 &&
                      abutmentDesignLabFee > 0)
                  }
                  showLabAbutmentColumn={breakdownLines.some(
                    (line) =>
                      Number(line.labAbutmentFee || 0) > 0 ||
                      Boolean(line.labAbutmentPending),
                  )}
                  showAbutmentColumn={breakdownLines.some(
                    (line) =>
                      line.abutmentRetail > 0 ||
                      line.abutmentRetailNote === "quote",
                  )}
                  labFacing={isLab}
                  labTotalMinOverride={labTotalMinOverride}
                  labTotalMaxOverride={labTotalMaxOverride}
                  abutmentDesignLabFee={abutmentDesignLabFee}
                  abutmentDesignQty={abutmentDesignQty}
                  splitDesignFee={splitDesignFee}
                  designFeeLabel={designFeeLabel}
                  labSettlementHint={
                    labSettlementDiffers ? (
                      <>
                        수수료 {formatFeeRatePct(feeRateApplied)} 차감 후 수령{" "}
                        <span className="font-medium text-foreground">
                          {formatManWon(labSettlementDisplay)}
                        </span>
                      </>
                    ) : null
                  }
                />
                {labSettlementDiffers &&
                !(
                  isLab &&
                  abutmentDesignQty > 0 &&
                  abutmentDesignLabFee > 0
                ) ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    수수료 {formatFeeRatePct(feeRateApplied)} 차감 후 수령{" "}
                    <span className="font-medium text-foreground">
                      {formatManWon(labSettlementDisplay)}
                    </span>
                  </p>
                ) : null}
                {hasBudgetRange && !isLab ? (
                  <p className="text-[11px] text-muted-foreground">
                    기공소 별점에 비례해 확정·청구됩니다.
                  </p>
                ) : null}
              </div>
            ) : hasBudgetRange ? (
              <div className="space-y-1.5 tabular-nums">
                <p>
                  기공비{" "}
                  <span className="font-medium">
                    {formatWonRange(budgetLabFeeMin, budgetLabFeeMax)}
                  </span>
                </p>
                {quote.abutmentRetailTotal > 0 || quote.abutmentQuotePending ? (
                  <p>
                    {isLab || splitDesignFee ? "어벗생산비" : "어벗츠 어벗"}{" "}
                    <span className="font-medium">
                      {isLab || splitDesignFee
                        ? quote.abutmentQuotePending &&
                          quote.abutmentRetailTotal <= 0
                          ? "별도 고지"
                          : formatManWon(
                              Math.max(
                                0,
                                Math.round(Number(quote.abutmentRetailTotal || 0)) -
                                  (abutmentDesignQty > 0 &&
                                  abutmentDesignLabFee > 0
                                    ? abutmentDesignLabFee * abutmentDesignQty
                                    : 0),
                              ),
                            )
                        : quote.abutmentQuotePending &&
                            quote.abutmentRetailTotal <= 0
                          ? "별도 고지"
                          : formatManWon(quote.abutmentRetailTotal)}
                    </span>
                  </p>
                ) : null}
                {splitDesignFee && !isLab ? (
                  <p>
                    {designFeeLabel}{" "}
                    <span className="font-medium">
                      {formatManWon(abutmentDesignLabFee * abutmentDesignQty)}
                    </span>
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  기공소 별점에 비례해 확정·청구됩니다.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">선택된 보철물이 없습니다.</p>
            )}
            {surchargeLabel ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800/90">
                {surchargeLabel} 적용
              </p>
            ) : null}
            {rushLabel ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800/90">
                {rushLabel} 적용
              </p>
            ) : null}
            {shippingHintLines.length > 0 ? (
              <div className="mt-1.5 space-y-0.5 border-t border-foreground/15 pt-1.5 text-[11px] leading-snug text-muted-foreground">
                <p className="font-medium text-foreground/80">
                  배송비(출고 시 차감 · 박스당)
                </p>
                {shippingHintLines.map((row) => (
                  <p key={row.key} className="tabular-nums">
                    {row.label}{" "}
                    <span className="font-medium text-foreground">
                      {formatManWon(row.amount)}
                    </span>
                  </p>
                ))}
                {skipJig && hasAbutsOriginShip && !hasLabProsthesisShip ? (
                  <p>지그 필요없음으로 기공소→치과 배송비는 차감하지 않습니다.</p>
                ) : null}
              </div>
            ) : null}
            {!isLab && !(labFeeUnset && quote.total <= 0) ? (
              <p className="mt-1.5 border-t border-foreground/15 pt-1.5 font-medium tabular-nums">
                {hasBudgetRange
                  ? `크레딧 소비 ${formatWonRange(
                      creditMin + shippingTotal,
                      amount + shippingTotal,
                    )}`
                  : `크레딧 소비 총액 ${formatManWon(quote.total + shippingTotal)}`}
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
        <CircleHelp
          className="pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
          aria-hidden
        />
        </div>
        {hasTrailing ? (
          <div
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {trailingAction}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
