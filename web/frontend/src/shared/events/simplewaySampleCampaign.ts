// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js
//
// 카피 주의(의료기기법·리베이트):
// - 「샘플 배포」「나눠드림」「피드백 시 우선 초대」 등 조건부 편익·판촉성 샘플 문구 금지.
// - 공개 문구는 「출시 행사 / 제품 소개 / 방문 안내」로 유지.

/** 심플웨이 신제품 — 그리보(Gribo) 출시 행사 (URL slug 유지) */
export const SIMPLEWAY_SAMPLE_SLUG = "simpleway-sample-kit";
export const GRIBO_SAMPLE_SLUG = SIMPLEWAY_SAMPLE_SLUG;
export const GRIBO_EVENT_HREF = `/events/${SIMPLEWAY_SAMPLE_SLUG}`;

export const SIMPLEWAY_SAMPLE_KIT = [
  {
    id: "healing-h",
    name: "그리보 힐링H",
    spec: "7M · 1EA",
    note: "힐링 어벗먼트",
  },
  {
    id: "abut-h",
    name: "그리보 어벗H",
    spec: "7M · 1EA",
    note: "기성 어벗먼트",
  },
  {
    id: "driver-s",
    name: "그리보 드라이버(S)",
    spec: "1EA",
    note: "드라이버",
  },
] as const;

export const SIMPLEWAY_SAMPLE_EXTRAS = [
  {
    id: "scan-library",
    title: "힐링 스캔 라이브러리",
    body: "거래 기공소에 그리보 힐링 스캔 라이브러리 설치를 안내해 드립니다. 그리보 어벗H·그리보 커스텀어벗과 함께 사용할 수 있습니다.",
    tag: "기공소",
  },
  {
    id: "scanbar",
    title: "스캔바 소개",
    body: "구강 스캐너를 사용 중인 치과에는 스캔바 제품 소개를 함께 안내해 드립니다.",
    tag: "구강 스캔 치과",
  },
] as const;

export const SIMPLEWAY_DEALER_HELP =
  "친한 로컬 재료상 사장님을 소개해주세요. 그 분께 지역 영업권을 드립니다.";

export const SIMPLEWAY_HERO_SUB =
  "심플웨이의 신제품 그리보(Gribo) 출시 안내입니다. 그리보 힐링H · 그리보 어벗H · 그리보 드라이버(S) 등 제품 라인업을 소개해 드립니다.";

export const SIMPLEWAY_HERO_BADGE = "화 · 수 이틀간 신청 접수";

export const GRIBO_HERO_EYEBROW = "Simpleway · Gribo Launch";

export const GRIBO_EVENT_TITLE =
  "심플웨이 신제품 - 그리보(Gribo) 출시 행사";
