// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingEventsSection.tsx
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/App.tsx
//
// `/events` 목록은 랜딩 `#events`로 옮김. 북마크·푸터·신청 페이지 뒤로가기는 여기로 들어온다.
import { Navigate } from "react-router-dom";

export default function EventsPage() {
  return <Navigate to="/#events" replace />;
}
