// related files:
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 카피 주의: 출시 행사와 같이 샘플·조건부 편익 문구는 쓰지 않는다.
// 방문 안내는 「영업 담당자」.

/** 어벗츠기공소 소개 */
export const ABUTS_LAB_EVENT_SLUG = "abuts-lab";

export const ABUTS_LAB_EVENT_HEADLINE = "어벗츠기공소 소개";

export const ABUTS_LAB_HERO_EYEBROW = "Abuts Lab";

export const ABUTS_LAB_HERO_SUB_LINES = [
  "디자인은 예쁜데, 가공에서 단차가 나는 경우가 있습니다.",
  "곡면을 소프트웨어로 다듬어 매끈하게 가공합니다.",
] as const;

export const ABUTS_LAB_IMAGES = {
  design: "/events/abuts-lab/design-compare.png",
  step: "/events/abuts-lab/machining-step.jpg",
  smooth: "/events/abuts-lab/machining-smooth.jpg",
} as const;
