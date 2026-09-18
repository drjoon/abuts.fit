import { useState } from "react";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingPlatformIntro } from "@/features/landing/LandingPlatformIntro";
import { LandingStoreShowcase } from "@/features/landing/LandingStoreShowcase";
import { LandingAboutSection } from "@/features/landing/LandingAboutSection";
import { LandingMobileTabBar } from "@/features/landing/LandingMobileTabBar";

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <PublicPageLayout
      tone="light"
      contentClassName="relative z-10 w-full max-w-none px-0 py-0 pb-16 md:pb-0"
    >
      {/* 1. 기획 홈: 검색 · 의뢰 히어로 · 퀵메뉴 */}
      <LandingPlatformIntro />
      {/* 2. 제품 둘러보기 */}
      <LandingStoreShowcase />
      {/* 3. 짧은 About + 캘린더/채팅 프리뷰 */}
      <LandingAboutSection />
      <LandingMobileTabBar onContact={() => setShowGuestChat(true)} />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PublicPageLayout>
  );
};

export default Index;
