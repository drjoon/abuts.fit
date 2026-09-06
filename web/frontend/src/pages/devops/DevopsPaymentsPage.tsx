// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/commission/CommissionPaymentsPage.tsx
/**
 * 개발운영사(devops) 전용 정산 페이지.
 * 부가세 포함가 장부 · 지급=잔액 그대로 · 세금계산서(÷1.1).
 */
import { CommissionPaymentsPage } from "@/features/commission/CommissionPaymentsPage";

export default function DevopsPaymentsPage() {
  return <CommissionPaymentsPage variant="devops" />;
}
