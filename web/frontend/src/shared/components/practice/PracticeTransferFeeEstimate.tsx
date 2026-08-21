// related files:
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothWorkChartReadOnly.tsx
// - 2026-08-21: 기공의뢰 정산에서 기공소→어벗츠 배송 제외(기공소 박스 과금).
// - 2026-08-21: 치과→기공소 배송 무료. 정산 상세는 →어벗츠(박스)만. skipJig는 물류 안내만.
// - 2026-08-21: 치과 견적 — 커스텀어벗 등 기공소 수가 미설정(missingFeeNames) 안내.
// - 2026-08-21: 같은 치아번호는 한 줄. 보철기공비|커스텀어벗 열로 수가 구분.
// - 2026-08-20: 정산(density=detail)만 장부 배송비·크레딧 소비 총액. 견적 툴팁은 기공비 총액까지.
// - 2026-08-20: 견적 툴팁은 기공비 총액까지. 배송비·크레딧 소비 총액은 주문건당 표시하지 않음(묶음 발송·정산 장부 SSOT).
// - 2026-08-19: 지정 기공소 수가 Off — 바에「기공비 미설정」(0원 금지). 어벗 단가는 유지.
// - 2026-08-19: 치식 차트 견적 바 leadingAction(스크롤).
// - 2026-08-19: 견적 열 보철기공비|어벗 디자인+생산비. 둘 다 기공비. 기공소몫/어벗츠몫 헤더·구분선 제거.
// - 2026-08-17: 크레딧 상세 — 지급완료/지급보류를 기공소몫·어벗츠몫 헤더 옆에 표시.
// - 2026-08-17: mode=detail — 호버 없이 견적 상세 표(크레딧 장부 모달용).
// - 2026-08-17: 배송비 안내 — 출고 시 차감 → 주문 시 보류.
// - 2026-08-17: 견적 한줄 요약 — CA 디자인비(+지그)는 기공비, 어벗은 생산비만(툴팁 기공비 총액·어벗생산비와 일치).
// - 2026-08-17: 신속처리 시 디자인비(+지그)·어벗생산비 분해에도 rush 배수 적용.
// - 2026-08-16: 기공의뢰수신 카드 — 기공비·수령·수수료를 한 줄로 표시.
// - 2026-08-16: 기공소 카드 기공비=툴팁 라인 합+디자인. 스냅샷 상한과 불일치 방지.
// - 2026-08-19: 별점 기공비 구간 안내 제거. 치과별 할증만 확정·청구에 반영.
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
// - 2026-08-17: 번대 안은 정중선 가운데(18→11, 21→28, 38→31, 41→48).
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
  isCustomAbutmentProsthesisType,
  normalizeLabFeeMultiplier,
  normalizeRushFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";

export type PracticeTransferSettlementShippingLine = {
  key: string;
  label: string;
  amount: number;
  holdPending?: boolean | null;
};

type PracticeTransferFeeEstimateProps = {
  quote: PracticeTransferFeeQuote;
  viewer: PracticeTransferFeeQuoteViewer;
  className?: string;
  /** compact: 상·하악 사이 / card: 의뢰카드 / detail: 상세 표만(모달) */
  density?: "chart" | "card" | "detail";
  /** 기공소 미선택 — 기공비 미산출 안내 */
  labPending?: boolean;
  /** 치식 차트 견적 바 왼쪽(스크롤 등) */
  leadingAction?: ReactNode;
  /** 카드 총액 오른쪽·치식 차트 견적 바 오른쪽(선택) */
  trailingAction?: ReactNode;
  /** 지그 제작 불필요 — 정산 상세에서 기공소 배송 면제 안내 */
  skipJig?: boolean;
  /** 신속처리 할증 표기 */
  rushProcessing?: boolean;
  /** 기공소 뷰 — 자동매칭 기공비를 유효 별점 배수로 단일 확정 */
  labEffectiveStars?: number | null;
  /**
   * 크레딧 장부 상세 전용. 보철기공비·어벗 디자인+생산비 각각 true=지급보류, false=지급완료.
   */
  creditLabHoldPending?: boolean | null;
  creditAbutmentHoldPending?: boolean | null;
  /** 크레딧 정산 상세 전용. 장부에 잡힌 배송비(견적 툴팁에는 전달하지 않음) */
  settlementShippingLines?: PracticeTransferSettlementShippingLine[] | null;
};

const formatCell = (value: number) => (value > 0 ? formatManWon(value) : "—");

const creditShareSettlementLabel = (pending: boolean) =>
  pending ? "지급보류" : "지급완료";

const creditShareSettlementClass = (pending: boolean) =>
  pending
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";

const renderCreditShareHeader = (
  shareLabel: string,
  holdPending: boolean | null | undefined,
  className?: string,
) => (
  <span
    className={cn(
      "inline-flex flex-wrap items-center justify-center gap-1",
      className,
    )}
  >
    <span>{shareLabel}</span>
    {holdPending !== null && holdPending !== undefined ? (
      <span
        className={cn(
          "rounded border px-1 py-px text-[10px] font-medium leading-tight",
          creditShareSettlementClass(holdPending),
        )}
      >
        {creditShareSettlementLabel(holdPending)}
      </span>
    ) : null}
  </span>
);

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

const formatAbutsCell = (line: {
  abutmentRetail: number;
  abutmentRetailNote?: "quote";
}) => {
  if (line.abutmentRetail > 0) return formatManWon(line.abutmentRetail);
  if (line.abutmentRetailNote === "quote") return "별도 고지";
  return "—";
};

const formatProsthesisCell = (
  line: FeeBreakdownLine,
  amount: number,
  labFacing: boolean,
) => {
  // 치과만 하한~상한. 기공소는 설정 수가(단일).
  if (
    !labFacing &&
    line.labFeeMin != null &&
    Number.isFinite(line.labFeeMin)
  ) {
    const minShare = Math.max(0, Math.round(Number(line.labFeeMin)));
    if (minShare > 0 || amount > 0) {
      return formatWonRange(minShare, amount);
    }
    return "—";
  }
  return formatCell(amount);
};

const formatLabAbutmentCell = (line: FeeBreakdownLine) => {
  if (line.labAbutmentFee <= 0 && line.labAbutmentPending) return "요청중";
  if (line.labAbutmentFee <= 0) return "—";
  return formatManWon(line.labAbutmentFee);
};

/** 같은 치아번호 라인을 한 줄로 합친다. 라벨은 보철 형태 우선(커스텀어벗만이면 그대로). */
const mergeFeeBreakdownLinesByTooth = (
  lines: FeeBreakdownLine[],
): FeeBreakdownLine[] => {
  const order: string[] = [];
  const byKey = new Map<string, FeeBreakdownLine>();
  let anon = 0;
  for (const line of lines) {
    const tooth = String(line.toothNumber || "").trim();
    const key = tooth || `\0anon-${anon++}`;
    const existing = byKey.get(key);
    if (!existing) {
      order.push(key);
      byKey.set(key, { ...line });
      continue;
    }
    const preferType = !isCustomAbutmentProsthesisType(existing.prosthesisType)
      ? existing.prosthesisType
      : !isCustomAbutmentProsthesisType(line.prosthesisType)
        ? line.prosthesisType
        : existing.prosthesisType || line.prosthesisType;
    const labFeeMin =
      existing.labFeeMin != null || line.labFeeMin != null
        ? (existing.labFeeMin != null && Number.isFinite(existing.labFeeMin)
            ? existing.labFeeMin
            : existing.labFee) +
          (line.labFeeMin != null && Number.isFinite(line.labFeeMin)
            ? line.labFeeMin
            : line.labFee)
        : undefined;
    byKey.set(key, {
      toothNumber: existing.toothNumber || line.toothNumber,
      prosthesisType: preferType || "보철",
      labFee: existing.labFee + line.labFee,
      ...(labFeeMin != null ? { labFeeMin } : {}),
      labAbutmentFee: existing.labAbutmentFee + line.labAbutmentFee,
      labAbutmentPending: Boolean(
        existing.labAbutmentPending || line.labAbutmentPending,
      ),
      abutmentRetail: existing.abutmentRetail + line.abutmentRetail,
      abutmentRetailNote:
        existing.abutmentRetailNote || line.abutmentRetailNote,
    });
  }
  return order.map((key) => byKey.get(key)!);
};

function FeeBreakdownTable({
  lines: rawLines,
  labFacing = false,
  labTotalMinOverride = null,
  labTotalMaxOverride = null,
  labSettlementHint = null,
  labShareHoldPending = null,
  abutmentShareHoldPending = null,
}: {
  lines: FeeBreakdownLine[];
  labFacing?: boolean;
  labTotalMinOverride?: number | null;
  labTotalMaxOverride?: number | null;
  labSettlementHint?: ReactNode;
  labShareHoldPending?: boolean | null;
  abutmentShareHoldPending?: boolean | null;
}) {
  // 같은 치아 = 한 줄. 열: 보철기공비 | 커스텀어벗 | (있으면) 어벗 디자인+생산비.
  const lines = mergeFeeBreakdownLinesByTooth(rawLines);
  const showProsthesisColumn = lines.some(
    (line) =>
      line.labFee > 0 || (line.labFeeMin != null && line.labFeeMin > 0),
  );
  const showLabAbutmentColumn = lines.some(
    (line) => line.labAbutmentFee > 0 || Boolean(line.labAbutmentPending),
  );
  const showAbutmentColumn = lines.some(
    (line) => line.abutmentRetail > 0 || line.abutmentRetailNote === "quote",
  );
  const prosthesisSubtotal = lines.reduce((sum, line) => sum + line.labFee, 0);
  const labAbutmentSubtotal = lines.reduce(
    (sum, line) => sum + line.labAbutmentFee,
    0,
  );
  const abutmentSubtotal = lines.reduce(
    (sum, line) => sum + line.abutmentRetail,
    0,
  );
  const abutmentQuotePending = lines.some(
    (line) => line.abutmentRetailNote === "quote" && line.abutmentRetail <= 0,
  );
  const labAbutmentPending = lines.some((line) => line.labAbutmentPending);
  const labShareTotal = prosthesisSubtotal + labAbutmentSubtotal;
  const workTotal = labShareTotal + abutmentSubtotal;
  const prosthesisMin = lines.reduce((sum, line) => {
    const min =
      line.labFeeMin != null && Number.isFinite(line.labFeeMin)
        ? Math.max(0, Math.round(Number(line.labFeeMin)))
        : line.labFee;
    return sum + min;
  }, 0);
  const labShareMin = prosthesisMin + labAbutmentSubtotal;
  const hasLabFeeRange = lines.some(
    (line) => line.labFeeMin != null && Number.isFinite(line.labFeeMin),
  );
  const prosthesisSubtotalDisplay =
    !labFacing &&
    labTotalMinOverride != null &&
    labTotalMaxOverride != null &&
    !showLabAbutmentColumn
      ? formatWonRange(labTotalMinOverride, labTotalMaxOverride)
      : hasLabFeeRange && !labFacing
        ? formatWonRange(prosthesisMin, prosthesisSubtotal)
        : formatCell(prosthesisSubtotal);
  const labAbutmentSubtotalDisplay =
    labFacing && labAbutmentSubtotal <= 0 && labAbutmentPending
      ? "요청중"
      : labAbutmentSubtotal > 0
        ? formatManWon(labAbutmentSubtotal)
        : labAbutmentPending
          ? "요청중"
          : "—";
  const abutmentSubtotalDisplay =
    abutmentSubtotal > 0
      ? formatManWon(abutmentSubtotal)
      : abutmentQuotePending
        ? "별도 고지"
        : "—";
  const labShareRangeMin =
    labTotalMinOverride != null ? labTotalMinOverride : labShareMin;
  const labShareRangeMax =
    labTotalMaxOverride != null ? labTotalMaxOverride : labShareTotal;
  const hasPracticeLabFeeSpread =
    !labFacing &&
    ((hasLabFeeRange && labShareMin !== labShareTotal) ||
      (labTotalMinOverride != null &&
        labTotalMaxOverride != null &&
        labTotalMinOverride !== labTotalMaxOverride));
  const workTotalDisplay = hasPracticeLabFeeSpread
    ? formatWonRange(
        labShareRangeMin + abutmentSubtotal,
        labShareRangeMax + abutmentSubtotal,
      )
    : formatManWon(workTotal);
  const amountColCount =
    Number(showProsthesisColumn) +
    Number(showLabAbutmentColumn) +
    Number(showAbutmentColumn);
  const colCount = 1 + amountColCount;
  const gridClass =
    colCount === 4
      ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto_auto]"
      : colCount === 3
        ? "grid-cols-[minmax(6.5rem,1fr)_auto_auto]"
        : colCount === 2
          ? "grid-cols-[minmax(6.5rem,1fr)_auto]"
          : "grid-cols-1";
  const amountAlign = amountColCount >= 2 ? "text-center" : "text-right";
  const columnHeaderClass = cn(
    "whitespace-nowrap pb-0.5 text-[10px] font-medium text-muted-foreground",
    amountAlign,
  );
  const amountCellClass = cn("whitespace-nowrap", amountAlign);
  const amountSpanClass =
    amountColCount >= 3
      ? "col-span-3"
      : amountColCount >= 2
        ? "col-span-2"
        : "col-span-1";
  const showWorkTotal =
    Boolean(labSettlementHint) ||
    (amountColCount >= 2 &&
      (workTotal > 0 || abutmentQuotePending || labAbutmentPending));

  return (
    <div className={cn("grid gap-x-3 gap-y-0.5 tabular-nums", gridClass)}>
      <span className="pb-0.5 text-[10px] font-medium text-muted-foreground">
        보철물
      </span>
      {showProsthesisColumn ? (
        <span className={cn(columnHeaderClass, "whitespace-normal")}>
          {renderCreditShareHeader("보철기공비", labShareHoldPending)}
        </span>
      ) : null}
      {showLabAbutmentColumn ? (
        <span className={cn(columnHeaderClass, "whitespace-normal")}>
          {renderCreditShareHeader("커스텀어벗", labShareHoldPending)}
        </span>
      ) : null}
      {showAbutmentColumn ? (
        <span className={cn(columnHeaderClass, "whitespace-normal")}>
          {renderCreditShareHeader(
            "어벗 디자인+생산비",
            abutmentShareHoldPending,
          )}
        </span>
      ) : null}
      {lines.map((line, idx) => (
        <div key={`${line.toothNumber}:${idx}`} className="contents">
          <span className="min-w-0 truncate">
            {line.toothNumber ? `${line.toothNumber} ` : ""}
            {line.prosthesisType || "보철"}
          </span>
          {showProsthesisColumn ? (
            <span className={amountCellClass}>
              {formatProsthesisCell(line, line.labFee, labFacing)}
            </span>
          ) : null}
          {showLabAbutmentColumn ? (
            <span className={amountCellClass}>
              {formatLabAbutmentCell(line)}
            </span>
          ) : null}
          {showAbutmentColumn ? (
            <span className={amountCellClass}>{formatAbutsCell(line)}</span>
          ) : null}
        </div>
      ))}
      {colCount > 1 ? (
        <>
          <span className="mt-0.5 border-t border-foreground/15 pt-1.5 font-medium">
            소계
          </span>
          {showProsthesisColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {prosthesisSubtotalDisplay}
            </span>
          ) : null}
          {showLabAbutmentColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {labAbutmentSubtotalDisplay}
            </span>
          ) : null}
          {showAbutmentColumn ? (
            <span
              className={cn(
                "mt-0.5 border-t border-foreground/15 pt-1.5 font-medium",
                amountCellClass,
              )}
            >
              {abutmentSubtotalDisplay}
            </span>
          ) : null}
        </>
      ) : null}
      {showWorkTotal ? (
        <>
          <span className="mt-0.5 border-t border-foreground/15 pt-1.5 font-semibold">
            기공비 총액
          </span>
          <span
            className={cn(
              "mt-0.5 border-t border-foreground/15 pt-1.5 text-center font-semibold",
              amountSpanClass,
            )}
          >
            <span className="block whitespace-nowrap">{workTotalDisplay}</span>
            {labSettlementHint ? (
              <span className="mt-0.5 block text-[10px] font-normal leading-snug text-muted-foreground">
                {labSettlementHint}
              </span>
            ) : null}
          </span>
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
  leadingAction = null,
  trailingAction = null,
  skipJig = true,
  rushProcessing = false,
  labEffectiveStars: _labEffectiveStars = null,
  creditLabHoldPending = null,
  creditAbutmentHoldPending = null,
  settlementShippingLines = null,
}: PracticeTransferFeeEstimateProps) {
  const isLab = viewer === "lab";
  const isDetail = density === "detail";
  const isCard = density === "card";
  const showLabPendingHint = Boolean(labPending) && !isLab;
  const hasLeading = Boolean(leadingAction);
  const hasTrailing = Boolean(trailingAction);
  const hasChartSideActions = !isCard && !isDetail && (hasLeading || hasTrailing);
  const showCreditShareSettlement =
    isDetail &&
    (creditLabHoldPending !== null || creditAbutmentHoldPending !== null);
  const labCreditSettled =
    creditLabHoldPending !== null &&
    creditLabHoldPending !== undefined &&
    !creditLabHoldPending;
  const abutmentCreditSettled =
    creditAbutmentHoldPending !== null &&
    creditAbutmentHoldPending !== undefined &&
    !creditAbutmentHoldPending;
  const rushFeeMultiplier = (() => {
    // 신규 신속처리 할증 없음. 레거시 quote 배수만 표시.
    return normalizeRushFeeMultiplier(quote.rushFeeMultiplier);
  })();

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
  const labFeeAmount = (feeAtMax: number) =>
    Math.max(0, Math.round(Number(feeAtMax || 0)));
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
            labFee: labFeeAmount(labFeeMax),
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
  const labFeeTotalForLab = labFeeAmount(labFeeTotalRaw);
  // 기공소: 툴팁 보철·기공소어벗·어벗 디자인+생산 합과 동일. billed 스냅샷이
  // 대역 상한이면 labFeeTotal만 높아져 카드↔툴팁 불일치가 난다.
  const prosthesisFromBreakdown = breakdownLines.reduce(
    (sum, line) => sum + line.labFee + line.labAbutmentFee,
    0,
  );
  const abutmentFromBreakdown = breakdownLines.reduce(
    (sum, line) => sum + line.abutmentRetail,
    0,
  );
  const workTotalFromBreakdown = prosthesisFromBreakdown + abutmentFromBreakdown;
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(quote.abutmentRetailTotal || 0)),
  );
  const amount = isLab
    ? workTotalFromBreakdown > 0
      ? workTotalFromBreakdown
      : labFeeTotalForLab + abutmentRetailTotal
    : hasBudgetRange
      ? budgetLabFeeMax + abutmentRetailTotal
      : quote.total;
  const creditMin = hasBudgetRange
    ? budgetLabFeeMin + abutmentRetailTotal
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
  // 보철기공비 + 어벗 디자인+생산비 = 기공비. 하청만 수수료 차감 수령.
  const labSettlementDisplay = Math.max(
    0,
    amount - Math.round(amount * feeRateApplied),
  );
  const labSettlementDiffers =
    isLab && feeRateApplied > 0 && labSettlementDisplay !== amount;
  const simple = isLab
    ? labSettlementDiffers
      ? `수령 ${formatManWon(labSettlementDisplay)} · 수수료 ${formatFeeRatePct(feeRateApplied)}`
      : null
    : quote.isRemake
      ? `리메이크 기공비 ${formatManWon(quote.total || quote.labFeeTotal)}`
      : null;
  const labFeeUnset = quote.labFeeConfigured === false;
  const missingFeeNames = Array.isArray(quote.missingFeeNames)
    ? quote.missingFeeNames.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  const hasMissingFees = !isLab && !labFeeUnset && missingFeeNames.length > 0;
  const missingFeeLabel = hasMissingFees
    ? missingFeeNames.join("·")
    : "";
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

  const shippingHintLines =
    isDetail && !isLab
      ? (settlementShippingLines || [])
          .map((row) => ({
            key: String(row.key || ""),
            label: String(row.label || "배송비").trim() || "배송비",
            amount: Math.max(0, Math.round(Number(row.amount || 0))),
            holdPending:
              row.holdPending === undefined ? null : row.holdPending,
          }))
          .filter(
            (row) =>
              row.key &&
              row.amount > 0 &&
              // 치과→기공소 무료 · 기공소→어벗츠는 기공소 박스 과금(치과 기공의뢰에 미포함)
              !row.label.includes("치과→기공소") &&
              !row.label.includes("기공소→어벗츠") &&
              !row.label.includes("기공소 -> 어벗츠") &&
              row.key !== "lab" &&
              row.key !== "abuts",
          )
      : [];
  const shippingTotal = shippingHintLines.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const shippingHeaderLabel =
    labCreditSettled && abutmentCreditSettled
      ? "배송비(차감 완료)"
      : labCreditSettled || abutmentCreditSettled
        ? "배송비"
        : "배송비(보류)";
  const hasAbutsOriginShip = shippingHintLines.some((row) =>
    row.label.includes("어벗츠"),
  );

  const abutmentOnlyAmount =
    abutmentFromBreakdown > 0
      ? abutmentFromBreakdown
      : Math.max(0, Math.round(Number(quote.abutmentRetailTotal || 0)));

  const breakdownPanel = (
    <>
      {labFeeUnset ? (
        <p className="text-muted-foreground">
          {isLab
            ? "기공비를 설정해야 의뢰를 수락할 수 있습니다."
            : "기공소에서 아직 기공비를 설정하지 않았습니다. 기공소에 문의해주세요."}
        </p>
      ) : null}
      {hasMissingFees ? (
        <p className="text-[12px] font-medium leading-snug text-amber-800/90">
          「{missingFeeLabel}」 수가가 기공소에 아직 없습니다.
          <br />
          설정되면 견적에 포함됩니다.
        </p>
      ) : null}
      {breakdownLines.length > 0 ? (
        <div className="space-y-1.5">
          <FeeBreakdownTable
            lines={breakdownLines}
            labFacing={isLab}
            labTotalMinOverride={labTotalMinOverride}
            labTotalMaxOverride={labTotalMaxOverride}
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
            labShareHoldPending={
              showCreditShareSettlement ? creditLabHoldPending : null
            }
            abutmentShareHoldPending={
              showCreditShareSettlement ? creditAbutmentHoldPending : null
            }
          />
          {hasBudgetRange && !isLab ? (
            <p className="text-[11px] text-muted-foreground">
              기공소 수가에 이 치과 할증이 있으면 함께 반영됩니다.
            </p>
          ) : null}
        </div>
      ) : hasBudgetRange ? (
        <div className="space-y-1.5 tabular-nums">
          <p>
            보철기공비{" "}
            <span className="font-medium">
              {formatWonRange(budgetLabFeeMin, budgetLabFeeMax)}
            </span>
          </p>
          {quote.abutmentRetailTotal > 0 || quote.abutmentQuotePending ? (
            <p>
              어벗 디자인+생산비{" "}
              <span className="font-medium">
                {quote.abutmentQuotePending && quote.abutmentRetailTotal <= 0
                  ? "별도 고지"
                  : formatManWon(quote.abutmentRetailTotal)}
              </span>
            </p>
          ) : null}
          <p className="font-medium">
            기공비 총액{" "}
            {quote.abutmentRetailTotal > 0
              ? formatWonRange(
                  budgetLabFeeMin + quote.abutmentRetailTotal,
                  budgetLabFeeMax + quote.abutmentRetailTotal,
                )
              : formatWonRange(budgetLabFeeMin, budgetLabFeeMax)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            기공소 수가에 이 치과 할증이 있으면 함께 반영됩니다.
          </p>
        </div>
      ) : labFeeUnset ? null : (
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
          <p className="font-medium text-foreground/80">{shippingHeaderLabel}</p>
          {shippingHintLines.map((row) => (
            <p key={row.key} className="tabular-nums">
              {row.label}{" "}
              <span className="font-medium text-foreground">
                {formatManWon(row.amount)}
              </span>
              {row.holdPending !== null && row.holdPending !== undefined ? (
                <span
                  className={cn(
                    "ml-1.5 inline-flex rounded border px-1 py-px text-[10px] font-medium leading-tight",
                    creditShareSettlementClass(row.holdPending),
                  )}
                >
                  {creditShareSettlementLabel(row.holdPending)}
                </span>
              ) : null}
            </p>
          ))}
          {skipJig && hasAbutsOriginShip ? (
            <p>지그 제작 불필요 — 물류만 적용(배송비 과금과 무관).</p>
          ) : null}
        </div>
      ) : null}
      {isDetail && !isLab && (quote.total > 0 || shippingTotal > 0) ? (
        <p className="mt-1.5 border-t border-foreground/15 pt-1.5 font-medium tabular-nums">
          {hasBudgetRange
            ? `크레딧 소비 ${formatWonRange(
                creditMin + shippingTotal,
                amount + shippingTotal,
              )}`
            : `크레딧 소비 총액 ${formatManWon(quote.total + shippingTotal)}`}
        </p>
      ) : null}
    </>
  );

  if (isDetail) {
    return (
      <div
        data-no-tooth-marquee=""
        className={cn(
          "w-full max-w-full select-text px-1 py-1 text-xs leading-relaxed",
          className,
        )}
        role="region"
        aria-label="기공의뢰 정산 상세"
      >
        {breakdownPanel}
      </div>
    );
  }

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
            : cn(
                "rounded-lg border border-primary-muted/50 bg-primary-soft/40 px-2 py-1.5 sm:px-3",
                hasChartSideActions ? "w-full justify-between" : "justify-center",
              ),
          className,
        )}
        role="note"
        title={
          !isLab && !labFeeUnset && !hasMissingFees
            ? "마우스를 올리면 금액이 보입니다"
            : undefined
        }
        onClick={isCard ? (event) => event.stopPropagation() : undefined}
        onKeyDown={isCard ? (event) => event.stopPropagation() : undefined}
      >
        {hasLeading && !isCard ? (
          <div
            className="flex shrink-0 items-center"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {leadingAction}
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            hasChartSideActions && "flex-1 justify-center",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "min-w-0 cursor-default",
                  isCard
                    ? "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm"
                    : "",
                  !isLab &&
                    !labFeeUnset &&
                    !hasMissingFees &&
                    "select-none blur-[8px] transition-[filter] duration-150 group-hover:select-text group-hover:blur-none group-focus-within:select-text group-focus-within:blur-none",
                )}
              >
                <span
                  className={cn(
                    "font-semibold tabular-nums text-slate-800",
                    isCard ? "text-sm" : "text-sm sm:text-base",
                  )}
                >
                  {labFeeUnset ? (
                    <>
                      <span className="font-medium text-slate-600">기공비 </span>
                      <span className="text-accent-strong">미설정</span>
                      {abutmentOnlyAmount > 0 ? (
                        <span className="ml-1.5 font-semibold tabular-nums text-slate-800">
                          · 어벗 디자인+생산비 {formatManWon(abutmentOnlyAmount)}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-slate-600">{title} </span>
                      {hasBudgetRange && !isLab
                        ? formatWonRange(creditMin, amount)
                        : formatManWon(amount)}
                      {hasMissingFees ? (
                        <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                          · {missingFeeLabel} 미설정
                        </span>
                      ) : null}
                    </>
                  )}
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
                      isCard
                        ? "text-[12px]"
                        : "mt-0.5 block truncate text-[11px]",
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
              {breakdownPanel}
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
