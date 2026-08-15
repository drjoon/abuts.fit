// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { RequestorPracticeReceivePage } from "@/pages/requestor/practice/RequestorPracticePage";

/** 어벗츠기공소 — 기공의뢰 수신·작업 (디자인 큐는 어벗디자인 메뉴로 분리) */
export default function LabWorkPage() {
  return (
    <RequestorPracticeReceivePage
      showDesignQueue={false}
      showTransfers={true}
    />
  );
}
