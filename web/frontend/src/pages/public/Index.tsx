import { useState } from "react";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingPlatformIntro } from "@/features/landing/LandingPlatformIntro";
import { LandingAudienceSection } from "@/features/landing/LandingAudienceSection";
import { LandingPlatformSection } from "@/features/landing/LandingPlatformSection";
import { LandingStoreShowcase } from "@/features/landing/LandingStoreShowcase";

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingAudienceSection.tsx

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <PublicPageLayout contentClassName="relative z-10 w-full max-w-none px-0 py-0">
      {/* 1. 한눈에: 브랜드 + 한 줄 + CTA + 제품 비주얼 */}
      <LandingPlatformIntro />
      {/* 2. 왜 / 누구에게 */}
      <LandingAudienceSection />
      {/* 3. 어떻게 */}
      <LandingPlatformSection onContact={() => setShowGuestChat(true)} />
      {/* 4. 같은 생태계 (보조) */}
      <LandingStoreShowcase />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PublicPageLayout>
  );
};

export default Index;
