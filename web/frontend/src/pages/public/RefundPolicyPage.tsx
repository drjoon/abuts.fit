// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
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
            베타 서비스 동안에는 결제된 금액이 없으며, 정식 출시 시 아래 정책을
            기준으로 환불을 지원합니다.
          </p>
        </div>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">1. 적용 범위</h2>
          <p>
            Abuts.fit 유료 플랜을 이용 중인 고객에게 적용되며, 사용 기간 중 문제로
            인해 서비스를 이용하지 못한 경우 환불을 요청할 수 있습니다.
          </p>
        </section>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">2. 환불 기준</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>서비스 결제 후 14일 이내, 실제 사용 이력이 없을 경우 전액 환불</li>
            <li>
              사용 이력이 있는 경우 남은 기간에 대해 일할 계산하여 환불을
              진행합니다.
            </li>
            <li>특별 할인·프로모션 플랜은 별도의 약관이 적용될 수 있습니다.</li>
          </ul>
        </section>

        <section className={`${PUBLIC_CARD_CLASS} space-y-4 rounded-2xl p-6 text-slate-600`}>
          <h2 className="text-xl font-semibold text-[#0b2a5c]">3. 환불 절차</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>고객 지원 채널(채팅 또는 이메일)로 환불 요청</li>
            <li>담당 매니저가 사용 이력 및 결제 내역을 확인</li>
            <li>승인 후 영업일 기준 5일 이내 환불 처리</li>
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
          </p>
        </div>
      </div>
    </PublicPageLayout>
  );
};
