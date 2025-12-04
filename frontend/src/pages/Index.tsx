import { useState } from "react";
import { Navigation } from "../components/Navigation";
import { HeroSection } from "../components/HeroSection";
import { FeaturesSection } from "../components/FeaturesSection";
import { PricingSection } from "../components/PricingSection";
import { AnnouncementSection } from "../components/AnnouncementSection";
import { CustomerSupportSection } from "../components/CustomerSupportSection";
import { Footer } from "../components/Footer";
import { GuestChatModal } from "../components/GuestChatModal";

const Index = () => {
  const [showGuestChat, setShowGuestChat] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <AnnouncementSection />
      <FeaturesSection />

      <PricingSection />
      <CustomerSupportSection onOpenGuestChat={() => setShowGuestChat(true)} />

      <Footer />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </div>
  );
};

export default Index;
