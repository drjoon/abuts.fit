// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Zap, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

export const HeroSection = () => {
  const navigate = useNavigate();

  const handleStartFree = () => {
    navigate("/login");
  };

  const handleInquiry = () => {
    document.getElementById("support")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden sm:min-h-screen">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${heroBg})` }}
      />

      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center px-3 py-2 sm:px-4 rounded-full bg-primary/10 text-primary border border-primary/20 mb-6 sm:mb-8 animate-slide-up">
            <Zap className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">
              어벗츠 주식회사가 제공하는 플랫폼
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-4 sm:mb-6 leading-tight animate-slide-up">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              커스텀 어벗먼트
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto animate-slide-up">
            치과기공소와 어벗먼트 제조사를 스마트하게 연결합니다. <br></br>더
            빠르고 정확한 의뢰-제작 프로세스를 경험하세요
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-8 sm:mb-12 animate-slide-up">
            <Button
              size="lg"
              variant="hero"
              className="h-11 w-full text-base px-6 sm:h-auto sm:w-auto sm:text-lg sm:px-8 sm:py-3"
              onClick={handleStartFree}
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full text-base px-6 sm:h-auto sm:w-auto sm:text-lg sm:px-8 sm:py-3"
              onClick={handleInquiry}
            >
              문의 남기기
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute top-20 left-10 hidden h-20 w-20 rounded-full bg-primary/10 animate-float sm:block" />
      <div
        className="absolute bottom-20 right-10 hidden h-16 w-16 rounded-full bg-accent/10 animate-float sm:block"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute top-1/2 left-1/4 hidden h-12 w-12 rounded-full bg-primary/5 animate-float sm:block"
        style={{ animationDelay: "4s" }}
      />
    </section>
  );
};
