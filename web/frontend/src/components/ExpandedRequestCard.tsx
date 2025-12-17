import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  Clock,
  User,
  Building2,
  Upload,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Clock8,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

interface ExpandedRequestCardProps {
  request: any;
  onClose: () => void;
  currentUserId?: string;
  currentUserRole?: "requestor" | "manufacturer" | "admin";
}

interface PaymentStatus {
  status: "unpaid" | "pending" | "paid" | "failed";
  amount: number;
  dueDate?: string;
  paidDate?: string;
  paymentMethod?: string;
}

export const ExpandedRequestCard = ({
  request,
  onClose,
  currentUserId = "1",
  currentUserRole = "requestor",
}: ExpandedRequestCardProps) => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // 결제 상태 정보 (실제 구현 시 API에서 가져와야 함)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    status: "unpaid",
    amount: 150000, // 예시 금액
    dueDate: "2024-06-30",
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case "requestor":
        return "text-blue-600";
      case "manufacturer":
        return "text-green-600";
      case "admin":
        return "text-purple-600";
      default:
        return "text-gray-600";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "requestor":
        return "치과기공소";
      case "manufacturer":
        return "애크로덴트(제조사)";
      case "admin":
        return "어벗츠.핏(운영자)";
      default:
        return "사용자";
    }
  };

  const getStatusBadge = (status1?: string, status2?: string) => {
    const statusText =
      status2 && status2 !== "없음" ? `${status1}(${status2})` : status1;

    switch (status1) {
      case "의뢰접수":
        return <Badge variant="outline">{statusText}</Badge>;
      case "가공":
        return <Badge variant="default">{statusText}</Badge>;
      case "세척/검사/포장":
        return (
          <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs">
            {statusText}
          </Badge>
        );
      case "배송":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
            {statusText}
          </Badge>
        );
      case "완료":
        return <Badge variant="secondary">{statusText}</Badge>;
      case "취소":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
            {statusText}
          </Badge>
        );
      default:
        return <Badge>{statusText || "상태 미지정"}</Badge>;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
      toast({
        title: "파일이 첨부되었습니다",
        description: `${selectedFiles.length}개 파일이 추가되었습니다.`,
      });
    }
  };

  const handleCardDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleCardDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      setFiles((prev) => [...prev, ...droppedFiles]);

      toast({
        title: "파일이 업로드되었습니다",
        description: `${droppedFiles.length}개 파일이 추가되었습니다.`,
      });
    },
    [toast]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 결제 처리 함수
  const handlePayment = () => {
    // 토스페이먼츠 퀵자동이체 결제창 호출
    // 실제 구현 시 토스페이먼츠 SDK를 사용하여 결제창을 띄움
    window.location.href = `/api/payments/process-payment?requestId=${
      request.id
    }&amount=${paymentStatus.amount}&returnUrl=${encodeURIComponent(
      window.location.href
    )}`;
  };

  // 결제 상태에 따른 배지 색상 및 텍스트
  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 결제완료
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 flex items-center gap-1">
            <Clock8 className="h-3 w-3" /> 결제중
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> 결제실패
          </Badge>
        );
      case "unpaid":
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-200 flex items-center gap-1">
            <CreditCard className="h-3 w-3" /> 미결제
          </Badge>
        );
    }
  };

  return (
    <Card
      className={`w-full max-w-4xl max-h-[90vh] flex flex-col transition-all ${
        isDragOver ? "ring-2 ring-primary bg-primary/5" : ""
      }`}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      <CardHeader className="flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl flex items-center gap-2">
              {request.title}
              {(request.referenceId || (request as any).referenceId) && (
                <Badge
                  variant="outline"
                  className="text-xs font-normal text-slate-500"
                >
                  {(() => {
                    const raw =
                      (request as any).referenceId ??
                      (request as any).referenceIds ??
                      null;

                    if (!raw) return null;

                    const list: string[] = Array.isArray(raw)
                      ? raw
                      : [String(raw)];

                    if (!list.length) return null;

                    const first = list[0];
                    const extra = list.length - 1;
                    const label = extra > 0 ? `${first} 외 ${extra}건` : first;

                    return <>Ref: {label}</>;
                  })()}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {request.date || request.requestDate}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {request.manufacturer || request.client || "미배정"}
              </span>
              {getStatusBadge(
                request.status1 || request.status,
                request.status2
              )}
            </div>
            {isDragOver && (
              <div className="text-sm text-primary font-medium">
                파일을 놓아서 업로드하세요
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Request Details */}
        <div className="bg-muted/30 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-medium text-sm mb-1 text-muted-foreground">
                환자 정보
              </h4>
              <div className="text-sm font-medium">
                {request.caseInfos?.patientName || request.patientName}{" "}
                <span className="text-muted-foreground font-normal">
                  (치아 {request.caseInfos?.tooth || request.tooth})
                </span>
              </div>
              {request.dentistName && (
                <div className="text-xs text-muted-foreground mt-1">
                  {request.dentistName}
                </div>
              )}
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1 text-muted-foreground">
                사양 정보
              </h4>
              <div className="text-sm space-y-1">
                {(() => {
                  const caseInfos = request.caseInfos || {};
                  const spec = request.specifications || {}; // Legacy

                  const implantManufacturer =
                    caseInfos.implantManufacturer ||
                    spec.implantManufacturer ||
                    spec.implantCompany ||
                    request.implantManufacturer;
                  const implantSystem =
                    caseInfos.implantSystem ||
                    spec.implantSystem ||
                    spec.implantProduct ||
                    request.implantSystem;
                  const implantType =
                    caseInfos.implantType ||
                    spec.implantType ||
                    request.implantType;

                  const maxDiameter =
                    caseInfos.maxDiameter ??
                    spec.maxDiameter ??
                    request.maxDiameter;
                  const connectionDiameter =
                    caseInfos.connectionDiameter ??
                    spec.connectionDiameter ??
                    request.connectionDiameter;

                  if (
                    !implantManufacturer &&
                    !implantSystem &&
                    !implantType &&
                    maxDiameter == null &&
                    connectionDiameter == null
                  ) {
                    return null;
                  }

                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-20">
                          제조사
                        </span>
                        <span>{implantManufacturer || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-20">
                          시스템
                        </span>
                        <span>{implantSystem || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-20">
                          유형
                        </span>
                        <span>{implantType || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-20">
                          최대 직경
                        </span>
                        <span>
                          {maxDiameter != null
                            ? `${maxDiameter.toFixed(2)}mm`
                            : "-"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs w-20">
                          커넥션 직경
                        </span>
                        <span>
                          {connectionDiameter != null
                            ? `${connectionDiameter.toFixed(2)}mm`
                            : "-"}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <h4 className="font-medium text-sm mb-2 text-muted-foreground">
            메모
          </h4>
          <p className="text-sm">{request.description || "메모가 없습니다."}</p>
        </div>

        {/* Payment Section - 의뢰자인 경우에만 표시 */}
        {currentUserRole === "requestor" && (
          <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium flex items-center gap-1">
                <CreditCard className="h-4 w-4" /> 결제 정보
              </h4>
              {getPaymentStatusBadge(paymentStatus.status)}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <span className="text-muted-foreground">금액:</span>{" "}
                {paymentStatus.amount.toLocaleString()}원
              </div>
              <div>
                <span className="text-muted-foreground">결제기한:</span>{" "}
                {paymentStatus.dueDate}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                표시된 금액에는 부가세(VAT)와 배송비가 포함되어 있지 않으며,
                부가세(VAT) 및 배송비는 별도 청구됩니다.
              </p>
              {paymentStatus.paidDate && (
                <div>
                  <span className="text-muted-foreground">결제일:</span>{" "}
                  {paymentStatus.paidDate}
                </div>
              )}
              {paymentStatus.paymentMethod && (
                <div>
                  <span className="text-muted-foreground">결제방법:</span>{" "}
                  {paymentStatus.paymentMethod}
                </div>
              )}
            </div>

            {paymentStatus.status === "unpaid" && (
              <Button
                onClick={handlePayment}
                className="w-full"
                variant="default"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                자동이체로 결제하기
              </Button>
            )}

            {paymentStatus.status === "failed" && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>결제 실패</AlertTitle>
                <AlertDescription>
                  결제가 실패했습니다. 다시 시도해주세요.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Payment Section - 제조사인 경우에만 표시 */}
        {currentUserRole === "manufacturer" && (
          <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium flex items-center gap-1">
                <CreditCard className="h-4 w-4" /> 결제 정보
              </h4>
              {getPaymentStatusBadge(paymentStatus.status)}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">금액:</span>{" "}
                {paymentStatus.amount.toLocaleString()}원
              </div>
              {paymentStatus.status === "paid" ? (
                <div>
                  <span className="text-muted-foreground">결제일:</span>{" "}
                  {paymentStatus.paidDate}
                </div>
              ) : (
                <div>
                  <span className="text-muted-foreground">결제기한:</span>{" "}
                  {paymentStatus.dueDate}
                </div>
              )}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              금액은 부가세(VAT) 및 배송비 제외 기준이며, 부가세와 배송비는
              의뢰자에게 별도로 청구됩니다.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
