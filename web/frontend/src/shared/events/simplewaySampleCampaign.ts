// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 카피 주의(의료기기법·리베이트):
// - 「샘플 배포」「나눠드림」「피드백 시 우선 초대」 등 조건부 편익·판촉성 샘플 문구 금지.
// - 공개 문구는 「출시 행사 / 제품 소개 / 방문 안내」로 유지.

/** 심플웨이 신제품 — 그리보(Gribo) 출시 행사 (URL slug) */
export const SIMPLEWAY_SAMPLE_SLUG = "simpleway-gribo";
export const GRIBO_SAMPLE_SLUG = SIMPLEWAY_SAMPLE_SLUG;
export const GRIBO_EVENT_HREF = `/events/${SIMPLEWAY_SAMPLE_SLUG}`;

export const SIMPLEWAY_SAMPLE_KIT = [
  {
    id: "healing-h",
    name: "그리보 힐링H",
    spec: "",
    note: "힐링 어벗먼트",
  },
  {
    id: "abut-h",
    name: "그리보 어벗H",
    spec: "",
    note: "기성 어벗먼트",
  },
  {
    id: "custom-abut",
    name: "그리보 커스텀어벗",
    spec: "",
    note: "커스텀 어벗먼트",
  },
  {
    id: "driver",
    name: "그리보 드라이버",
    spec: "",
    note: "드라이버",
  },
] as const;

export const SIMPLEWAY_SAMPLE_EXTRAS = [
  {
    id: "scan-library",
    title: "힐링 스캔 라이브러리",
    body: "거래 기공소에 그리보 힐링 스캔 라이브러리를 설치해드립니다. 그리보 어벗H·커스텀어벗과 함께 사용할 수 있습니다.",
    tag: "기공소",
  },
  {
    id: "scanbar",
    title: "스캔바 소개",
    body: "구강 스캐너를 사용 중인 치과에는 스캔바 제품도 함께 소개합니다.",
    tag: "구강 스캔 치과",
  },
  {
    id: "abuts-platform",
    title: "어벗츠 플랫폼",
    body: "구강스캔·석고모델로 커스텀어벗 디자인·생산을 의뢰하는 방법을 어벗츠 플랫폼에서 안내합니다.",
    tag: "치과·기공소",
  },
] as const;

export const SIMPLEWAY_DEALER_HELP =
  "가까운 지역 재료상 사장님을 소개해 주세요. 그분께 지역 영업권을 드립니다. (옵션)";

/** 히어로 — 제품 나열은 Product lineup과 중복되므로 방문·안내 가치만 적는다. */
export const SIMPLEWAY_HERO_SUB_LINES = [
  "신청해 주시면 영업 담당자가 치과를 방문합니다.",
  "제품과 사용 방법을 직접 안내해 드립니다.",
] as const;

export const SIMPLEWAY_HERO_SUB = SIMPLEWAY_HERO_SUB_LINES.join(" ");

export const GRIBO_HERO_EYEBROW = "Gribo Launch";

export const GRIBO_EVENT_TITLE =
  "심플웨이 신제품 - 그리보(Gribo) 출시 행사";
