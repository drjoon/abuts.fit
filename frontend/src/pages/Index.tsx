import { useState } from "react";
import { Navigation } from "@/features/layout/Navigation";
import { HeroSection } from "@/features/landing/HeroSection";
import { FeaturesSection } from "@/features/landing/FeaturesSection";
import { AnnouncementSection } from "@/features/landing/AnnouncementSection";
import { CustomerSupportSection } from "@/features/landing/CustomerSupportSection";
import { Footer } from "@/features/landing/Footer";
import { GuestChatModal } from "@/components/GuestChatModal";

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <AnnouncementSection />
      <FeaturesSection />
      <CustomerSupportSection onOpenGuestChat={() => setShowGuestChat(true)} />

      <Footer />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </div>
  );
};

export default Index;
