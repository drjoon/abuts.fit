import { FileText, Download, ExternalLink } from "lucide-react";

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-6">
            <FileText className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            커스텀 어버트먼트 사용자 매뉴얼
          </h1>
          <p className="text-lg text-slate-600">
            제품의 안전한 사용을 위한 상세 가이드
          </p>
        </div>

        {/* Product Info Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">제품 정보</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-l-4 border-blue-600 pl-4">
              <div className="text-sm text-slate-500 mb-1">품명</div>
              <div className="font-semibold text-slate-900">임플란트 상부구조물</div>
            </div>
            <div className="border-l-4 border-blue-600 pl-4">
              <div className="text-sm text-slate-500 mb-1">모델명</div>
              <div className="font-semibold text-slate-900">CA6512</div>
            </div>
            <div className="border-l-4 border-blue-600 pl-4">
              <div className="text-sm text-slate-500 mb-1">제조업자</div>
              <div className="font-semibold text-slate-900">(주)애크로덴트</div>
            </div>
            <div className="border-l-4 border-blue-600 pl-4">
              <div className="text-sm text-slate-500 mb-1">품목허가</div>
              <div className="font-semibold text-slate-900">제3583호</div>
            </div>
          </div>
        </div>

        {/* Usage Instructions */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">사용 방법</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">제품 확인</h3>
                <p className="text-slate-600">
                  포장을 개봉하기 전 제품의 파손 여부를 확인하십시오. 파손된 제품은 사용하지 마십시오.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">세척 및 소독</h3>
                <p className="text-slate-600">
                  사용 전 제품을 적절한 방법으로 세척하고 소독하십시오. 멸균이 필요한 경우 제조사 권장 방법을 따르십시오.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">장착</h3>
                <p className="text-slate-600">
                  임플란트 픽스처에 맞는 규격의 제품을 선택하여 제조사 권장 토크값으로 체결하십시오.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">최종 확인</h3>
                <p className="text-slate-600">
                  장착 후 방사선 사진을 촬영하여 적합성을 확인하고, 환자에게 사용 및 관리 방법을 안내하십시오.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Precautions */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">주의사항</h2>
          <div className="space-y-4">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
              <h3 className="font-semibold text-amber-900 mb-2">⚠️ 경고</h3>
              <ul className="list-disc list-inside text-amber-800 space-y-1">
                <li>파손되거나 변형된 제품은 사용하지 마십시오.</li>
                <li>재사용 금지 - 1회용 제품입니다.</li>
                <li>유효기간이 지난 제품은 사용하지 마십시오.</li>
              </ul>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <h3 className="font-semibold text-blue-900 mb-2">ℹ️ 주의</h3>
              <ul className="list-disc list-inside text-blue-800 space-y-1">
                <li>제품 사용 전 환자의 구강 상태를 충분히 검사하십시오.</li>
                <li>적절한 크기와 규격의 제품을 선택하십시오.</li>
                <li>제조사 권장 토크값을 준수하십시오.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">보관 방법</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <div className="font-semibold text-slate-900">보관 온도</div>
                <div className="text-slate-600">실온 (15-25°C)</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <div className="font-semibold text-slate-900">보관 환경</div>
                <div className="text-slate-600">건조한 곳</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <div className="font-semibold text-slate-900">직사광선</div>
                <div className="text-slate-600">피할 것</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <div className="font-semibold text-slate-900">습기</div>
                <div className="text-slate-600">피할 것</div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-6">문의하기</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-3">제조업자</h3>
              <div className="space-y-2 text-blue-100">
                <div>(주)애크로덴트</div>
                <div>경남 김해시 전하로85번길 5</div>
                <div>T: 055-314-4607</div>
                <div>F: 055-901-0241</div>
              </div>
              <a
                href="https://acrodent.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-white hover:text-blue-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                웹사이트 방문
              </a>
            </div>
            <div>
              <h3 className="font-semibold mb-3">판매업자</h3>
              <div className="space-y-2 text-blue-100">
                <div>어벗츠 주식회사</div>
                <div>경남 거제시 거제중앙로29길 6, 3층</div>
                <div>T: 1588-3948</div>
              </div>
              <a
                href="https://abuts.fit"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-white hover:text-blue-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                웹사이트 방문
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-slate-500 text-sm">
          <p>본 매뉴얼은 의료기기 사용에 관한 일반적인 정보를 제공합니다.</p>
          <p className="mt-2">구체적인 사용 방법은 치과의사의 전문적인 판단에 따라야 합니다.</p>
        </div>
      </div>
    </div>
  );
}
