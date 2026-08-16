// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// change-log:
// - 2026-08-16: acceptingLab 디자인큐 안내 문구 제거 — 수신 카드만.
// - 2026-08-16: 미설정 시 진입 강제 모달·사업체 디자인SW/아노 저장(internalLab).
// - 2026-08-15: 수락 기공소와 동일 — acceptingLab 큐·문구 + 공통 수신 카드.
import { RequestorPracticeReceivePage } from "@/pages/requestor/practice/RequestorPracticePage";

/** 어벗츠기공소 — 기공의뢰수신(일반 lab과 동일 카드·카피) */
export default function LabWorkPage() {
  return (
    <RequestorPracticeReceivePage
      showDesignQueue={false}
      showTransfers={true}
    />
  );
}
