// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/backend/controllers/events/marketingEvent.controller.js

/** 심플웨이 신제품 샘플 배포 행사 — 공개 페이지 카피 SSOT */
export const SIMPLEWAY_SAMPLE_SLUG = "simpleway-sample-kit";

export const SIMPLEWAY_SAMPLE_KIT = [
  {
    id: "healing-h",
    name: "그리보 힐링H",
    spec: "7M · 1EA",
    note: "힐링 어벗 샘플",
  },
  {
    id: "abut-h",
    name: "그리보 어벗H",
    spec: "7M · 1EA",
    note: "기성 어벗 샘플",
  },
  {
    id: "driver-s",
    name: "그리보 드라이버(S)",
    spec: "1EA",
    note: "드라이버 샘플",
  },
] as const;

export const SIMPLEWAY_SAMPLE_EXTRAS = [
  {
    id: "scan-library",
    title: "힐링 스캔 라이브러리",
    body: "거래 기공소에 그리보 힐링 스캔 라이브러리를 설치해 드립니다. 기성 어벗·커스텀 어벗 모두 사용 가능합니다.",
    tag: "기공소",
  },
  {
    id: "scanbar",
    title: "스캔바 소개",
    body: "구강 스캔을 사용 중인 치과에는 스캔바를 함께 소개해 드립니다.",
    tag: "구강 스캔 치과",
  },
] as const;

export const SIMPLEWAY_DEALER_HELP =
  "친한 로컬 재료상 사장님을 소개해주세요. 그 분께 지역 영업권을 드립니다.";

export const SIMPLEWAY_HERO_SUB =
  "그리보 힐링H · 어벗H · 드라이버(S) 샘플을 원장님께 나눠드려요. 좋은 피드백 주시면 다음 행사에 우선적으로 초대해드려요.";

export const SIMPLEWAY_HERO_BADGE =
  "화 · 수 이틀간 신청. 피드백 우선 선별 배포.";
