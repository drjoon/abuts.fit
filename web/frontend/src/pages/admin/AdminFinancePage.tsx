// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/pages/admin/AdminPaymentsPage.tsx
// - web/frontend/src/pages/admin/system/AdminTaxInvoices.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/hooks/useAdminCommBadges.ts
// change-log:
// - 2026-09-23: 설정(구 설정·플랫폼)을 크레딧 오른쪽 탭으로 이동.
// - 2026-09-18: 크레딧·세금계산서 승인대기 탭 배지.
// - 2026-09-06: 크레딧·정산·세금계산서 허브(?tab=credits|payments|tax).
import { useSearchParams } from "react-router-dom";
import AdminCreditPage from "@/pages/admin/credits/AdminCreditPage";
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage";
import AdminTaxInvoices from "@/pages/admin/system/AdminTaxInvoices";
import { AdminPlatformSettingsPage } from "@/pages/admin/system/AdminPlatformSettingsPage";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import { useAdminAbutsFeePendingStore } from "@/store/useAdminAbutsFeePendingStore";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type FinanceTab = "credits" | "settings" | "payments" | "tax";

function parseTab(raw: string | null): FinanceTab {
  if (raw === "settings" || raw === "payments" || raw === "tax") return raw;
  // 구 북마크: 설정·플랫폼
  if (raw === "platform") return "settings";
  return "credits";
}

export default function AdminFinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const { counts } = useAdminCommBadges();
  const abutsFeePendingCount = useAdminAbutsFeePendingStore((s) => s.count);

  const setTab = (next: FinanceTab) => {
    const nextParams = setHubTabParam(searchParams, next, "credits");
    if (next !== "settings") {
      nextParams.delete("platformTab");
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AdminPageShell flush className="flex h-full min-h-0 flex-1 flex-col">
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "credits", label: "크레딧", badge: counts.finance },
          {
            value: "settings",
            label: "설정",
            badge: abutsFeePendingCount,
          },
          { value: "payments", label: "정산" },
          { value: "tax", label: "세금계산서", badge: counts.tax },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "credits" ? <AdminCreditPage embedded /> : null}
        {tab === "settings" ? (
          <div className="custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto">
            <AdminPlatformSettingsPage embedded />
          </div>
        ) : null}
        {tab === "payments" ? <AdminPaymentsPage embedded /> : null}
        {tab === "tax" ? <AdminTaxInvoices embedded /> : null}
      </div>
    </AdminPageShell>
  );
}
