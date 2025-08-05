import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Zap, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import { ServiceTourModal } from "./ServiceTourModal";

export const HeroSection = () => {
  const [showServiceTour, setShowServiceTour] = useState(false);
  const navigate = useNavigate();

  const handleStartFree = () => {
    navigate('/login');
  };

  const handleServiceTour = () => {
    setShowServiceTour(true);
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />
      
      {/* Content */}
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 mb-8 animate-slide-up">
            <Zap className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">치과기공소와 제조사를 연결하는 혁신적인 플랫폼</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight animate-slide-up">
            <span className="text-foreground">커스텀 어벗먼트</span>
            <br />
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              의뢰부터 제작까지
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up">
            치과기공소와 어벗먼트 제조사를 스마트하게 연결하여 
            더 빠르고 정확한 의뢰-제작 프로세스를 경험하세요.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up">
            <Button size="lg" variant="hero" className="text-lg px-8 py-3" onClick={handleStartFree}>
              무료로 시작하기
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-3" onClick={handleServiceTour}>
              서비스 둘러보기
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-slide-up">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mx-auto mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground mb-2">500+</div>
              <div className="text-muted-foreground">등록된 치과기공소</div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-accent/10 rounded-lg mx-auto mb-4">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div className="text-2xl font-bold text-foreground mb-2">24시간</div>
              <div className="text-muted-foreground">평균 제작 시간</div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mx-auto mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground mb-2">99.8%</div>
              <div className="text-muted-foreground">품질 만족도</div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-primary/10 rounded-full animate-float" />
      <div className="absolute bottom-20 right-10 w-16 h-16 bg-accent/10 rounded-full animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/4 w-12 h-12 bg-primary/5 rounded-full animate-float" style={{ animationDelay: '4s' }} />
      
      <ServiceTourModal open={showServiceTour} onOpenChange={setShowServiceTour} />
    </section>
  );
};