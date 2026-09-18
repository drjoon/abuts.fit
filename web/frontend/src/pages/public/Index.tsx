import { useState } from "react";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingAboutSection } from "@/features/landing/LandingAboutSection";
import { LandingPlatformIntro } from "@/features/landing/LandingPlatformIntro";
import { LandingPlatformSection } from "@/features/landing/LandingPlatformSection";
import { LandingStoreShowcase } from "@/features/landing/LandingStoreShowcase";

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingAboutSection.tsx

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <PublicPageLayout
      tone="light"
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      {/* 1. 어버츠 소개 스토리 */}
      <LandingAboutSection />
      {/* 2. 플랫폼: 의뢰 배너 · 퀵메뉴 · 이용 안내 */}
      <LandingPlatformIntro />
      {/* 3. 제품 둘러보기 */}
      <LandingStoreShowcase />
      {/* 4. 플로우 · Demo · 문의 */}
      <LandingPlatformSection onContact={() => setShowGuestChat(true)} />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PublicPageLayout>
  );
};

export default Index;
