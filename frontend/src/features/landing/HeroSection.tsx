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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${heroBg})` }}
      />

      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 mb-8 animate-slide-up">
            <Zap className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">
              어벗츠 주식회사가 제공하는 플랫폼
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight animate-slide-up">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              커스텀 어벗먼트
            </span>
          </h1>

          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up">
            치과기공소와 어벗먼트 제조사를 스마트하게 연결합니다. <br></br>더
            빠르고 정확한 의뢰-제작 프로세스를 경험하세요
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up">
            <Button
              size="lg"
              variant="hero"
              className="text-lg px-8 py-3"
              onClick={handleStartFree}
            >
              무료로 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-3"
              onClick={handleInquiry}
            >
              문의 남기기
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full animate-float" />
      <div
        className="absolute bottom-20 right-10 w-16 h-16 bg-accent/10 rounded-full animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute top-1/2 left-1/4 w-12 h-12 bg-primary/5 rounded-full animate-float"
        style={{ animationDelay: "4s" }}
      />
    </section>
  );
};
