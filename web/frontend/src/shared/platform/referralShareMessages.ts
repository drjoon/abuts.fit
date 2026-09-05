// related files:
// - web/frontend/src/features/platform/PlatformBenefitsShareButtons.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-08-12: 소개 안내 문구·링크 SSOT.

export const buildReferralSignupLink = (referralCode: string) => {
  const code = String(referralCode || "")
    .trim()
    .toUpperCase();
  if (!code) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/signup/referral?ref=${encodeURIComponent(code)}`;
};

export const buildPracticeIntroMessage = (
  link: string,
  _options?: { feeWaiver?: boolean },
) => {
  const url = String(link || "").trim();
  if (!url) return "";

  return `안녕하세요 🙂 어벗츠에 가입해 주시면 기공의뢰서·구강스캔 전달과 내역 관리가 훨씬 편해집니다.\n아래 링크로 가볍게 가입해 주세요.\n${url}`;
};

export const buildLabIntroMessage = (link: string) => {
  const url = String(link || "").trim();
  if (!url) return "";

  return `안녕하세요 🙂 어벗츠에 기공소로 가입하시면 의뢰·정산·커스텀어벗 생산까지 한곳에서 관리하실 수 있어요.\n커스텀어벗 가입 후 첫 2건은 무료 테스트로 체험할 수 있습니다.\n아래 링크로 가입해 주세요.\n${url}`;
};
