// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 카피 주의(의료기기법·리베이트):
// - 「샘플 배포」「나눠드림」「피드백 시 우선 초대」 등 조건부 편익·판촉성 샘플 문구 금지.
// - 공개 문구는 「출시 행사 / 제품 소개 / 방문 안내」로 유지.

/** 어벗츠 신제품 출시 행사 */
export const SIMPLEWAY_SAMPLE_SLUG = "abuts-launch";
/** 예전 공개 주소. 페이지는 새 slug로 바꾸고, 신청 이력은 서버가 새 slug로 옮긴다. */
export const SIMPLEWAY_SAMPLE_SLUGS_LEGACY = [
  "simpleway-abuts",
  "simpleway-gribo",
  "simpleway-sample-kit",
] as const;
export const GRIBO_SAMPLE_SLUG = SIMPLEWAY_SAMPLE_SLUG;
export const GRIBO_EVENT_HREF = `/events/${SIMPLEWAY_SAMPLE_SLUG}`;

export function resolveSimplewayEventSlug(slug: string) {
  return (SIMPLEWAY_SAMPLE_SLUGS_LEGACY as readonly string[]).includes(slug)
    ? SIMPLEWAY_SAMPLE_SLUG
    : slug;
}

export const SIMPLEWAY_SAMPLE_KIT = [
  {
    id: "abutments",
    name: "어벗츠 힐링H, 어벗H, 커스텀어벗",
    spec: "",
    note: "그립·스캔 힐링, 기성 및 커스텀 어벗먼트",
  },
  {
    id: "driver",
    name: "어벗츠 드라이버",
    spec: "",
    note: "그립 헥스 드라이버",
  },
  {
    id: "scanbar",
    name: "어벗츠 스캔바",
    spec: "",
    note: "구강스캔 인식 향상",
  },
  {
    id: "package-500",
    name: "어벗츠 패키지",
    spec: "",
    note: "올인원 500 패키지",
  },
] as const;

export const SIMPLEWAY_SAMPLE_EXTRAS = [
  {
    id: "scan-library",
    title: "힐링 스캔 라이브러리",
    body: "거래 기공소에 어벗츠 힐링 스캔 라이브러리를 설치해드립니다.\n어벗츠 어벗H·커스텀어벗과 함께 사용할 수 있습니다.",
    tag: "기공소",
  },
  {
    id: "abuts-platform",
    title: "어벗츠 플랫폼",
    body: "치과와 기공소가 온라인으로 기공을 의뢰하고, 어벗츠 커스텀어벗과도 바로 연동됩니다.",
    tag: "치과·기공소",
  },
] as const;

export const SIMPLEWAY_DEALER_HELP =
  "친한 재료 사장님을 소개해 주세요. 그분께 지역 영업권을 드립니다.";

/** 히어로 — 제품 나열은 Product lineup과 중복되므로 방문·안내 가치만 적는다. */
export const SIMPLEWAY_HERO_SUB_LINES = [
  "신청해 주시면 영업 담당자가 치과를 방문합니다.",
  "제품과 사용 방법을 직접 안내해 드립니다.",
] as const;

export const SIMPLEWAY_HERO_SUB = SIMPLEWAY_HERO_SUB_LINES.join(" ");

export const GRIBO_HERO_EYEBROW = "Abuts Launch";

/** 행사 카드·히어로 제목 */
export const SIMPLEWAY_EVENT_HEADLINE = "어벗츠 신제품 출시 행사";

export const GRIBO_EVENT_TITLE = SIMPLEWAY_EVENT_HEADLINE;
