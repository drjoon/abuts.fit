// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { RequestorPracticeReceivePage } from "@/pages/requestor/practice/RequestorPracticePage";

/** 어벗츠기공소 — 기공의뢰수신(어벗 디자인 파트너 큐 포함) */
export default function LabWorkPage() {
  return (
    <RequestorPracticeReceivePage
      showDesignQueue={true}
      showTransfers={true}
      designQueueListMode="partner"
    />
  );
}
