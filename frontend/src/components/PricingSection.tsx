import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useState } from "react";
import { PartnershipBenefitsModal } from "./PartnerShipBenefitsModal";

export const PricingSection = () => {
  const [showPartnershipBenefits, setShowPartnershipBenefits] = useState(false);

  return (
    <>
      <section id="pricing" className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-12 text-center">
            요금제
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-stretch">
            {/* 치과기공소 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[480px] flex flex-col border-2 border-green-200">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-green-600 text-center">
                    치과기공소
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-green-100 text-green-700 font-bold text-sm px-3 py-1">
                  플랫폼 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <p className="text-base lg:text-lg font-semibold">
                      구매 가격 대비 수수료
                    </p>
                    <div className="mt-2 text-3xl lg:text-4xl font-bold mb-1 text-green-600">
                      무료 혹은 5%
                    </div>
                    <p className="mt-2 text-sm lg:text-sm font-semibold">
                      제조사 미지정시 무료, 지정시 5%
                    </p>
                  </div>
                  <ul className="space-y-2 text-base lg:text-lg text-center">
                    <li>• 의뢰 등록 및 관리</li>
                    <li>• 실시간 채팅 상담</li>
                    <li>• 품질 보증 서비스</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* 플랫폼 모델 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[480px] flex flex-col border-2 border-primary/30">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-primary text-center">
                    어벗먼트 제조사
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-blue-100 text-blue-700 font-bold text-sm px-3 py-1">
                  플랫폼 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <p className="text-base lg:text-lg font-semibold">
                      판매 가격 대비 수수료
                    </p>
                    <div className="mt-2 text-3xl lg:text-4xl font-bold text-blue-600 mb-1">
                      5% ~ 15%
                    </div>
                    <p className="mt-2 text-blue-800 text-center text-sm lg:text-sm font-semibold">
                      🎓 CAM, 기술 지원 등 필요시 추가 비용
                    </p>
                  </div>
                  <div>
                    <ul className="space-y-1 text-base lg:text-lg text-center">
                      <li>• 의뢰 접수 및 관리</li>
                      <li>• 제조사가 수수료율 설정</li>
                      <li>• 수수료율에 따른 물량 배정</li>
                      <li>• 투명한 배정 및 정산 시스템</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 파트너십 모델 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[480px] flex flex-col border-2 border-primary/30">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-primary text-center">
                    어벗먼트 제조사
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-blue-100 text-blue-700 font-bold text-sm px-3 py-1">
                  파트너십 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-4">
                  <div className="text-center">
                    <p className="text-base lg:text-lg font-semibold">
                      판매 가격 대비 수익 공유
                    </p>
                    <div className="mt-2 text-3xl lg:text-4xl font-bold text-blue-600 mb-1">
                      50%
                    </div>
                  </div>
                  <button
                    className="mt-2 w-full flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold py-2 px-4 rounded-md transition-colors duration-200"
                    onClick={() => setShowPartnershipBenefits(true)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 010 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z"
                        clipRule="evenodd"
                      />
                      <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6v7z" />
                    </svg>
                    특별한 혜택 보기
                  </button>
                  <div>
                    <p className="mt-2 text-blue-800 text-center text-base lg:text-lg font-semibold">
                      🚀 플랫폼 모델 + 초기 투자 지원
                    </p>
                    <ul className="mt-2 space-y-1 text-base lg:text-lg text-center">
                      <li>• 자동선반 복합기 제공</li>
                      <li>• CAM 라이센스 제공</li>
                      <li>• 기술 교육 및 지원</li>
                      <li>• 안정적인 의뢰 물량 배정</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
      <PartnershipBenefitsModal
        open={showPartnershipBenefits}
        onOpenChange={setShowPartnershipBenefits}
      />
    </>
  );
};
