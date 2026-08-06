import { type ReactNode } from "react";

// change-log:
// - 2026-08-06: 남은기간 표시를 "N일 남음" → "출고 N일전"으로 통일.
// - 2026-08-06: 발송 예정일 → 출고 예정일 (제조사 출발일).
// related files:
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { resolveQuotedPriceAmount } from "@/shared/shipping/shippingMode";
import {
  useSystemSettings,
  CREDIT_SETTINGS_DEFAULTS,
} from "@/hooks/useSystemSettings";

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
  const expressFee =
    systemSettings?.creditSettings?.expressFee ??
    CREDIT_SETTINGS_DEFAULTS.expressFee;
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
  const priceAmount = resolveQuotedPriceAmount({
    price: request?.price,
    shippingMode: request,
    expressFee,
  });
  const priceRule = request?.price?.rule;
  const isRemakeFixed = priceRule === "remake_fixed_10000";
  const isRemakeMonthlyFree = priceRule === "remake_monthly_free_3";

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
        className={`w-[min(94vw,620px)] max-w-[620px] max-h-[92vh] ${
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
          <div className="space-y-4 text-sm text-foreground">
            {isUnmachinable && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 space-y-1">
                <div className="text-xs font-semibold text-yellow-700">불완전가공 판정</div>
                <div className="text-sm text-yellow-800">
                  {unmachinableReason || "불완전가공 사유가 등록되지 않았습니다."}
                </div>
              </div>
            )}
            {estimatedShipYmd && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center text-blue-700 font-medium">
                <span>출고 예정일</span>
                <span>{formatDateWithDay(estimatedShipYmd)}</span>
              </div>
            )}
            {priceAmount != null && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
                <span className="text-slate-600">금액(공급가)</span>
                <span className="font-medium flex items-center justify-between gap-2">
                  <span>{Number(priceAmount).toLocaleString()}원</span>
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
                </span>
              </div>
            )}
            {typeof request?.daysOverdue === "number" && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center text-destructive">
                <span>경과</span>
                <span className="font-medium">
                  {request.daysOverdue}일 지연
                </span>
              </div>
            )}
            {typeof request?.daysUntilDue === "number" && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center text-slate-600">
                <span>출고까지</span>
                <span className="font-medium">
                  출고 {request.daysUntilDue}일전
                </span>
              </div>
            )}
            {request?.deliveryInfoRef?.deliveredAt && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center text-green-700 font-medium">
                <span>배송 완료일</span>
                <span>
                  {formatTimestamp(request.deliveryInfoRef.deliveredAt)}
                </span>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              {additionalContent && (
                <div className="rounded border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
                  {additionalContent}
                </div>
              )}
              <div className="rounded border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-600">로트번호</div>
                  <div className="font-mono text-sm text-slate-900">
                    <span className="font-medium text-right">
                      {selectedDetailLotNumber}
                    </span>
                  </div>
                  {modelNumberLabel && (
                    <div className="text-right">
                      <div className="text-xs text-slate-600 mb-1">
                        모델번호
                      </div>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {modelNumberLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-600">의뢰번호</div>
                  <div className="font-mono text-sm text-slate-900">
                    {request?.requestId || "-"}
                  </div>
                </div>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-600">의뢰일</div>
                  <div className="font-mono text-sm text-slate-900">
                    {formatTimestamp(request?.createdAt)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">치과명</span>
                <span className="font-medium text-right">
                  {caseInfos.clinicName || "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">환자명</span>
                <span className="font-medium text-right">
                  {caseInfos.patientName || "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">치아번호</span>
                <span className="font-medium text-right">
                  {caseInfos.tooth || "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">임플란트</span>
                <span className="font-medium text-right whitespace-pre">
                  {implantDisplay}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">디자인 소프트웨어</span>
                <span className="font-medium text-right">
                  {String(caseInfos.designSoftware || "").trim() || "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">직경</span>
                <span className="font-medium text-right">
                  {Number.isFinite(maxDiameter as number)
                    ? `${Number(maxDiameter).toFixed(1)} mm`
                    : "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">커넥션 직경</span>
                <span className="font-medium text-right">
                  {Number.isFinite(connectionDiameter as number)
                    ? `${Number(connectionDiameter).toFixed(1)} mm`
                    : "-"}
                </span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-slate-600">유지홈</span>
                <span className="font-medium text-right">
                  {retentionGrooveLabel}
                </span>
              </div>

            </div>
          </div>
        </DialogDescription>
        {footer || (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
