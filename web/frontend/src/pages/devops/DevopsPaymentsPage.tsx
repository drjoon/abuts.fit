// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
/**
 * 개발운영사(devops) 전용 정산 페이지.
 * 지급 시 부가세 10% · 세금계산서(어벗츠↔개발운영사 과세).
 */
import { CommissionPaymentsPage } from "@/features/commission/CommissionPaymentsPage";

export default function DevopsPaymentsPage() {
  return <CommissionPaymentsPage variant="devops" />;
}
