import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Building, AlertCircle, Check, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaymentTabProps {
  userData: {
    name?: string;
    role?: string;
    id?: string;
  };
}

export const PaymentTab = ({ userData }: PaymentTabProps) => {
  const { user } = useAuthStore();
  const userRole = userData?.role || "requestor";

  const paymentId = useMemo(() => {
    return String(userData?.id || user?.id || user?.email || "guest").trim();
  }, [user?.email, user?.id, userData?.id]);

  const storageKey = useMemo(() => {
    return `abutsfit:payment-settings:v1:${paymentId || "guest"}`;
  }, [paymentId]);

  // 회원 유형에 따라 다른 초기 상태 설정
  const [paymentData, setPaymentData] = useState({
    // 계좌 정보 (제조사와 관리자만 사용)
    bankName: "국민은행",
    accountNumber: "123456-78-901234",
    accountHolder: userData?.name || "",

    // 자동이체 정보 (의뢰자와 제조사만 사용)
    paymentMethod: "bank_transfer",
    autoPayment: true,
    registrationStatus: "unregistered", // 'unregistered', 'pending', 'registered'
    autoTransferAgreement: false,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      setPaymentData((prev) => ({
        ...prev,
        ...(parsed as any),
      }));
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(paymentData));
    } catch {
      // ignore
    }
  }, [paymentData, storageKey]);

  const toggleAutoPayment = () => {
    setPaymentData((prev) => ({
      ...prev,
      autoPayment: !prev.autoPayment,
    }));
  };

  const toggleAutoTransferAgreement = () => {
    setPaymentData((prev) => ({
      ...prev,
      autoTransferAgreement: !prev.autoTransferAgreement,
    }));
  };

  const handleRegisterAutoTransfer = () => {
    // 토스페이먼츠 퀵계좌이체 등록 프로세스 시작
    // 실제 구현 시에는 토스페이먼츠 SDK를 사용하여 결제창을 띄움
    window.location.href = `/api/payments/register-auto-transfer?userId=${
      userData?.id
    }&returnUrl=${encodeURIComponent(window.location.href)}`;
  };

  // 사용자 유형에 따른 결제 정보 텍스트
  const getPaymentInfoText = () => {
    switch (userRole) {
      case "requestor":
        return "의뢰자는 제조사에게 제작 대금을 지불합니다. 자동이체 설정을 통해 간편하게 결제할 수 있습니다.";
      case "manufacturer":
        return "제조사는 의뢰자로부터 대금을 받고, 어벗츠.핏에 정해진 수가를 자동으로 지불합니다. 계좌정보와 자동이체 모두 설정이 필요합니다.";
      case "admin":
        return "관리자는 제조사로부터 정해진 수가를 자동으로 수령합니다. 계좌정보 설정이 필요합니다.";
      default:
        return "계좌이체 정보를 설정하고 자동이체를 등록하세요.";
    }
  };

  // 회원 유형별 UI 표시 여부 결정 함수
  const shouldShowAccountInfo = () => {
    return userRole === "manufacturer" || userRole === "admin";
  };

  const shouldShowAutoTransfer = () => {
    return userRole === "requestor" || userRole === "manufacturer";
  };

  const shouldShowReceivePayment = () => {
    return userRole === "manufacturer" || userRole === "admin";
  };

  const shouldShowMakePayment = () => {
    return userRole === "requestor" || userRole === "manufacturer";
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          결제 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTitle>결제 정보</AlertTitle>
          <AlertDescription>{getPaymentInfoText()}</AlertDescription>
        </Alert>

        <div className="space-y-4">
          {/* 결제 받기 정보 섹션 - 제조사와 관리자만 표시 */}
          {shouldShowReceivePayment() && (
            <div>
              <h3 className="text-lg font-medium">결제 받기 정보</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {userRole === "admin"
                  ? "제조사로부터 결제를 받을 계좌 정보를 입력해주세요."
                  : "의뢰자로부터 결제를 받을 계좌 정보를 입력해주세요."}
              </p>

              <div className="bg-muted/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">
                    토스페이먼츠 퀵계좌이체 안내
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  토스페이먼츠 퀵계좌이체를 통해 자동으로 결제를 받을 수
                  있습니다. 아래 계좌 정보를 등록하시면 결제가 해당 계좌로 자동
                  입금됩니다.
                </p>
              </div>

              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">은행명</Label>
                    <Select
                      value={paymentData.bankName}
                      onValueChange={(value) =>
                        setPaymentData({ ...paymentData, bankName: value })
                      }
                    >
                      <SelectTrigger id="bankName">
                        <SelectValue placeholder="은행을 선택해주세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="국민은행">국민은행</SelectItem>
                        <SelectItem value="신한은행">신한은행</SelectItem>
                        <SelectItem value="우리은행">우리은행</SelectItem>
                        <SelectItem value="하나은행">하나은행</SelectItem>
                        <SelectItem value="삼성은행">삼성은행</SelectItem>
                        <SelectItem value="카카오뱅크">카카오뱅크</SelectItem>
                        <SelectItem value="토스뱅크">토스뱅크</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">계좌번호</Label>
                    <Input
                      id="accountNumber"
                      placeholder="000000-00-000000"
                      value={paymentData.accountNumber}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          accountNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accountHolder">예금주</Label>
                  <Input
                    id="accountHolder"
                    placeholder="예금주명을 입력해주세요"
                    value={paymentData.accountHolder}
                    onChange={(e) =>
                      setPaymentData({
                        ...paymentData,
                        accountHolder: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="mt-2"></div>
              </div>
            </div>
          )}

          {shouldShowAccountInfo() && shouldShowAutoTransfer() && <Separator />}

          {/* 자동이체 등록 - 의뢰자와 제조사만 표시 (결제하는 쪽) */}
          {shouldShowMakePayment() && (
            <div>
              <h3 className="text-lg font-medium">자동이체 등록</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {userRole === "requestor"
                  ? "제조사에게 결제하기 위한 자동이체를 등록합니다."
                  : "관리자(어벗츠.핏)에게 결제하기 위한 자동이체를 등록합니다."}
              </p>

              <div className="bg-muted/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">
                    토스페이먼츠 퀵자동이체 안내
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  토스페이먼츠 퀵자동이체를 통해 간편하게 자동 결제를 설정할 수
                  있습니다. 한 번 등록으로 매월 자동으로 결제가 이루어집니다.
                </p>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium">자동이체 등록 상태</p>
                </div>
                {paymentData.registrationStatus === "registered" ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    등록완료
                  </Badge>
                ) : paymentData.registrationStatus === "pending" ? (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                    처리중
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                    미등록
                  </Badge>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoTransferAgreement"
                    checked={paymentData.autoTransferAgreement}
                    onCheckedChange={toggleAutoTransferAgreement}
                  />
                  <label
                    htmlFor="autoTransferAgreement"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    자동이체 서비스 이용 약관에 동의합니다.
                  </label>
                </div>

                <Button
                  onClick={handleRegisterAutoTransfer}
                  disabled={
                    !paymentData.autoTransferAgreement ||
                    paymentData.registrationStatus === "registered"
                  }
                  className="w-full"
                >
                  {paymentData.registrationStatus === "registered"
                    ? "자동이체 등록완료"
                    : "자동이체 등록하기"}
                </Button>
              </div>
            </div>
          )}

          {shouldShowAutoTransfer() && <Separator />}

          {/* 자동 결제 - 의뢰자와 제조사만 표시 */}
          {shouldShowMakePayment() && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">자동 결제 설정</h3>
                  <p className="text-sm text-muted-foreground">
                    자동이체 등록 후 사용 가능합니다. 활성화 시 매월 자동으로
                    결제됩니다.
                  </p>
                </div>
                <Switch
                  checked={paymentData.autoPayment}
                  onCheckedChange={toggleAutoPayment}
                  disabled={paymentData.registrationStatus !== "registered"}
                />
              </div>

              {paymentData.registrationStatus !== "registered" && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>자동이체 등록 필요</AlertTitle>
                  <AlertDescription>
                    자동 결제를 사용하려면 먼저 자동이체를 등록해야 합니다.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
