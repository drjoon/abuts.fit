import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Users, Zap, Shield, Search, MessageSquare, FileText } from "lucide-react";

interface ServiceTourModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const tourSteps = [
  {
    title: "플랫폼 소개",
    description: "어벗츠.핏은 치과기공소와 어벗먼트 제작사를 연결하는 디지털 플랫폼입니다.",
    features: [
      { icon: Users, title: "스마트 매칭", desc: "AI 기반으로 최적의 제작사를 찾아드립니다" },
      { icon: Zap, title: "빠른 처리", desc: "평균 24시간 내 제작 완료" },
      { icon: Shield, title: "품질 보장", desc: "99.8% 품질 만족도와 A/S 보장" }
    ]
  },
  {
    title: "의뢰 프로세스",
    description: "간단한 3단계로 어벗먼트 제작을 의뢰할 수 있습니다.",
    features: [
      { icon: Search, title: "1단계: 제작사 검색", desc: "조건에 맞는 제작사를 찾아보세요" },
      { icon: FileText, title: "2단계: 의뢰서 작성", desc: "상세한 요구사항을 입력하세요" },
      { icon: MessageSquare, title: "3단계: 실시간 소통", desc: "제작사와 직접 소통하며 진행상황을 확인하세요" }
    ]
  },
  {
    title: "요금 및 혜택",
    description: "투명하고 합리적인 요금 체계로 서비스를 이용하세요.",
    features: [
      { icon: Users, title: "치과기공소", desc: "모든 기능 100% 무료 이용" },
      { icon: Zap, title: "제작사", desc: "현재 모든 수수료 면제 중" },
      { icon: Shield, title: "품질 보증", desc: "불만족시 100% 환불 보장" }
    ]
  }
];

export const ServiceTourModal = ({ open, onOpenChange }: ServiceTourModalProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentTour = tourSteps[currentStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">
            서비스 둘러보기
            <Badge variant="outline" className="ml-2">
              {currentStep + 1} / {tourSteps.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{currentTour.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">{currentTour.description}</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {currentTour.features.map((feature, index) => (
                  <div key={index} className="text-center p-4 bg-muted/50 rounded-lg">
                    <feature.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
                    <h3 className="font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              이전
            </Button>
            
            <div className="flex space-x-2">
              {tourSteps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            
            {currentStep < tourSteps.length - 1 ? (
              <Button onClick={nextStep}>
                다음
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={() => onOpenChange(false)}>
                둘러보기 완료
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};