// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { useState } from "react";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingPlatformIntro } from "@/features/landing/LandingPlatformIntro";
import { LandingStoreShowcase } from "@/features/landing/LandingStoreShowcase";
import { LandingAboutSection } from "@/features/landing/LandingAboutSection";
import { LandingMobileTabBar } from "@/features/landing/LandingMobileTabBar";

/** `/platform` — 서비스 홈(첨2): 의뢰·제품·퀵메뉴 (게스트/회원 공용) */
export const PlatformPage = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <PublicPageLayout
      tone="light"
      contentClassName="relative z-10 w-full max-w-none px-0 py-0 pb-16 md:pb-0"
    >
      <LandingPlatformIntro />
      <LandingStoreShowcase />
      <LandingAboutSection />
      <LandingMobileTabBar onContact={() => setShowGuestChat(true)} />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PublicPageLayout>
  );
};
