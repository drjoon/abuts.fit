// related files:
// - web/frontend/src/pages/public/TermsPage.tsx
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// change-log:
// - 2026-10-31: 베타·유료 플랜 문구를 크레딧 선수금 환불(약관 제7조)에 맞춤.
import { Link } from "react-router-dom";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
  PUBLIC_PAGE_EYEBROW,
  PUBLIC_PAGE_TITLE,
  PUBLIC_PAGE_SUBTITLE,
} from "./components/PublicPageLayout";

export const RefundPolicyPage = () => {
  return (
    <PublicPageLayout>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2 text-center">
          <p className={PUBLIC_PAGE_EYEBROW}>Abuts.fit Policy</p>
          <h1 className={PUBLIC_PAGE_TITLE}>환불 정책</h1>
          <p className={PUBLIC_PAGE_SUBTITLE}>
            쓰지 않은 유료 크레딧(거래 선수금)은 요청 또는 계정 해지 시 전액
            환불합니다.
          </p>
        </div>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">1. 적용 범위</h2>
          <p>
            기공소·기공실 있는 치과가 커스텀어벗 주문을 위해 선결제한 유료
            크레딧에 적용합니다.
            <br />
            무료·이벤트로 지급된 크레딧은 환불하지 않습니다.
          </p>
        </section>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">2. 환불 기준</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>거래 계약 중도 해지 또는 계정 해지 시 미사용 유료 크레딧 전액</li>
            <li>환불 금액은 잔여 유료 크레딧(공급가) 기준입니다.</li>
            <li>
              이미 발행한 면세 계산서는 마이너스 수정 계산서로 처리합니다.
            </li>
          </ul>
        </section>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">3. 환불 절차</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>문의 메뉴 또는 이메일로 환불을 요청합니다.</li>
            <li>담당자가 잔액과 결제 내역을 확인합니다.</li>
            <li>승인 후 확인된 환불 계좌로 입금합니다.</li>
          </ol>
        </section>

        <div className={`${PUBLIC_CARD_CLASS} rounded-2xl p-6 text-center text-slate-600`}>
          <p>
            환불 관련 추가 문의는
            <Link
              to="/contact"
              className="mx-2 text-sky-600 underline decoration-dotted underline-offset-2 hover:text-sky-700"
            >
              고객 지원팀
            </Link>
            으로 연락해주세요.
            <br />
            상세는 이용약관 제7조를 따릅니다.
          </p>
        </div>
      </div>
    </PublicPageLayout>
  );
};
