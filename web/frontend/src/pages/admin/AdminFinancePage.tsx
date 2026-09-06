// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/pages/admin/AdminPaymentsPage.tsx
// - web/frontend/src/pages/admin/system/AdminTaxInvoices.tsx
// change-log:
// - 2026-09-06: 크레딧·정산·세금계산서 허브(?tab=credits|payments|tax).
import { useSearchParams } from "react-router-dom";
import AdminCreditPage from "@/pages/admin/credits/AdminCreditPage";
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage";
import AdminTaxInvoices from "@/pages/admin/system/AdminTaxInvoices";
import {
  AdminPageShell,
  AdminSegmentTabs,
  setHubTabParam,
} from "@/pages/admin/adminUi";

type FinanceTab = "credits" | "payments" | "tax";

function parseTab(raw: string | null): FinanceTab {
  if (raw === "payments" || raw === "tax") return raw;
  return "credits";
}

export default function AdminFinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: FinanceTab) => {
    setSearchParams(setHubTabParam(searchParams, next, "credits"), {
      replace: true,
    });
  };

  return (
    <AdminPageShell
      title="재무"
      subtitle="크레딧 · 정산 · 세금계산서"
      flush
      className="flex h-full min-h-0 flex-1 flex-col"
    >
      <AdminSegmentTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "credits", label: "크레딧" },
          { value: "payments", label: "정산" },
          { value: "tax", label: "세금계산서" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "credits" ? <AdminCreditPage embedded /> : null}
        {tab === "payments" ? <AdminPaymentsPage embedded /> : null}
        {tab === "tax" ? <AdminTaxInvoices embedded /> : null}
      </div>
    </AdminPageShell>
  );
}
