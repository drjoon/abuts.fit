// related files:
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/features/settings/tabs/CreditPaymentTab.tsx
// B2B 전용: 사업자 검증 전에는 가격·결제 화면 대신 이 안내를 보여준다.
import { Link } from "react-router-dom";
import { BadgeCheck, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const BUSINESS_SETTINGS_PATH = "/dashboard/settings?tab=business";

export function BusinessVerificationRequiredNotice({
  pending = false,
}: {
  pending?: boolean;
}) {
  return (
    <div className="app-surface app-surface--panel mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-10 text-center">
      {pending ? (
        <Hourglass className="h-8 w-8 text-muted-foreground" />
      ) : (
        <BadgeCheck className="h-8 w-8 text-muted-foreground" />
      )}
      <h2 className="text-base font-semibold">
        {pending ? "사업자 확인이 진행 중입니다" : "사업자 인증 후 이용할 수 있습니다"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {pending ? (
          <>
            홈택스 장애로 확인이 지연되고 있습니다.
            <br />
            복구되면 자동으로 처리되며, 별도 조치는 필요 없습니다.
          </>
        ) : (
          <>
            검증된 사업자만 이용할 수 있습니다.
            <br />
            설정 &gt; 사업자에서 사업자등록증을 등록해주세요.
          </>
        )}
      </p>
      {!pending ? (
        <Button size="sm" asChild>
          <Link to={BUSINESS_SETTINGS_PATH}>사업자 등록하기</Link>
        </Button>
      ) : null}
    </div>
  );
}
