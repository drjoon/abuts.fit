import { type ReactNode } from "react";

// change-log:
// - 2026-08-09: 배송비(출고 시)를 크레딧 사용액 아래로 이동, 별도 차감 안내 문구 분리.
// - 2026-08-09: 디자인+생산 — 커스텀어벗 치아만 표시·과금 수량. 신속비=단가×어벗수.
// - 2026-08-09: 디자인+생산(우열)에서 STL 다어벗 공통이 아닌 스펙(임플란트/SW/직경/유지홈) 숨김.
// - 2026-08-09: 의뢰 상세 2열 레이아웃(좌: 비용, 우: 케이스 정보).
// - 2026-08-09: 비용 세부 내역(가공/디자인/배송·신속) 표시.
// - 2026-08-09: 기본 하단 "닫기" 버튼 제거(헤더 X로 충분, 레이아웃 깨짐).
// - 2026-08-06: 남은기간 표시를 "N일 남음" → "출고 N일전"으로 통일.
// - 2026-08-06: 발송 예정일 → 출고 예정일 (제조사 출발일).
// related files:
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/backend/controllers/requests/designPrice.utils.js
// - .cursor/rules/design-fee.mdc
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatImplantDisplay } from "@/utils/implant";
import { formatDateWithDay } from "@/utils/dateFormat";
import { generateModelNumber } from "@/utils/modelNumber";
import { resolveQuotedPriceAmount, resolveShippingMode } from "@/shared/shipping/shippingMode";
import {
  useSystemSettings,
  CREDIT_SETTINGS_DEFAULTS,
} from "@/hooks/useSystemSettings";

export type RequestDetailDialogToothWork = {
  toothNumber?: string | null;
  prosthesisType?: string | null;
  customAbutment?: boolean | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
};

export type RequestDetailDialogCaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  designSoftware?: string;
  maxDiameter?: number | null;
  connectionDiameter?: number | null;
  retentionGroove?: "none" | "shallow" | "deep";
  requestorHexRotation?: "STL모델대로" | "헥스30도회전";
  finalHexRotation?: "STL모델대로" | "헥스30도회전";
  productMode?: string | null;
  toothWorks?: RequestDetailDialogToothWork[] | null;
};

export type RequestDetailDialogRequest = {
  title?: string;
  manufacturerStage?: string;
  requestId?: string;
  createdAt?: string;
  rnd?: {
    unmachinableAt?: string | null;
    unmachinableReason?: string | null;
  } | null;
  lotNumber?: {
    value?: string | null;
  } | null;
  timeline?: {
    estimatedShipYmd?: string;
  };
  estimatedShipYmd?: string;
  deliveryInfoRef?: {
    deliveredAt?: string;
  };
  caseInfos?: RequestDetailDialogCaseInfos;
  dueDate?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  message?: string;
  riskLevel?: string;
  shippingMode?: string | null;
  finalShipping?: { mode?: string | null } | null;
  originalShipping?: { mode?: string | null } | null;
  price?: {
    amount?: number;
    expressFee?: number | null;
    expressFeeStatus?: string | null;
    designFee?: number | null;
    abutmentQty?: number | null;
    rule?: string;
    currency?: string;
  };
};

type RequestDetailDialogAssociatedRow = {
  refRequestId?: string;
  refRequestSummary?: {
    requestId?: string;
  } | null;
  lotNumber?: {
    value?: string | null;
  } | null;
  caseInfos?: RequestDetailDialogCaseInfos | null;
};

type RequestDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: RequestDetailDialogRequest | null;
  rows?: RequestDetailDialogAssociatedRow[];
  description?: ReactNode;
  additionalContent?: ReactNode;
  extraBadge?: ReactNode;
  footer?: ReactNode;
};

const formatTimestamp = (value?: string) => {
  if (!value) return "-";
  try {
    const date = new Date(value);
    return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return value;
  }
};

/** 단가 × 갯수 = 합계 */
const formatUnitTimesQty = (unit: number, qty: number, total: number) => {
  const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
  const safeUnit = Math.max(0, Number(unit) || 0);
  const safeTotal = Math.max(0, Number(total) || 0);
  return `${safeUnit.toLocaleString()}원 × ${safeQty} = ${safeTotal.toLocaleString()}원`;
};

const isPonticProsthesisType = (prosthesisType: unknown) =>
  /^pontic$/i.test(String(prosthesisType || "").trim());

const isBillableDesignAbutmentRow = (row: RequestDetailDialogToothWork | null | undefined) => {
  const toothNumber = String(row?.toothNumber || "").trim();
  const prosthesisType = String(row?.prosthesisType || "").trim();
  if (!/^[1-4][1-8]$/.test(toothNumber) || !prosthesisType) return false;
  if (isPonticProsthesisType(prosthesisType)) return false;
  if (row?.customAbutment === true) return true;
  return Boolean(
    String(row?.implantManufacturer || "").trim() ||
      String(row?.implantBrand || "").trim() ||
      String(row?.implantFamily || "").trim() ||
      String(row?.implantType || "").trim(),
  );
};

const resolveDesignAbutmentToothLabel = (
  caseInfos: RequestDetailDialogCaseInfos,
) => {
  const direct = String(caseInfos.tooth || "").trim();
  const works = Array.isArray(caseInfos.toothWorks) ? caseInfos.toothWorks : [];
  const fromWorks = works
    .filter((row) => isBillableDesignAbutmentRow(row))
    .map((row) => String(row?.toothNumber || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(fromWorks)).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b), "ko");
  });
  if (unique.length > 0) return unique.join(", ");
  return direct || "-";
};



export const getStatusBadge = (status: string, manufacturerStage?: string) => {
  if (manufacturerStage) {
    switch (manufacturerStage) {
      case "의뢰":
        return <Badge variant="outline">준비</Badge>;
      case "CAM":
      case "가공":
      case "생산":
        return <Badge variant="default">가공</Badge>;
      case "세척.포장":
      case "세척.패킹":
        return <Badge variant="default">세척.패킹</Badge>;
      case "발송":
      case "포장.발송":
        return <Badge variant="default">포장.발송</Badge>;
      case "추적관리":
        return <Badge variant="secondary">추적관리</Badge>;
      default:
        break;
    }
  }

  switch (status) {
    case "의뢰":
      return <Badge variant="outline">준비</Badge>;
    case "가공전":
      return <Badge variant="default">가공</Badge>;
    case "가공후":
      return <Badge variant="default">생산</Badge>;
    case "배송중":
      return <Badge variant="default">발송</Badge>;
    case "완료":
    case "추적관리":
      return <Badge variant="secondary">추적관리</Badge>;
    case "취소":
      return <Badge variant="destructive">취소</Badge>;
    default:
      return <Badge variant="outline">{status || "-"}</Badge>;
  }
};

export const RequestDetailDialog = ({
  open,
  onOpenChange,
  request,
  rows = [],
  description,
  additionalContent,
  extraBadge,
  footer,
}: RequestDetailDialogProps) => {
  const { data: systemSettings } = useSystemSettings();
  const expressFeeSetting =
    systemSettings?.creditSettings?.expressFee ??
    CREDIT_SETTINGS_DEFAULTS.expressFee;
  const shippingFeeSetting =
    systemSettings?.creditSettings?.shippingFee ??
    CREDIT_SETTINGS_DEFAULTS.shippingFee;
  const caseInfos = request?.caseInfos || {};
  const implantDisplay = formatImplantDisplay(caseInfos);
  const modelNumberLabel = generateModelNumber(caseInfos);

  const maxDiameter = caseInfos.maxDiameter;
  const connectionDiameter = caseInfos.connectionDiameter;
  const retentionGrooveLabel =
    caseInfos.retentionGroove === "deep" ? "있음" : "없음";

  const estimatedShipYmd =
    request?.timeline?.estimatedShipYmd ||
    request?.estimatedShipYmd ||
    request?.dueDate;
  const shippingMode = resolveShippingMode(request);
  const priceAmount = resolveQuotedPriceAmount({
    price: request?.price,
    shippingMode: request,
    expressFee: expressFeeSetting,
  });
  const priceRule = request?.price?.rule;
  const isRemakeFixed = priceRule === "remake_fixed_10000";
  const isRemakeMonthlyFree = priceRule === "remake_monthly_free_3";

  const designFeeTotal = Math.max(0, Number(request?.price?.designFee) || 0);
  const expressFeeStatus = String(request?.price?.expressFeeStatus || "").trim();
  const isDesignMode =
    String(caseInfos.productMode || "").trim() === "design_custom_abutment" ||
    designFeeTotal > 0;
  const abutmentQty = Math.max(
    0,
    Math.floor(Number(request?.price?.abutmentQty) || 0),
  );
  const feeQty = isDesignMode
    ? abutmentQty > 0
      ? abutmentQty
      : 1
    : 1;
  const expressQty = isDesignMode
    ? Math.max(1, abutmentQty > 0 ? abutmentQty : feeQty)
    : 1;
  const expressFeeTotal =
    shippingMode === "express" && expressFeeStatus !== "cancelled"
      ? Math.max(
          0,
          Number(request?.price?.expressFee) ||
            Number(expressFeeSetting) * expressQty ||
            0,
        )
      : 0;
  const expressUnit =
    expressQty > 0 && expressFeeTotal > 0
      ? Math.round(expressFeeTotal / expressQty)
      : Math.max(0, Number(expressFeeSetting) || 0);
  const machiningFeeTotal =
    priceAmount != null
      ? Math.max(0, Number(priceAmount) - designFeeTotal - expressFeeTotal)
      : null;
  const machiningUnit =
    machiningFeeTotal != null && feeQty > 0
      ? Math.round(machiningFeeTotal / feeQty)
      : 0;
  const designUnit =
    designFeeTotal > 0 && feeQty > 0
      ? Math.round(designFeeTotal / feeQty)
      : 0;
  const shippingQty = 1;
  const toothDisplay = isDesignMode
    ? resolveDesignAbutmentToothLabel(caseInfos)
    : String(caseInfos.tooth || "").trim() || "-";

  const isUnmachinable = Boolean(request?.rnd?.unmachinableAt);
  const unmachinableReason = String(request?.rnd?.unmachinableReason || "").trim();

  const selectedDetailLedgerRow = request
    ? rows.find(
        (item) =>
          (item?.refRequestId || item?.refRequestSummary?.requestId || "") ===
          (request.requestId || ""),
      ) || null
    : null;

  const selectedDetailLotNumber =
    selectedDetailLedgerRow?.lotNumber?.value || "-";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={`w-[min(96vw,880px)] max-w-[880px] max-h-[92vh] overflow-y-auto ${
          isUnmachinable ? "border-yellow-300 ring-2 ring-yellow-200" : ""
        }`}
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>의뢰 상세</DialogTitle>
              {description && (
                <DialogDescription>
                  <span className="text-sm text-muted-foreground">
                    {description}
                  </span>
                </DialogDescription>
              )}
            </div>
            <div className="flex items-center gap-2 pr-8">
              {request &&
                getStatusBadge(
                  request.manufacturerStage || "-",
                  request.manufacturerStage,
                )}
              {isUnmachinable && (
                <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-700">
                  불완전가공
                </Badge>
              )}
              {extraBadge}
            </div>
          </div>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-foreground">
            {isUnmachinable && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 space-y-1">
                <div className="text-xs font-semibold text-yellow-700">불완전가공 판정</div>
                <div className="text-sm text-yellow-800">
                  {unmachinableReason || "불완전가공 사유가 등록되지 않았습니다."}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              {/* 좌열: 일정·비용 */}
              <div className="space-y-3 min-w-0">
                {estimatedShipYmd && (
                  <div className="grid grid-cols-[88px_1fr] gap-2 items-center text-blue-700 font-medium">
                    <span>출고 예정일</span>
                    <span>{formatDateWithDay(estimatedShipYmd)}</span>
                  </div>
                )}
                {typeof request?.daysOverdue === "number" && (
                  <div className="grid grid-cols-[88px_1fr] gap-2 items-center text-destructive">
                    <span>경과</span>
                    <span className="font-medium">
                      {request.daysOverdue}일 지연
                    </span>
                  </div>
                )}
                {typeof request?.daysUntilDue === "number" && (
                  <div className="grid grid-cols-[88px_1fr] gap-2 items-center text-slate-600">
                    <span>출고까지</span>
                    <span className="font-medium">
                      출고 {request.daysUntilDue}일전
                    </span>
                  </div>
                )}
                {request?.deliveryInfoRef?.deliveredAt && (
                  <div className="grid grid-cols-[88px_1fr] gap-2 items-center text-green-700 font-medium">
                    <span>배송 완료일</span>
                    <span>
                      {formatTimestamp(request.deliveryInfoRef.deliveredAt)}
                    </span>
                  </div>
                )}

                {priceAmount != null && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold tracking-wide text-slate-500">
                        비용 세부 내역
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isRemakeFixed && (
                          <Badge variant="secondary" className="text-[11px]">
                            리메이크 1만원
                          </Badge>
                        )}
                        {isRemakeMonthlyFree && (
                          <Badge variant="secondary" className="text-[11px]">
                            리메이크 무료(월 3건)
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-600 shrink-0">생산비</span>
                        <span className="font-medium tabular-nums text-right">
                          {formatUnitTimesQty(
                            machiningUnit,
                            feeQty,
                            Number(machiningFeeTotal || 0),
                          )}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-600 shrink-0">디자인비</span>
                        <span
                          className={`font-medium tabular-nums text-right ${
                            designFeeTotal > 0
                              ? "text-violet-700"
                              : "text-slate-500"
                          }`}
                        >
                          {designFeeTotal > 0
                            ? formatUnitTimesQty(
                                designUnit,
                                feeQty,
                                designFeeTotal,
                              )
                            : "없음"}
                        </span>
                      </div>
                      {expressFeeTotal > 0 && (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-slate-600 shrink-0">신속출고</span>
                          <span className="font-medium tabular-nums text-right text-amber-700">
                            {formatUnitTimesQty(
                              expressUnit,
                              expressQty,
                              expressFeeTotal,
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-200 pt-2 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-700 font-medium">크레딧 사용액</span>
                        <span className="font-semibold tabular-nums">
                          {Number(priceAmount).toLocaleString()}원
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        {`크레딧 사용액은 생산비와 디자인비${
                          expressFeeTotal > 0 ? "·신속비" : ""
                        }입니다.`}
                      </p>
                    </div>

                    <div className="border-t border-slate-200 pt-2 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-slate-600 shrink-0">
                          배송비
                          <span className="ml-1 text-xs text-slate-400">
                            (출고 시)
                          </span>
                        </span>
                        <span className="font-medium tabular-nums text-right text-slate-700">
                          {formatUnitTimesQty(
                            Number(shippingFeeSetting),
                            shippingQty,
                            Number(shippingFeeSetting),
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        배송비는 출고 시 박스 단위로 별도 차감됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 우열: 의뢰 정보 */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2.5 min-w-0">
                {additionalContent && (
                  <div className="rounded border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
                    {additionalContent}
                  </div>
                )}
                <div className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-2 items-center">
                  <span className="text-slate-600">로트번호</span>
                  <span className="font-mono text-sm text-right text-slate-900">
                    {selectedDetailLotNumber}
                  </span>
                  <span className="text-slate-600">모델번호</span>
                  <span className="text-right">
                    {modelNumberLabel ? (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {modelNumberLabel}
                      </span>
                    ) : (
                      "-"
                    )}
                  </span>
                  <span className="text-slate-600">의뢰번호</span>
                  <span className="font-mono text-sm text-right text-slate-900 break-all">
                    {request?.requestId || "-"}
                  </span>
                  <span className="text-slate-600">의뢰일</span>
                  <span className="font-mono text-sm text-right text-slate-900">
                    {formatTimestamp(request?.createdAt)}
                  </span>
                  <span className="text-slate-600">치과명</span>
                  <span className="font-medium text-right">
                    {caseInfos.clinicName || "-"}
                  </span>
                  <span className="text-slate-600">환자명</span>
                  <span className="font-medium text-right">
                    {caseInfos.patientName || "-"}
                  </span>
                  <span className="text-slate-600">치아번호</span>
                  <span className="font-medium text-right">
                    {toothDisplay}
                  </span>
                  {/* 디자인+생산: 한 STL에 다어벗 → 단건 스펙 행은 표시하지 않음 */}
                  {!isDesignMode && (
                    <>
                      <span className="text-slate-600">임플란트</span>
                      <span className="font-medium text-right whitespace-pre-wrap">
                        {implantDisplay}
                      </span>
                      <span className="text-slate-600">디자인 SW</span>
                      <span className="font-medium text-right">
                        {String(caseInfos.designSoftware || "").trim() || "-"}
                      </span>
                      <span className="text-slate-600">직경</span>
                      <span className="font-medium text-right">
                        {Number.isFinite(maxDiameter as number)
                          ? `${Number(maxDiameter).toFixed(1)} mm`
                          : "-"}
                      </span>
                      <span className="text-slate-600">커넥션 직경</span>
                      <span className="font-medium text-right">
                        {Number.isFinite(connectionDiameter as number)
                          ? `${Number(connectionDiameter).toFixed(1)} mm`
                          : "-"}
                      </span>
                      <span className="text-slate-600">유지홈</span>
                      <span className="font-medium text-right">
                        {retentionGrooveLabel}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogDescription>
        {footer}
      </DialogContent>
    </Dialog>
  );
};
