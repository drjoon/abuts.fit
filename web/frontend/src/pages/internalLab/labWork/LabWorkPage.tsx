// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-15: 수락 기공소와 동일 — acceptingLab 큐·문구(업로드 시 제조 주문).
import { RequestorPracticeReceivePage } from "@/pages/requestor/practice/RequestorPracticePage";

/** 어벗츠기공소 — 기공의뢰수신(수락 lab과 동일 큐·카피) */
export default function LabWorkPage() {
  return (
    <RequestorPracticeReceivePage
      showDesignQueue={true}
      showTransfers={true}
      designQueueListMode="acceptingLab"
    />
  );
}
