import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, MapPin, Phone, Mail, FileText } from "lucide-react";

export const BusinessPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">사업자 정보</h1>
            <p className="text-muted-foreground">
              어벗츠.핏 운영 회사의 사업자 정보
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Building className="h-6 w-6 text-primary" />
                  회사 정보
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">상호명</h4>
                      <p className="text-muted-foreground">메이븐 주식회사 (Maven Inc.)</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">대표자</h4>
                      <p className="text-muted-foreground">김메이븐</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">사업자등록번호</h4>
                      <p className="text-muted-foreground">123-45-67890</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">통신판매업신고번호</h4>
                      <p className="text-muted-foreground">제2025-서울강남-1234호</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <MapPin className="h-6 w-6 text-primary" />
                  주소 정보
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">본사 주소</h4>
                    <p className="text-muted-foreground">
                      서울특별시 강남구 테헤란로 123<br />
                      메이븐빌딩 10층 (우편번호: 06234)
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">사업장 주소</h4>
                    <p className="text-muted-foreground">
                      서울특별시 강남구 테헤란로 123<br />
                      메이븐빌딩 10층 (우편번호: 06234)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Phone className="h-6 w-6 text-primary" />
                  연락처 정보
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-2">대표 전화</h4>
                      <p className="text-muted-foreground">02-1234-5678</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">팩스</h4>
                      <p className="text-muted-foreground">02-1234-5679</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">고객지원</h4>
                      <p className="text-muted-foreground">support@abuts.fit</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">사업 문의</h4>
                      <p className="text-muted-foreground">business@abuts.fit</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  사업 내용
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">주요 사업</h4>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>온라인 플랫폼 서비스 제공업</li>
                      <li>치과기공소와 제조사 중개 서비스</li>
                      <li>커스텀 어벗먼트 관련 서비스</li>
                      <li>소프트웨어 개발 및 유지보수</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-foreground mb-2">사업자 정보 공시</h4>
                    <p>본 사업자 정보는 관련 법령에 따라 공시되며, 정보통신망 이용촉진 및 정보보호 등에 관한 법률에 따라 통신판매업신고를 완료하였습니다.</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-foreground mb-2">소비자 분쟁해결</h4>
                    <p>소비자분쟁해결기준(공정거래위원회 고시)에 따라 피해를 보상받을 수 있습니다. 분쟁 조정 신청은 소비자분쟁조정위원회(www.ccn.go.kr) 또는 개인정보보호위원회(www.privacy.go.kr)에 신청할 수 있습니다.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};