// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx

/** 랜딩 CAD 프리뷰 (치수·스펙 주석 포함) */
export const LANDING_CAD_PREVIEW = "/landing/abutment-cad-preview.png";

/** 커스텀어벗 — 실물 컷아웃 (배경 제거) */
export const LANDING_CUSTOM_ABUTMENT = "/landing/custom-abutment-product.jpg";
export const LANDING_CUSTOM_ABUTMENT_CUTOUT =
  "/landing/custom-abutment-cutout.png";

/** 커스텀어벗 — CNC 추적관리 (기공소·치과명 블러) */
export const LANDING_CUSTOM_TRACKING = "/landing/custom-tracking.jpg";

/** 히어로 — Waveon 랩 포토 (브랜드 블루·바이올렛 색보정) */
export const LANDING_HERO_PHOTO = "/landing/waveon/hero.jpg";
/** @deprecated 키트 영상 — `/` 히어로는 LANDING_HERO_PHOTO 사용 */
export const LANDING_HERO_VIDEO = "/landing/hero-simple.mp4";
export const LANDING_HERO_POSTER = "/landing/waveon/hero.jpg";
export const LANDING_SIMPLE_WAY_STILL = "/landing/simple-way-kits.jpg";

/**
 * 심플웨이 오퍼 히어로 — ACRODENT TheSimple Implant (YouTube).
 * Initial 키트 → 모델 수술 → 본핀. (Install 14–40s 구간 제외)
 */
export const LANDING_SW_YOUTUBE_ID = "WYNPxDo-DP0";
export const LANDING_SW_YOUTUBE_SEGMENTS = [
  { startSec: 55, endSec: 72 }, // Initial kit
  { startSec: 122, endSec: 152 }, // 모델 수술
  { startSec: 165, endSec: 186 }, // 본핀·드릴 높이
] as const;
/** 시크 전 가림용 — Guide Kit 스틸 (Install 키트·챕터 타이틀 미포함) */
export const LANDING_SW_YOUTUBE_POSTER = "/landing/simpleway/guide-kit.jpg";
export const LANDING_SW_CATALOG_ASSEMBLY =
  "/landing/simpleway/catalog-assembly.png";
/** 히어로 — 어벗츠 커스텀어벗. 심플어벗 조립도에서 어벗만 바꾼 컷 */
export const LANDING_SW_CUSTOM_ASSEMBLY =
  "/landing/simpleway/gribo-custom-assembly.png?v=19";
/** Flow Chart 직경 라인 (10→6, 맨 아래 6=노랑) */
export const LANDING_SW_FLOW_ROWS = [
  {
    id: "10",
    src: "/landing/simpleway/catalog-flow-row-10.png",
    alt: "Flow Chart 직경 10",
  },
  {
    id: "9",
    src: "/landing/simpleway/catalog-flow-row-9.png",
    alt: "Flow Chart 직경 9",
  },
  {
    id: "8",
    src: "/landing/simpleway/catalog-flow-row-8.png",
    alt: "Flow Chart 직경 8",
  },
  {
    id: "7",
    src: "/landing/simpleway/catalog-flow-row-7.png",
    alt: "Flow Chart 직경 7",
  },
  {
    id: "6",
    src: "/landing/simpleway/catalog-flow-row-6.png",
    alt: "Flow Chart 직경 6 (노랑)",
  },
] as const;
export const LANDING_SW_FLOW_DEFAULT_ROW_ID = "6";

/** Waveon 랜딩 포토 — 블루·바이올렛 색보정본 */
export const LANDING_WAVEON_HERO = "/landing/waveon/hero.jpg";
export const LANDING_WAVEON_PARTNERSHIP = "/landing/waveon/partnership.jpg";
export const LANDING_WAVEON_WORKFLOW = "/landing/waveon/workflow.jpg";

/** 심플웨이 오퍼 — 카탈로그 발췌 (가이드·힐링·어벗·키트만) */
export const LANDING_SW_HERO_KITS = "/landing/simpleway/hero-kits.jpg";
export const LANDING_SW_GUIDE_PEN_PIN = "/landing/simpleway/guide-pen-pin.jpg";
export const LANDING_SW_BONE_SHAPER = "/landing/simpleway/bone-shaper.jpg";
export const LANDING_SW_CHECK_PIN = "/landing/simpleway/check-pin.jpg";
export const LANDING_SW_ABUTMENT_CROWN =
  "/landing/simpleway/simple-abutment-crown.jpg";
export const LANDING_SW_GUIDE_KIT = "/landing/simpleway/guide-kit.jpg";
export const LANDING_SW_CHECK_KIT = "/landing/simpleway/check-kit.jpg";
export const LANDING_SW_PROSTHETIC_KIT = "/landing/simpleway/prosthetic-kit.jpg";
export const LANDING_SW_GUIDE_HOW_TO = "/landing/simpleway/guide-how-to.jpg";

/** 플랫폼 화면. 이름·기공소·금액은 가림 */
export const LANDING_PLATFORM_REQUEST = "/landing/platform-request.jpg";
export const LANDING_PLATFORM_BOARD = "/landing/platform-board.jpg";
export const LANDING_PLATFORM_LEDGER = "/landing/platform-ledger.jpg";
export const LANDING_PLATFORM_STATS = "/landing/platform-stats.jpg";

/** 제품 개발 사례 합성용 */
export const LANDING_CASE_ABUTMENT = "/store/acrodent/simple-abutment-2.jpg";
export const LANDING_CASE_HEALING = "/store/acrodent/simple-healing-2.jpg";
export const LANDING_CASE_KIT = "/store/acrodent/initial-kit.jpg";
