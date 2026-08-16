// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - 2026-08-16: 기공소 CA 지급 라벨 어벗디자인비 → 디자인비+지그제작비.
// - 2026-08-15: 기공소 뷰 어벗생산비 = 치과 납부(abutmentRetail) − 어벗디자인비.
// - 2026-08-15: 기공소 뷰 — 기공소몫(보철기공비·어벗디자인비) / 어벗츠몫(어벗생산비) 2단 헤더.
// - 2026-08-15: 기공소 수령 — 어벗디자인비를 기공비 총액에 합산 후 수수료 차감(연기 안내 제거).
// - 2026-08-15: 기공소 뷰 — 보철기공비|어벗디자인비|어벗생산비, 소계(열별)+기공비 총액.
// - 2026-08-15: 기공소 뷰 — 어벗디자인비를 기공수가·어벗츠 몫 사이 컬럼으로 표시.
// - 2026-08-15: 기공소 뷰 — CA 시 어벗디자인비(플랫폼 단가×어벗수) 툴팁 행 추가.
// - 2026-08-14: 기공소 기공비 Off면 미설정 안내.
// - 2026-08-13: 치아번호 10→20→30→40번대 순으로 표시.
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
  formatWon,
  sortPracticeTransferFeeLines,
  type PracticeTransferFeeQuote,
  type PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  formatLabFeeMultiplierLabel,
  normalizeLabFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";
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
};

const formatCell = (value: number) => (value > 0 ? formatWon(value) : "—");

const formatWonRange = (minRaw: number, maxRaw: number) => {
  const min = Math.max(0, Math.round(Number(minRaw || 0)));
  const max = Math.max(0, Math.round(Number(maxRaw || 0)));
  if (min === max) return formatWon(max);
  return `${formatWon(Math.min(min, max))}~${formatWon(Math.max(min, max))}`;
};

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
  if (line.labAbutmentFee > 0) return formatWon(line.labAbutmentFee);
  if (line.labAbutmentPending) return "요청중";
  return "—";
};

const formatAbutsCell = (line: {
  abutmentRetail: number;
  abutmentRetailNote?: "quote";
}) => {
  if (line.abutmentRetail > 0) return formatWon(line.abutmentRetail);
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
  return formatWon(production);
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
}: {
  lines: FeeBreakdownLine[];
  showLabColumn: boolean;
  showLabAbutmentColumn: boolean;
  showAbutmentColumn: boolean;
  labFacing?: boolean;
  /** 라인에 labFeeMin이 없을 때 합계만 예산 하한~상한으로 표시 */
  labTotalMinOverride?: number | null;
  labTotalMaxOverride?: number | null;
  /** 기공소 뷰: 어벗디자인비(1어벗당) — 보철기공비와 동일하게 기공소 몫 */
  abutmentDesignLabFee?: number;
  abutmentDesignQty?: number;
}) {
  // 기공소 뷰: 기공소몫(보철기공비·어벗디자인비) | 어벗츠몫(어벗생산비).
  // 소계=열별 합산, 기공비 총액=기공비+어벗디자인비.
  const labShareColumn = labFacing
    ? showLabColumn || showLabAbutmentColumn
    : showLabColumn;
  const labAbutmentColumn = labFacing ? false : showLabAbutmentColumn;
  const abutsColumn = showAbutmentColumn;
  const unitDesignFee = Math.max(0, Math.round(Number(abutmentDesignLabFee || 0)));
  const designFeeColumn =
    labFacing &&
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
  const labGrandTotal = labSubtotal + designFeeTotal;
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
  const labAbutmentTotal = lines.reduce((sum, line) => sum + line.labAbutmentFee, 0);
  const labAbutmentPending = lines.some((line) => line.labAbutmentPending);
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
  const labColumnLabel = labFacing ? "보철기공비" : "기공소 기공물";
  const abutsColumnLabel = labFacing ? "어벗생산비" : "어벗츠 어벗";
  const showShareGroupHeaders =
    labFacing && labGroupColSpan > 0 && abutsColumn;
  const showLabGrandTotal = designFeeColumn && labGrandTotal > 0;
  const subtotalLabel = labFacing ? "소계" : "합계";
  const groupHeaderClass =
    "whitespace-nowrap border-b border-foreground/10 pb-0.5 text-center text-[10px] font-semibold tracking-tight text-muted-foreground";
  const columnHeaderClass =
    "whitespace-nowrap pb-0.5 text-right text-[10px] font-medium text-muted-foreground";
  const labGroupSpanClass =
    labGroupColSpan >= 3
      ? "col-span-3"
      : labGroupColSpan === 2
        ? "col-span-2"
        : "col-span-1";

  return (
    <div className={cn("grid gap-x-3 gap-y-0.5 tabular-nums", gridClass)}>
      {showShareGroupHeaders ? (
        <>
          <span aria-hidden className="pb-0.5" />
          <span className={cn(groupHeaderClass, labGroupSpanClass)}>
            기공소몫
          </span>
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
        <span className={columnHeaderClass}>디자인비+지그제작비</span>
      ) : null}
      {labAbutmentColumn ? (
        <span className={columnHeaderClass}>기공소 어벗</span>
      ) : null}
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
              <span className="whitespace-nowrap text-right">
                {formatLabShareCell(line, labShare, labFacing)}
              </span>
            ) : null}
            {designFeeColumn ? (
              <span className="whitespace-nowrap text-right">
                {lineDesignFee > 0 ? formatWon(lineDesignFee) : "—"}
              </span>
            ) : null}
            {labAbutmentColumn ? (
              <span className="whitespace-nowrap text-right">
                {formatLabAbutmentCell(line)}
              </span>
            ) : null}
            {abutsColumn ? (
              <span className="whitespace-nowrap text-right">
                {labFacing
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
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {labFacing && labSubtotal <= 0 && labAbutmentPending
                ? "요청중"
                : labSubtotalDisplay}
            </span>
          ) : null}
          {designFeeColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {designFeeTotal > 0 ? formatWon(designFeeTotal) : "—"}
            </span>
          ) : null}
          {labAbutmentColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {labAbutmentTotal > 0
                ? formatWon(labAbutmentTotal)
                : labAbutmentPending
                  ? "요청중"
                  : "—"}
            </span>
          ) : null}
          {abutsColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-medium">
              {labFacing
                ? abutsProductionTotal > 0
                  ? formatWon(abutsProductionTotal)
                  : abutsQuotePending
                    ? "별도 고지"
                    : "—"
                : lines.reduce((sum, line) => sum + line.abutmentRetail, 0) > 0
                  ? formatWon(
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
          {labShareColumn ? (
            <span className="mt-0.5 whitespace-nowrap border-t border-foreground/15 pt-1.5 text-right font-semibold">
              {formatWon(labGrandTotal)}
            </span>
          ) : null}
          {designFeeColumn ? (
            <span className="mt-0.5 border-t border-foreground/15 pt-1.5" />
          ) : null}
          {labAbutmentColumn ? (
            <span className="mt-0.5 border-t border-foreground/15 pt-1.5" />
          ) : null}
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
}: PracticeTransferFeeEstimateProps) {
  const isLab = viewer === "lab";
  const isCard = density === "card";
  const showLabPendingHint = Boolean(labPending) && !isLab;
  const hasTrailing = Boolean(trailingAction);
  const { data: systemSettings } = useSystemSettings();
  const abutmentDesignLabFee = Math.max(
    0,
    Math.round(Number(systemSettings?.creditSettings?.abutmentDesignLabFee ?? 10000) || 0),
  );
  const abutmentDesignQty = Math.max(
    0,
    Math.round(Number(quote.abutmentQty || 0)),
  );

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
  const labDesignFeePreview =
    isLab && abutmentDesignQty > 0 && abutmentDesignLabFee > 0
      ? abutmentDesignLabFee * abutmentDesignQty
      : 0;
  const amount = isLab
    ? Math.max(0, Math.round(Number(quote.labFeeTotal || 0))) + labDesignFeePreview
    : !confirmed && budget && Number(budget.maxLabFee) > 0
      ? Math.max(0, Number(budget.maxLabFee)) +
        Math.max(0, Math.round(Number(quote.abutmentRetailTotal || 0)))
      : quote.total;
  const creditMin =
    !confirmed && budget && Number(budget.maxLabFee) > 0
      ? Math.max(0, Number(budget.minLabFee || 0)) +
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
        : budget && Number(budget.maxLabFee) > 0
          ? "예상 견적"
          : "견적";
  const labProsthesisTotal = Math.max(
    0,
    Math.round(Number(quote.labFeeTotal || 0) - Number(quote.labAbutmentTotal || 0)),
  );
  const hasBudgetRange =
    !confirmed && Boolean(budget) && Number(budget?.maxLabFee) > 0;
  // (보철기공비 + 어벗디자인비) × (1 − 수수료율). splitPracticeTransferSettlement와 동일.
  const labSettlementDisplay = isLab
    ? Math.max(0, amount - Math.round(amount * feeRateApplied))
    : Math.max(0, Math.round(Number(quote.labSettlementAmount || 0)));
  const labSettlementDiffers =
    isLab &&
    feeRateApplied > 0 &&
    labSettlementDisplay !== amount;
  const simple = isLab
    ? labSettlementDiffers
      ? `수령 ${formatWon(labSettlementDisplay)} · 수수료 ${formatFeeRatePct(feeRateApplied)}`
      : null
    : quote.isRemake
      ? `리메이크 기공비 ${formatWon(quote.labFeeTotal)}`
      : [
          hasBudgetRange
            ? `기공비 ${formatWon(Number(budget?.minLabFee || 0))}~${formatWon(Number(budget?.maxLabFee || 0))}`
            : labProsthesisTotal > 0
              ? `기공비 ${formatWon(labProsthesisTotal)}`
              : "",
          quote.labAbutmentTotal > 0
            ? `기공소어벗 ${formatWon(quote.labAbutmentTotal)}`
            : quote.labAbutmentPending
              ? "기공소어벗 요청중"
              : "",
          quote.abutmentRetailTotal > 0
            ? `어벗 ${formatWon(quote.abutmentRetailTotal)}`
            : quote.abutmentQuotePending
              ? "어벗 별도 고지"
              : "",
        ]
          .filter(Boolean)
          .join(" · ") ||
        (hasBudgetRange
          ? `기공비 ${formatWon(Number(budget?.minLabFee || 0))}~${formatWon(Number(budget?.maxLabFee || 0))}`
          : `기공비 ${formatWon(quote.labFeeTotal)}`);
  const labFeeUnset = !isLab && quote.labFeeConfigured === false;
  /** 기공소만: 생성 스냅샷 배수. 치과 견적에는 표기하지 않음 */
  const surchargeLabel =
    isLab && normalizeLabFeeMultiplier(quote.labFeeMultiplier) > 1
      ? formatLabFeeMultiplierLabel(quote.labFeeMultiplier)
      : null;

  const breakdownLines =
    quote.lines.length > 0
      ? sortPracticeTransferFeeLines(quote.lines).map((line) => ({
          toothNumber: line.toothNumber,
          prosthesisType: line.prosthesisType,
          // 기공소 뷰: 설정 수가 그대로(수수료 비례 삭감 금지 — 수령은 별도 표기).
          labFee: Math.max(0, Math.round(Number(line.labFee || 0))),
          labFeeMin:
            line.labFeeMin != null
              ? Math.max(0, Math.round(Number(line.labFeeMin)))
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
        }))
      : [];
  const labTotalMinOverride =
    hasBudgetRange && !breakdownLines.some((line) => line.labFeeMin != null)
      ? Math.max(0, Math.round(Number(budget?.minLabFee || 0)))
      : null;
  const labTotalMaxOverride =
    hasBudgetRange && labTotalMinOverride != null
      ? Math.max(0, Math.round(Number(budget?.maxLabFee || 0)))
      : null;

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-no-tooth-marquee=""
        className={cn(
          "group flex items-center gap-2 text-center",
          isCard
            ? cn(
                "mt-2 text-left",
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
                isCard ? "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5" : "",
                !isLab &&
                  "select-none blur-[8px] transition-[filter] duration-150 group-hover:select-text group-hover:blur-none group-focus-within:select-text group-focus-within:blur-none",
              )}
            >
              <p
                className={cn(
                  "font-semibold tabular-nums text-slate-800",
                  isCard ? "text-sm" : "text-sm sm:text-base",
                )}
              >
                <span className="font-medium text-slate-600">{title} </span>
                {hasBudgetRange && !isLab
                  ? formatWonRange(creditMin, amount)
                  : formatWon(amount)}
                {surchargeLabel ? (
                  <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                    {surchargeLabel}
                  </span>
                ) : null}
              </p>
              {simple ? (
                <p
                  className={cn(
                    "truncate text-[11px] text-muted-foreground",
                    isCard ? "" : "mt-0.5",
                  )}
                >
                  {simple}
                </p>
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side={isCard ? "top" : "bottom"}
            data-no-tooth-marquee=""
            className="pointer-events-auto max-w-[26rem] select-text p-3 text-xs leading-relaxed"
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
                />
                {labSettlementDiffers ? (
                  <p className="text-[11px] text-muted-foreground">
                    수수료 {formatFeeRatePct(feeRateApplied)} 차감 후 수령{" "}
                    <span className="font-medium text-foreground">
                      {formatWon(labSettlementDisplay)}
                    </span>
                  </p>
                ) : null}
                {hasBudgetRange ? (
                  <p className="text-[11px] text-muted-foreground">
                    항목별 예산 구간의 인증 기공소만 자동매칭에 참여합니다. 수락
                    시 해당 기공소 수가로 확정·청구됩니다.
                  </p>
                ) : null}
              </div>
            ) : hasBudgetRange ? (
              <div className="space-y-1.5 tabular-nums">
                <p>
                  기공비 예산{" "}
                  <span className="font-medium">
                    {formatWonRange(
                      Number(budget?.minLabFee || 0),
                      Number(budget?.maxLabFee || 0),
                    )}
                  </span>
                </p>
                {quote.abutmentRetailTotal > 0 || quote.abutmentQuotePending ? (
                  <p>
                    {isLab ? "어벗생산비" : "어벗츠 어벗"}{" "}
                    <span className="font-medium">
                      {isLab
                        ? quote.abutmentQuotePending &&
                          quote.abutmentRetailTotal <= 0
                          ? "별도 고지"
                          : formatWon(
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
                          : formatWon(quote.abutmentRetailTotal)}
                    </span>
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  항목별 예산 구간의 인증 기공소만 자동매칭에 참여합니다. 수락 시
                  해당 기공소 수가로 확정·청구됩니다.
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
            {!isLab && !(labFeeUnset && quote.total <= 0) ? (
              <p className="mt-1.5 border-t border-foreground/15 pt-1.5 font-medium tabular-nums">
                {hasBudgetRange
                  ? `크레딧 소비 ${formatWonRange(creditMin, amount)}`
                  : `크레딧 소비 총액 ${formatWon(quote.total)}`}
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
