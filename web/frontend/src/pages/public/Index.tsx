import { useState } from "react";
import { GuestChatModal } from "@/features/support/components/GuestChatModal";
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingPlatformIntro } from "@/features/landing/LandingPlatformIntro";
import { LandingStoreShowcase } from "@/features/landing/LandingStoreShowcase";
import { LandingPlatformSection } from "@/features/landing/LandingPlatformSection";

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/store/storeCatalog.ts

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <PublicPageLayout contentClassName="relative z-10 w-full max-w-none px-0 py-0">
      <LandingPlatformIntro />
      <LandingStoreShowcase />
      <LandingPlatformSection onContact={() => setShowGuestChat(true)} />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </PublicPageLayout>
  );
};

export default Index;
