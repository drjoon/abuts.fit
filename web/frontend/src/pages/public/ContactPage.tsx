import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { MapPin, Phone, Mail, Clock, Send } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import {
  COMPANY_ADDRESS,
  COMPANY_PHONE,
  CONTACT_EMAIL,
} from "@/shared/lib/contactInfo";

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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
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
    <PublicPageLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            contact
          </p>
          <h1 className="text-4xl font-semibold text-white">문의하기</h1>
          <p className="text-white/70">
            궁금한 점이나 제안 사항이 있다면 언제든 메시지를 남겨주세요.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <Card className={PUBLIC_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="text-slate-900">연락처 정보</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-slate-600">
                <div className="flex items-start gap-4">
                  <MapPin className="h-6 w-6 text-primary mt-1" />
                  <p>{COMPANY_ADDRESS}</p>
                </div>

                <div className="flex items-start gap-4">
                  <Phone className="h-6 w-6 text-primary mt-1" />
                  <p>{COMPANY_PHONE}</p>
                </div>

                <div className="flex items-start gap-4">
                  <Mail className="h-6 w-6 text-primary mt-1" />
                  <p>{CONTACT_EMAIL}</p>
                </div>

                <div className="flex items-start gap-4">
                  <Clock className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-medium text-slate-900 mb-1">
                      운영시간
                    </h3>
                    <p>
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

            <Card className={PUBLIC_CARD_CLASS}>
              <CardContent className="p-0">
                <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-900/10 text-slate-500">
                  지도 영역
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="text-slate-900">메시지 보내기</CardTitle>
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
    </PublicPageLayout>
  );
};
