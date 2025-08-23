import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MapPin, Phone, Mail, Clock, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const { toast } = useToast();

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 실제 구현에서는 여기서 폼 데이터를 서버로 전송
    console.log("Contact form submission:", formData);

    toast({
      title: "문의가 접수되었습니다",
      description: "빠른 시일 내에 답변드리겠습니다.",
    });

    // 폼 초기화
    setFormData({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-6xl mx-auto">
          {/* 헤더 */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">문의하기</h1>
            <p className="text-muted-foreground text-lg">
              궁금한 점이나 제안사항이 있으시면 언제든 연락주세요
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 연락처 정보 */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>연락처 정보</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start gap-4">
                    <MapPin className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <p className="text-muted-foreground">
                        경남 김해시 전하로 85번길 5
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Phone className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <p className="text-muted-foreground">055-314-4607</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Mail className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <p className="text-muted-foreground">contact@abuts.fit</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Clock className="h-6 w-6 text-primary mt-1" />
                    <div>
                      <h3 className="font-medium mb-1">운영시간</h3>
                      <p className="text-muted-foreground">
                        평일: 오전 9시 - 오후 6시
                        <br />
                        토요일: 오전 9시 - 오후 1시
                        <br />
                        일요일 및 공휴일 휴무
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 지도 (실제로는 구글 맵이나 카카오 맵 API 사용) */}
              <Card>
                <CardContent className="p-0">
                  <div className="h-64 bg-muted flex items-center justify-center">
                    <p className="text-muted-foreground">지도 영역</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 문의 폼 */}
            <Card>
              <CardHeader>
                <CardTitle>메시지 보내기</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">이름 *</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="이름을 입력하세요"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">연락처</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="연락처를 입력하세요"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">이메일 *</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="이메일을 입력하세요"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">제목 *</Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="문의 제목을 입력하세요"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">메시지 *</Label>
                    <Textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="자세한 문의 내용을 입력하세요"
                      rows={6}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    메시지 보내기
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};
