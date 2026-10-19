// related files:
// - web/frontend/src/shared/lib/contactInfo.ts
// - web/frontend/src/features/landing/Footer.tsx
// - web/frontend/src/pages/public/BusinessPage.tsx
import { Link } from "react-router-dom";
import {
  COMPANY_ADDRESS,
  COMPANY_BUSINESS_REGISTRATION_NUMBER,
  COMPANY_CEO_NAME,
  COMPANY_MAIL_ORDER_REPORT_NUMBER,
  COMPANY_MEDICAL_DEVICE_SALES_REPORT_NUMBER,
  COMPANY_NAME,
  COMPANY_PHONE,
  CONTACT_EMAIL,
  FTC_MAIL_ORDER_BUSINESS_INFO_URL,
} from "@/shared/lib/contactInfo";
import { cn } from "@/shared/ui/cn";

type SellerIdentityDisclosureProps = {
  className?: string;
  /** footer-light | footer-dark | auth */
  tone?: "footer-light" | "footer-dark" | "auth";
  /** 결제·주문 화면 등 — 약관·환불 링크 강조 */
  showPolicyLinks?: boolean;
};

const linkTone = {
  "footer-light": "text-sky-700 hover:text-sky-900 underline-offset-2 hover:underline",
  "footer-dark": "text-white/80 hover:text-white underline-offset-2 hover:underline",
  auth: "text-white/55 hover:text-white/90 underline-offset-2 hover:underline",
};

const textTone = {
  "footer-light": "text-slate-500",
  "footer-dark": "text-white/60",
  auth: "text-white/50",
};

function PolicyLinks({ tone }: { tone: SellerIdentityDisclosureProps["tone"] }) {
  const linkClass = linkTone[tone ?? "footer-light"];
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link to="/terms" className={linkClass}>
        이용약관
      </Link>
      <span className={textTone[tone ?? "footer-light"]} aria-hidden>
        ·
      </span>
      <Link to="/privacy" className={linkClass}>
        개인정보처리방침
      </Link>
      <span className={textTone[tone ?? "footer-light"]} aria-hidden>
        ·
      </span>
      <Link to="/service" className={linkClass}>
        서비스/상품 안내
      </Link>
      <span className={textTone[tone ?? "footer-light"]} aria-hidden>
        ·
      </span>
      <Link to="/refund-policy" className={linkClass}>
        환불·청약철회
      </Link>
      <span className={textTone[tone ?? "footer-light"]} aria-hidden>
        ·
      </span>
      <Link to="/business" className={linkClass}>
        사업자 정보
      </Link>
    </p>
  );
}

/** 전자상거래법 제10조 신원정보 표시(푸터·로그인·결제 안내 공통) */
export function SellerIdentityDisclosure({
  className,
  tone = "footer-light",
  showPolicyLinks = true,
}: SellerIdentityDisclosureProps) {
  const textClass = textTone[tone];
  const linkClass = linkTone[tone];

  return (
    <div className={cn("text-xs leading-relaxed", textClass, className)}>
      <div>
        {COMPANY_NAME} | 대표: {COMPANY_CEO_NAME} | 사업자등록번호:{" "}
        {COMPANY_BUSINESS_REGISTRATION_NUMBER}
      </div>
      <div>
        통신판매업신고: {COMPANY_MAIL_ORDER_REPORT_NUMBER}
      </div>
      <div>
        의료기기판매업신고: {COMPANY_MEDICAL_DEVICE_SALES_REPORT_NUMBER}
      </div>
      <div>
        주소: {COMPANY_ADDRESS} | 전화: {COMPANY_PHONE}
        <br />
        이메일:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
          {CONTACT_EMAIL}
        </a>
      </div>
      <p className="mt-2">
        <a
          href={FTC_MAIL_ORDER_BUSINESS_INFO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          공정거래위원회 통신판매사업자 정보 확인
        </a>
      </p>
      {showPolicyLinks ? <PolicyLinks tone={tone} /> : null}
    </div>
  );
}
