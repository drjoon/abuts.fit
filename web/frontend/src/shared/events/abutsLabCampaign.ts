// related files:
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 카피 주의: 출시 행사와 같이 샘플·조건부 편익 문구는 쓰지 않는다.
// 신청 후 안내는 원격지원 또는 방문상담.

/** 어벗츠기공소 소개 */
export const ABUTS_LAB_EVENT_SLUG = "abuts-lab";

export const ABUTS_LAB_EVENT_PATH = "/events/abuts-lab";

/** 이벤트 가입 계정. 방문 전 온보딩 대신 안내 페이지를 보여 준다. */
export const ABUTS_LAB_SIGNUP_CHANNEL = "event_abuts_lab";

export function isAbutsLabVisitPending(
  user:
    | {
        signupChannel?: string | null;
        onboardingWizardCompleted?: boolean;
        businessVerified?: boolean;
      }
    | null
    | undefined,
): boolean {
  if (!user || user.signupChannel !== ABUTS_LAB_SIGNUP_CHANNEL) return false;
  return !(user.onboardingWizardCompleted || user.businessVerified);
}

export const ABUTS_LAB_EVENT_HEADLINE = "어벗츠 소프트웨어 소개";

export const ABUTS_LAB_HERO_EYEBROW = "Abuts Lab";

/** 히어로 본문. 가입 신청은 치과. 문장 사이 강제 줄바꿈 없음. */
export const ABUTS_LAB_HERO_SUB =
  "디자인이 좋아 보여도 가공하면 다르게 나올 수 있습니다. 어벗츠 소프트웨어가 곡면을 맞춰 매끈하게 가공합니다.";

/** 상담 신청 뒤 안내. 페이지·토스트·완료 화면이 같이 쓴다. */
export const ABUTS_LAB_APPLY_FOLLOWUP =
  "원격지원 또는 방문상담으로 안내합니다.";

export const ABUTS_LAB_IMAGES = {
  design: "/events/abuts-lab/design-compare.png",
  step: "/events/abuts-lab/machining-step.jpg",
  smooth: "/events/abuts-lab/machining-smooth.jpg",
  fillet: "/events/abuts-lab/fillet-warning.jpg",
  gouge: "/events/abuts-lab/corner-gouge.jpg",
} as const;

/** 임상에 맞춘 디자인 비교. 각 장의 왼쪽은 일반 기공사, 오른쪽은 어벗츠. */
export const ABUTS_LAB_CLINICAL_SLIDES = [
  "/events/abuts-lab/clinical/01.jpg",
  "/events/abuts-lab/clinical/02.jpg",
  "/events/abuts-lab/clinical/03.jpg",
  "/events/abuts-lab/clinical/04.jpg",
  "/events/abuts-lab/clinical/05.jpg",
  "/events/abuts-lab/clinical/06.jpg",
  "/events/abuts-lab/clinical/07.jpg",
] as const;
