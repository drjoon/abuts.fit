// change-log:
// - 2026-08-19: 제7조② 치과 멤버십 폐지. 크레딧 사용처를 기공물·어벗 주문 대금만으로 한정.
// - 2026-08-15: 제7조 유료 크레딧 사용처에 치과 멤버십 월 구독(면세) 포함.
// - 2026-08-15: 제13조⑥ 기공크레딧 주문 상계·월 정산 공제, 충전/적립 경로 구분.
// - 2026-08-12: 제7조 크레딧=기공료 선입금(선납 대금). 선불페이 아님·미사용 잔액 환불·수정계산서.
// - 2026-08-12: 제13조 부가세법 제26조 면세·법정 계산서(면세용), 세금계산서 오발행 지급 보류.
// - 2026-08-12: 제3편 기공회원 공급·구상·정산, 제1·2조 역할 정의, 제8조 유통 책임과 정합.
// - 2026-08-12: 제8조 기공물 품질 책임·리메이크, 제2조 기공물/제작사 정의, 제5조 교차참조.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";

export const TermsPage = () => {
  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            policy
          </p>
          <h1 className="text-4xl font-semibold text-white">이용약관</h1>
          <p className="text-white/70">최종 개정일: 2026년 8월 12일</p>
        </div>

        <div className="space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">
              part i
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">통칙</h2>
          </div>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제1조 (목적)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 이 약관은 어벗츠 주식회사(이하 "회사")가 제공하는 온라인
                  플랫폼 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자
                  간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                </p>
                <p>
                  2. 회사는 치과회원에게 기공물을 공급(매출)하고, 기공회원으로부터
                  기공물을 매입하거나 위탁 가공받는(매입) B2B 유통 사업자로
                  서비스를 운영합니다.
                </p>
                <p>
                  3. 제1편(통칙)은 모든 회원에게, 제2편은 치과회원에게, 제3편은
                  기공회원에게 적용합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제2조 (정의)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>이 약관에서 사용하는 용어의 정의는 다음과 같습니다.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    "서비스"란 회사가 제공하는 커스텀 어벗먼트 의뢰 및 진행 관리
                    플랫폼을 의미합니다.
                  </li>
                  <li>
                    "이용자"란 이 약관에 따라 회사가 제공하는 서비스를 받는 자를
                    의미합니다.
                  </li>
                  <li>
                    "회원"이란 회사에 개인정보를 제공하여 회원등록을 한 자로서,
                    회사의 정보를 지속적으로 제공받으며 회사가 제공하는 서비스를
                    계속적으로 이용할 수 있는 자를 의미합니다.
                  </li>
                  <li>
                    "치과회원"이란 의뢰 발신자(치과)로서 서비스를 이용하는 회원을
                    의미합니다.
                  </li>
                  <li>
                    "기공회원"이란 기공물을 회사에 공급하는 치과기공소 또는
                    제조사(현재 애크로덴트를 포함합니다)를 의미합니다.
                    기공회원은 회사에 대한 공급사(하청 제조사)입니다.
                  </li>
                  <li>
                    "기공물"이란 서비스를 통해 공급되는 커스텀 어벗먼트 등 치과
                    보철·기공 제품을 의미합니다.
                  </li>
                  <li>
                    "제작사"란 해당 기공물을 실제 제작한 기공회원을 의미합니다.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제3조 (약관의 효력 및 변경)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게
                  공지함으로써 효력을 발생합니다.
                </p>
                <p>
                  2. 회사는 필요하다고 인정되는 경우 이 약관을 변경할 수 있으며,
                  변경된 약관은 공지 또는 통지하여 효력을 발생합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제4조 (회원가입)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 이용자는 회사가 정한 가입 양식에 따라 회원정보를 기입한 후
                  이 약관에 동의한다는 의사표시를 함으로써 회원가입을
                  신청합니다.
                </p>
                <p>
                  2. 회사는 신청자가 다음 각 호에 해당하지 않는 한 회원으로
                  등록합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제5조 (서비스의 제공)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>회사가 제공하는 서비스는 다음과 같습니다.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>커스텀 어벗먼트 의뢰 등록 및 파일 업로드 서비스</li>
                  <li>의뢰 관리 및 진행상황 확인 서비스</li>
                  <li>문의 접수(문의 남기기) 및 이메일 회신 서비스</li>
                  <li>
                    품질 보증 및 분쟁 조정 서비스 (세부 사항은 제8조 및 제9조
                    이하에 따릅니다)
                  </li>
                  <li>
                    기타 회사가 추가 개발하거나 제휴계약 등을 통해 제공하는
                    일체의 서비스
                  </li>
                </ul>
                <p className="text-sm text-slate-500">
                  * 현재는 커스텀 어벗먼트 의뢰만 제공하며, 크라운은 제공하지
                  않습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제6조 (서비스 이용료)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 제작비(상품 금액)는 서비스 화면에 안내된 기준에 따릅니다.
                </p>
                <p>
                  2. 제작비는 배송비가 포함되지 않은 금액이며, 배송비는 별도
                  청구됩니다. 회사는 면세 사업자로 부가가치세(VAT)를 부과하지
                  않습니다.
                </p>
                <p>
                  3. 기공물의 제작은 회사가 지정한 기공회원이 담당합니다. 커스텀
                  어벗먼트의 가공은 현재 애크로덴트가 수행합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제7조 (크레딧·기공료 선입금 및 환불)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 회사는 기공물(보철물) 구매·발주 대금 결제를 위해
                  크레딧을 제공합니다. 크레딧은 선불전자지급수단(선불페이)이
                  아니라, 치과 보철물 유통 계약에 따른 기공료 선입금(선납
                  대금)이며 서비스 화면에서는 크레딧으로 표시합니다.
                </p>
                <p>
                  2. 크레딧은 앱 내 기공물 제작 및 커스텀 어벗먼트 구매 대금에
                  한하여 사용되며, 회원 간 양도, 환전 또는 현금 출금은
                  불가합니다. 미사용 잔액의 환불은 제4항에 따릅니다.
                </p>
                <p>3. 크레딧에는 별도의 사용기한을 두지 않습니다.</p>
                <p>
                  4. 거래 계약이 중도 해지되거나 미사용된 기공료 선입금 잔액은
                  회원의 요청 또는 계정 해지 시 전액 환불합니다. 이 경우
                  기발행된 면세 계산서는 마이너스(-) 수정 계산서로 처리합니다.
                </p>
                <p>
                  5. 환불 금액은 잔여 유료 크레딧(공급가) 기준으로 산정되며,
                  무료/이벤트로 지급된 크레딧은 제외됩니다.
                </p>
                <p>
                  6. 결제수단 특성에 따라 환불 계좌 정보가 필요할 수 있으며,
                  회사 확인 후 환불 계좌로 입금하는 방식으로 처리될 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="pt-4">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">
              part ii
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              치과회원에 대한 기공물 공급
            </h2>
          </div>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제8조 (기공물의 품질 책임 및 리메이크)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 회사는 서비스를 통해 치과회원에게 기공물을 공급하는 유통
                  사업자로서, 본 조에서 정한 범위 내에서 기공물의 품질에 관한
                  책임을 집니다. 기공물의 실제 제작은 기공회원이 수행하며, 회사는
                  제3편에 따라 기공회원에게 구상할 수 있습니다.
                </p>
                <p>
                  2. 치과회원이 수령한 기공물에 하자 또는 적합(Fit) 불량이 있어
                  재제작(이하 "리메이크")을 요청하는 경우, 치과회원은 기공물
                  수령일부터 14일 이내에 서비스를 통해 신청하여야 합니다. 신청
                  시 구강 스캔 또는 인상 데이터의 적정성, 지대치 형성(Prep)
                  상태, 시적 사진 등 원인 판별에 필요한 자료를 제출하여야
                  합니다.
                </p>
                <p>
                  3. 다음 각 호의 어느 하나에 해당하는 경우, 회사는 무상
                  리메이크 책임을 지지 않으며, 치과회원은 신규 의뢰와 동일한
                  이용료를 부담합니다.
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    치과회원이 최초 제공한 구강 스캔 데이터 또는 인상 채득이
                    불완전하거나 부정확하여 하자가 발생한 경우
                  </li>
                  <li>
                    기공물 제작 진행 중 치과회원이 설계 또는 사양 변경을 요청한
                    경우
                  </li>
                  <li>
                    수령 후 치과회원의 취급 부주의 또는 임상 시술 과정에서의
                    과실로 기공물이 변형·파손된 경우
                  </li>
                  <li>
                    제2항의 신청 기한을 경과하였거나, 원인 판별에 필요한 자료를
                    제출하지 않은 경우
                  </li>
                </ul>
                <p>
                  4. 무상 리메이크 요건에 해당하는 것으로 확인된 경우, 회사는
                  기공회원으로 하여금 해당 건을 우선 재제작하여 배송하도록
                  조치합니다.
                </p>
                <p>
                  5. 회사는 의료기관이 아니며, 기공물의 임상 적용 및 환자 진료에
                  관한 판단·시술은 치과회원의 책임입니다. 기공물 하자로 인한
                  환자의 임상적 불만 및 이에 따른 손해배상은 본 조의 무상
                  리메이크 범위를 원칙으로 합니다. 다만, 회사의 고의 또는 중대한
                  과실이 있는 경우에는 그러하지 아니합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="pt-4">
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">
              part iii
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-white">
              기공회원의 기공물 공급
            </h2>
          </div>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제9조 (거래 관계)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 본 편은 기공회원이 회사에 기공물을 공급하고 대금을 정산받는
                  과정에서의 권리와 의무를 규정합니다.
                </p>
                <p>
                  2. 회사와 기공회원의 거래는 [치과회원 → 회사(매출)] 및 [회사
                  → 기공회원(매입)]의 도소매 유통 및 위탁 가공 관계로
                  성립합니다. 기공회원과 치과회원 사이에는 본 서비스 이용과
                  관련하여 직접적인 매매 계약이 성립하지 않습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제10조 (제작 및 품질 보증)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 기공회원은 치과회원 또는 회사가 서비스에 제공한 구강 스캔
                  데이터, 작업 지시 및 승인된 설계(CAD/CAM)를 준수하여 기공물을
                  제작하여야 합니다.
                </p>
                <p>
                  2. 기공회원은 관계 법령에 따라 적법하게 허가·인증된 치과 재료
                  및 원자재만을 사용하여야 합니다. 이를 위반하여 발생한 책임은
                  기공회원이 부담합니다.
                </p>
                <p>
                  3. 기공회원은 출고 전 변연(마진), 교합, 적합(Fit) 등을 자체
                  검수(QC)하고, 회사가 정한 품질 기준을 충족하는 상태로
                  인도하여야 합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제11조 (납기 및 배송)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 기공회원은 서비스에 표시된 제조 기한(납기) 내에 제작을
                  완료하고 출고를 개시하여야 합니다.
                </p>
                <p>
                  2. 납기가 지연되거나 지연이 예상되는 경우, 기공회원은 지체
                  없이 서비스를 통해 회사에 통보하여야 합니다.
                </p>
                <p>
                  3. 정당한 사유 없는 납기 지연이 같은 달(KST)에 3회 이상 발생한
                  경우, 회사는 경고, 이용 정지 또는 해당 기간 신규 배정 제한 등
                  패널티를 부과할 수 있습니다.
                </p>
                <p>
                  4. 납기 지연으로 회사가 치과회원에게 보상, 무상 리메이크 또는
                  신속 출고 비용 등을 부담한 경우, 회사는 그 비용을 기공회원에게
                  구상하거나 정산 대금에서 공제할 수 있습니다.
                </p>
                <p>
                  5. 회사가 지정한 배송업체에 기공물을 인계하기 전까지의
                  파손·분실 책임은 기공회원에게 있습니다. 인계 이후의 사고는
                  해당 배송업체의 약관 및 회사의 배송 정책에 따릅니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제12조 (하자 책임 및 구상권)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 치과회원이 수령한 기공물에 하자가 있어 회사가 제8조에 따라
                  무상 리메이크를 결정한 경우, 해당 기공물을 제작한 기공회원은
                  자신의 비용과 재료로 최우선 재제작하여 회사에 인도하여야
                  합니다.
                </p>
                <p>
                  2. 명백한 제작 불량으로 치과회원이 거래 취소 또는 환불을
                  요구하고 회사가 이를 인정한 경우, 회사는 해당 건의 정산 대금
                  전액을 지급하지 않거나, 이미 지급한 금액 및 회사가
                  치과회원에게 반환·보상한 금액을 기공회원에게 구상할 수
                  있습니다. 구상금은 이후 정산 대금에서 상계할 수 있습니다.
                </p>
                <p>
                  3. 다음 각 호의 사유로 인한 리메이크는 본 조의 하자 책임에서
                  제외되며, 기공회원은 해당 제작 비용을 회사에 정상 청구할 수
                  있습니다.
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    치과회원이 최초 제공한 구강 스캔 데이터 또는 인상 채득의
                    오류
                  </li>
                  <li>
                    제작 진행 중 치과회원 또는 회사의 설계·사양 변경 요청
                  </li>
                  <li>제8조 제3항 각 호에 해당하는 경우</li>
                </ul>
                <p>
                  4. 같은 달(KST)에 제작 불량으로 인한 무상 리메이크가 3회 이상
                  발생한 경우, 회사는 경고, 이용 정지 또는 배정 제한 등 패널티를
                  부과할 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제13조 (대금 정산 및 면세 증빙)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 회사는 매월 1일부터 말일(KST)까지 서비스에서 정산 대상으로
                  확정된 거래 내역을 기준으로 정산하고, 익월 1일에 기공회원에게
                  정산 대금을 지급합니다. 지급일이 금융기관 휴무일인 경우 다음
                  영업일에 지급할 수 있습니다.
                </p>
                <p>
                  2. 정산 금액은 해당 거래의 치과회원 결제액에서 계약 또는
                  서비스 화면에 정한 플랫폼 이용 수수료(정률 또는 정액)를 뺀
                  금액으로 합니다. 제11조 및 제12조에 따른 공제·상계가 있는 경우
                  이를 반영합니다.
                </p>
                <p>
                  3. 본 거래는 부가가치세법 제26조에 따른 의료보건 용역의
                  공급으로서 부가가치세 면세 대상에 해당합니다.
                </p>
                <p>
                  4. 기공회원은 정산 금액 확정 즉시 회사를 공급받는 자로 하여
                  세금계산서가 아닌 법정 계산서(면세용)를 발행하여야 합니다.
                  회사는 관계 법령이 허용하는 범위에서 위수탁 발행할 수
                  있습니다. 증빙 미발행 또는 세금계산서 오발행 시 회사는 대금
                  지급을 보류할 수 있습니다.
                </p>
                <p>
                  5. 정산 대금은 기공회원이 서비스에 등록한 계좌로 지급합니다.
                </p>
                <p>
                  6. 기공회원은 적립된 기공크레딧(정산 대기금)을 서비스 내
                  기공물·어벗 등 주문 대금에 상계할 수 있으며, 상계분은 해당 월
                  정산 지급액에서 제외합니다. 충전(기공료 선입금)과 기공크레딧
                  적립 경로는 구분하여 표시·관리합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제14조 (개인정보 보호 및 직거래 금지)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 기공회원은 서비스를 통해 알게 된 환자 구강 스캔, 임상 사진
                  등 개인정보를 기공물 제작 목적 외로 이용·제공·보관해서는 안
                  되며, 유출 시 민·형사상 책임을 부담합니다.
                </p>
                <p>
                  2. 기공회원은 서비스를 통해 알게 된 치과회원 정보를 이용하여
                  서비스를 우회한 직접 거래를 권유하거나 체결해서는 안 됩니다.
                </p>
                <p>
                  3. 제2항을 위반한 경우 회사는 이용계약을 즉시 해지하고, 발생한
                  손해의 배상 및 위약금을 청구할 수 있습니다. 위약금 기준은 별도
                  합의 또는 서비스 화면에 공지한 바에 따릅니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicPageLayout>
  );
};
