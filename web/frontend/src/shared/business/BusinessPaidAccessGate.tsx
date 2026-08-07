// related files:
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/frontend/src/features/dashboard/DashboardHome.tsx
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

type Props = {
  children: React.ReactNode;
  /** 로딩 중 표시할 대체 UI (없으면 null) */
  loadingFallback?: React.ReactNode;
};

/**
 * 유료 서비스 진입 게이트 — 사업자등록증 검증(businessVerified) 필수.
 * 특정 상품이 아니라 유료/무료 접근성 기준으로 차단한다.
 */
export const BusinessPaidAccessGate = ({
  children,
  loadingFallback = null,
}: Props) => {
  const navigate = useNavigate();
  const { loading, canUsePaid } = useRequestorBusinessAccess();

  if (loading) return <>{loadingFallback}</>;
  if (canUsePaid) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Building2 className="h-6 w-6 text-slate-600" />
          </div>
          <CardTitle className="text-lg">사업자등록증 등록 필요</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-slate-600">
            이 화면은 유료 서비스입니다. 사업자등록증을 등록·검증한 뒤
            이용할 수 있습니다. 무료 서비스는 계속 이용할 수 있습니다.
          </p>
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
};
