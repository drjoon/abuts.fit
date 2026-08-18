// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
/**
 * 딜러(salesman) 전용 정산 페이지.
 * 개발운영사는 pages/devops/DevopsPaymentsPage.tsx.
 */
import { CommissionPaymentsPage } from "@/features/commission/CommissionPaymentsPage";

export default function SalesmanPaymentsPage() {
  return <CommissionPaymentsPage variant="salesman" />;
}
