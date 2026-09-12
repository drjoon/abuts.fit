// related files:
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx
// - web/frontend/src/features/landing/LandingAudienceSection.tsx
// - web/frontend/src/features/landing/LandingPlatformSection.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx

/** 랜딩 UI 토큰 — 페이지 배경은 PublicPageLayout SSOT */
export const landingTheme = {
  accentText: "text-sky-200/90",
  /** 한 톤의 soft highlight — 다색 그라데이션 대신 */
  headlineSoft: "text-white",
  glass:
    "border border-white/[0.12] bg-white/[0.07] backdrop-blur-xl",
  glassStrong:
    "border border-white/[0.14] bg-white/[0.1] backdrop-blur-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
  panel:
    "rounded-2xl border border-white/[0.12] bg-white/[0.08] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)]",
  panelSoft:
    "rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.1] to-white/[0.04] backdrop-blur-xl",
  imageFrame:
    "overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/25 to-white/5 p-[1px] shadow-[0_32px_80px_rgba(0,0,0,0.28)]",
  imageInner: "rounded-[15px] bg-white ring-1 ring-white/40",
  ctaPrimary:
    "rounded-full bg-white text-slate-900 shadow-[0_8px_32px_rgba(255,255,255,0.2)] transition-all hover:bg-white/90",
  ctaGhost:
    "rounded-full border border-white/20 bg-white/[0.07] text-white/90 backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/[0.12] hover:text-white",
  /** @deprecated light cards — prefer panel / panelSoft on dark landing */
  statCard:
    "rounded-2xl border border-white/15 bg-white/90 text-slate-900 shadow-[0_18px_45px_rgba(6,8,20,0.35)] backdrop-blur-2xl",
  featureCard:
    "rounded-2xl border border-white/10 bg-white/[0.06] text-white shadow-[0_18px_45px_rgba(6,8,20,0.25)] backdrop-blur-2xl",
  pipelineCard:
    "rounded-2xl border border-white/10 bg-white/[0.05] text-white shadow-[0_20px_50px_rgba(6,8,20,0.25)] backdrop-blur-2xl",
} as const;

/** 회사 정체성 · 비전 (영업·랜딩 공통) */
export const landingIdentity = {
  eyebrow: "치과 ↔ 기공소 ↔ 어벗츠",
  brandLine: "abuts.fit",
  oneLiner:
    "치과·기공소·CNC 제조를 한 흐름으로 잇는 디지털 제작 워크스페이스",
  body: "커스텀 어벗·보철을 의뢰부터 제작·배송·정산까지 한곳에서. 진행과 돈이 같은 기록으로 남습니다.",
  identity:
    "임플란트 커스텀 어벗·보철의 운영·연결 허브. 단순 쇼핑몰이 아니라 의뢰·제작·배송·정산을 한곳에서 관리합니다.",
  vision:
    "전화·메신저·엑셀 없이, 같은 화면에서 의뢰하고 진행을 보고 결제까지 끝내는 투명한 제작 네트워크.",
  manufacturerNote: "커스텀 어벗먼트 CNC 제조는 (주)애크로덴트가 담당합니다.",
  pitch30s:
    "어벗츠.핏은 치과와 기공소가 커스텀 어벗·보철을 의뢰부터 제작·배송·정산까지 한곳에서 처리하는 디지털 제작 플랫폼입니다. 놓치던 진행과 돈이 같은 기록·같은 화면으로 정리됩니다.",
} as const;

export const workflowSteps = [
  "주문",
  "생산",
  "추적",
  "결제",
  "계산서",
] as const;

/** 랜딩 본문용 — 짧은 한 줄 (중복 최소화) */
export const landingFlowSteps = [
  {
    step: "01",
    title: "의뢰",
    body: "스캔·디자인·의뢰 정보를 한곳에서 등록",
  },
  {
    step: "02",
    title: "제작",
    body: "기공·CNC 스테이지가 같은 타임라인으로",
  },
  {
    step: "03",
    title: "배송 · 정산",
    body: "출고 추적과 크레딧·계산서까지 이어짐",
  },
] as const;

export const whyAbutsPoints = [
  "스테이지 가시성으로 납기·우선순위를 같은 화면에서 조율",
  "가상 우편함·배송 추적으로 “지금 어디?” 문의가 줄어듦",
  "거래 선수금과 월말 (세금)계산서로 정산 부담 감소",
  "치과↔기공소↔어벗츠 CNC가 같은 네트워크로 연결",
] as const;

/** 치과(의뢰 발신자) 영업·랜딩 1페이지 */
export const landingAudiencePractice = {
  id: "practice" as const,
  roleLabel: "의뢰 발신자 (치과)",
  shortLabel: "치과",
  headline: "의뢰하고, 진행 보고, 결제까지",
  subheadline: "기공 의뢰를 메신저가 아니라 시스템으로.",
  pitch:
    "어벗 디자인·생산, 임시치아·지르 보철까지 앱에서 의뢰하세요. 어벗츠기공소 또는 지정 기공소로 보내고, 출고·배송·결제를 한곳에서 봅니다.",
  benefits: [
    "기공의뢰·어벗 디자인·생산을 앱에서 바로 의뢰",
    "어벗츠기공소 또는 지정 기공소로 전송 · 채팅·파일 통합",
    "출고·배송 추적으로 진행 문의 전화 감소",
    "크레딧(거래 선수금) 결제 · 월말 (세금)계산서",
    "스토어에서 어벗·시술 키트까지 같은 생태계",
  ],
  /** 랜딩용 짧은 혜택 (히어로 이후 스캔용) */
  landingBenefits: [
    "앱에서 바로 의뢰 · 지정 기공소 전송",
    "출고·배송 추적으로 진행 문의 감소",
    "크레딧 결제 · 월말 계산서",
  ],
  cta: "치과로 시작하기",
} as const;

/** 기공소(의뢰 수신자) 영업·랜딩 1페이지 */
export const landingAudienceLab = {
  id: "lab" as const,
  roleLabel: "의뢰 수신자 (기공소)",
  shortLabel: "기공소",
  headline: "접수·디자인에 집중하고, CNC·정산은 플랫폼에",
  subheadline: "자체 설비 부담을 줄이고, 의뢰 네트워크를 키우세요.",
  pitch:
    "치과 의뢰를 수신·작업시작·작업·완료까지 보드로 관리하고, 어벗 CNC 생산은 어벗츠로 넘길 수 있습니다. 수가·크레딧·정산이 플랫폼에 묶여 수기 정산이 줄어듭니다.",
  benefits: [
    "치과 기공의뢰 수신·작업시작·작업·완료를 한 보드에서",
    "어벗 디자인 업로드 후 CNC 생산은 어벗츠로",
    "수가·정산·크레딧으로 수기 정산·누락 감소",
    "제조사와 같은 스테이지 타임라인으로 납기 조율",
    "어벗츠 네트워크를 통한 신규 치과 의뢰 기회",
  ],
  landingBenefits: [
    "수신·작업시작·완료를 한 보드에서",
    "CNC 생산은 어벗츠로 · 수기 정산 감소",
    "네트워크를 통한 신규 의뢰 기회",
  ],
  cta: "기공소로 시작하기",
} as const;

export const landingAudiences = [
  landingAudiencePractice,
  landingAudienceLab,
] as const;
