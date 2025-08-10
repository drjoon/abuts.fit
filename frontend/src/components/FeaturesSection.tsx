import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  FileImage,
  BarChart3,
  Shield,
  Clock,
  Users,
  Upload,
  CheckCircle,
  Settings,
} from "lucide-react";

export const FeaturesSection = () => {
  const features = [
    {
      icon: MessageSquare,
      title: "실시간 3자 채팅",
      description:
        "의뢰자, 제조사, 어벗츠.핏이 함께 소통할 수 있는 통합 채팅 시스템",
      category: "소통",
    },
    {
      icon: Upload,
      title: "드래그앤드롭 파일 업로드",
      description: "대용량 3D 모델링 파일을 간편하게 업로드하고 관리",
      category: "파일 관리",
    },
    {
      icon: BarChart3,
      title: "실시간 진행 현황",
      description: "의뢰부터 완성까지 모든 단계를 실시간으로 추적",
      category: "추적",
    },
    {
      icon: Users,
      title: "스마트 매칭",
      description: "AI 기반으로 최적의 제조사를 자동으로 추천",
      category: "매칭",
    },
    {
      icon: Shield,
      title: "보안 및 품질 관리",
      description: "의료기기 인증 제조사만 등록, 안전한 데이터 보호",
      category: "보안",
    },
    {
      icon: Clock,
      title: "24/7 고객 지원",
      description: "언제든지 문의할 수 있는 전담 고객 지원팀",
      category: "지원",
    },
  ];

  const categoryColors = {
    소통: "bg-primary/10 text-primary",
    "파일 관리": "bg-accent/10 text-accent",
    추적: "bg-primary/10 text-primary",
    매칭: "bg-accent/10 text-accent",
    보안: "bg-primary/10 text-primary",
    지원: "bg-accent/10 text-accent",
  };

  return (
    <section id="features" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge className="mb-4" variant="secondary">
            핵심 기능
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            치과기공소와 제조사를 위한
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              {" "}
              완벽한 솔루션
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            복잡한 의뢰 과정을 단순화하고, 품질 높은 커스텀 어벗먼트 제작을 위한
            모든 도구를 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-2 border-border/50"
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <Badge
                    className={
                      categoryColors[
                        feature.category as keyof typeof categoryColors
                      ]
                    }
                  >
                    {feature.category}
                  </Badge>
                </div>
                <CardTitle className="text-xl group-hover:text-primary transition-colors">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
