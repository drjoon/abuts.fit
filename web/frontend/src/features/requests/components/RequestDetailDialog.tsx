import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RequestDetailDialogCaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantSystem?: string;
  implantType?: string;
  maxDiameter?: number | null;
  connectionDiameter?: number | null;
};

export type RequestDetailDialogRequest = {
  title?: string;
  status?: string;
  manufacturerStage?: string;
  requestId?: string;
  createdAt?: string;
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
};

type RequestDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request?: RequestDetailDialogRequest | null;
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

const formatDate = (value?: string) => {
  if (!value) return "-";
  try {
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return value;
  }
};

export const getStatusBadge = (status: string, manufacturerStage?: string) => {
  if (manufacturerStage) {
    switch (manufacturerStage) {
      case "의뢰":
        return <Badge variant="outline">의뢰</Badge>;
      case "의뢰접수":
        return <Badge variant="outline">의뢰접수</Badge>;
      case "CAM":
        return <Badge variant="default">CAM</Badge>;
      case "생산":
        return <Badge variant="default">생산</Badge>;
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
      return <Badge variant="outline">의뢰</Badge>;
    case "의뢰접수":
      return <Badge variant="outline">의뢰접수</Badge>;
    case "가공전":
      return <Badge variant="default">CAM</Badge>;
    case "가공후":
      return <Badge variant="default">생산</Badge>;
    case "배송중":
      return <Badge variant="default">발송</Badge>;
    case "완료":
      return <Badge variant="secondary">완료</Badge>;
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
  description,
  additionalContent,
  extraBadge,
  footer,
}: RequestDetailDialogProps) => {
  const caseInfos = request?.caseInfos || {};
  const implantLabel = [
    caseInfos.implantManufacturer,
    caseInfos.implantSystem,
    caseInfos.implantType,
  ]
    .filter(Boolean)
    .join(" / ")
    .trim();

  const implantDisplay = implantLabel || "-";

  const maxDiameter = caseInfos.maxDiameter;
  const connectionDiameter = caseInfos.connectionDiameter;

  const estimatedShipYmd =
    request?.timeline?.estimatedShipYmd ||
    request?.estimatedShipYmd ||
    request?.dueDate;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent className="w-full sm:w-[48%] max-w-[560px] max-h-[80vh] overflow-y-auto">
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
                  request.status || "-",
                  request.manufacturerStage,
                )}
              {extraBadge}
            </div>
          </div>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="space-y-4 text-sm text-foreground">
            <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
              <span className="text-slate-600">의뢰번호</span>
              <span className="font-medium">{request?.requestId || "-"}</span>
            </div>
            <div className="grid grid-cols-[90px_1fr] gap-3 items-center">
              <span className="text-slate-600">의뢰일</span>
              <span className="font-medium">
                {formatTimestamp(request?.createdAt)}
              </span>
            </div>
            {estimatedShipYmd && (
              <div className="grid grid-cols-[90px_1fr] gap-3 items-center text-blue-700 font-medium">
                <span>발송 예정일</span>
                <span>{formatDate(estimatedShipYmd)}</span>
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
                <span>남은 기간</span>
                <span className="font-medium">
                  {request.daysUntilDue}일 남음
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
            {additionalContent}
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
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
