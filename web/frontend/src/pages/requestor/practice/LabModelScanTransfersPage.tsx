// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/labModelScanApi.ts
// - docs/intent/lab-oral-scan-opens-practice-transfer.md
import { RequestorPracticeReceivePage } from "@/pages/requestor/practice/RequestorPracticePage";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { REQUESTOR_KIND_LABEL } from "@/shared/business/requestorCapabilities";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

/** 기공소 「모델스캔으로 의뢰하기」— 수신함 UI 골격, 목록만 lab_model_scan */
export default function LabModelScanTransfersPage() {
  const navigate = useNavigate();
  const { loading, canReceiveTransfer } = useRequestorBusinessAccess();

  if (loading) {
    return null;
  }

  if (!canReceiveTransfer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg">역할 선택 필요</CardTitle>
            <CardDescription>
              모델스캔 의뢰는 {REQUESTOR_KIND_LABEL.lab} 역할이 필요합니다.
              <br />
              설정 &gt; 사업자에서 확인해 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/dashboard/settings?tab=business")}
            >
              사업자 설정으로 이동
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RequestorPracticeReceivePage
      showDesignQueue={false}
      showTransfers
      listMode="model_scan"
    />
  );
}
