import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, BarChart3, Shield, Clock, Upload } from "lucide-react";

export const FeaturesSection = () => {
  const features = [
    {
      icon: Upload,
      title: "커스텀 어벗 의뢰",
      description: "필요한 정보와 파일을 첨부해 커스텀 어벗 제작을 의뢰합니다.",
      category: "의뢰",
    },
    {
      icon: Upload,
      title: "간편 파일 업로드",
      description:
        "STL 등 의뢰 파일을 업로드하고, 필요한 경우 수정/추가할 수 있습니다.",
      category: "파일",
    },
    {
      icon: BarChart3,
      title: "실시간 진행 현황",
      description: "의뢰 접수부터 제작/출고까지 진행 상태를 확인합니다.",
      category: "진행",
    },
    {
      icon: MessageSquare,
      title: "문의 남기기 (메일 회신)",
      description:
        "실시간 채팅이 아닌 문의 접수 방식이며, 이메일로 답변드립니다.",
      category: "문의",
    },
    {
      icon: Shield,
      title: "보안 및 품질 관리",
      description: "필요한 정보만 안전하게 처리하고, 제작 품질을 관리합니다.",
      category: "보안",
    },
    {
      icon: Clock,
      title: "배송 안내",
      description: "배송비는 별도이며, 묶음배송을 권장합니다.",
      category: "배송",
    },
  ];

  const categoryColors = {
    의뢰: "bg-primary/10 text-primary",
    파일: "bg-accent/10 text-accent",
    진행: "bg-primary/10 text-primary",
    문의: "bg-accent/10 text-accent",
    보안: "bg-primary/10 text-primary",
    배송: "bg-accent/10 text-accent",
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
            핵심 도구를 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg"
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
