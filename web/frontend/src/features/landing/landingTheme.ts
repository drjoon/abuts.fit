// related files:
// - web/frontend/src/features/landing/LandingAboutSection.tsx
// - web/frontend/src/features/landing/LandingBrandStory.tsx
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx
// - web/frontend/src/features/landing/LandingAudienceSection.tsx
// - web/frontend/src/features/landing/LandingPlatformSection.tsx
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/PlatformPage.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx

/** 랜딩 UI 토큰 — 라이트 톤. 페이지 배경은 PublicPageLayout tone="light" */
export const landingTheme = {
  pageBg: "bg-[#f7f9fc] text-slate-900",
  sectionAlt: "bg-[#eef3f9]",
  accentText: "text-sky-600",
  eyebrow:
    "inline-flex rounded-full border border-sky-200/80 bg-sky-50 px-3.5 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-700",
  headline: "text-[#0b2a5c]",
  body: "text-slate-600",
  muted: "text-slate-500",
  faint: "text-slate-400",
  glass:
    "border border-slate-200/80 bg-white/80 backdrop-blur-xl",
  glassStrong:
    "border border-sky-200/70 bg-sky-50/90 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]",
  panel:
    "rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]",
  panelSoft:
    "rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-[#f4f7fb]",
  imageFrame:
    "overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-white p-[1px] shadow-[0_16px_40px_rgba(15,23,42,0.08)]",
  imageInner: "rounded-[15px] bg-white ring-1 ring-slate-100",
  ctaPrimary:
    "rounded-full bg-[#2563eb] text-white shadow-[0_10px_28px_rgba(37,99,235,0.28)] transition-all hover:bg-[#1d4ed8]",
  ctaGhost:
    "rounded-full border border-slate-300 bg-white text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50",
  ctaOnDark:
    "rounded-full bg-white text-[#0b2a5c] shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition-all hover:bg-white/90",
  ctaGhostOnDark:
    "rounded-full border border-white/40 bg-transparent text-white transition-all hover:border-white/70 hover:bg-white/10",
  bandDark:
    "rounded-2xl border border-[#0b2a5c]/20 bg-[#0b2a5c] text-white shadow-[0_20px_50px_rgba(11,42,92,0.25)]",
  /** @deprecated — light landing uses panel / panelSoft */
  statCard:
    "rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.06)]",
  featureCard:
    "rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.06)]",
  pipelineCard:
    "rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.06)]",
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

/** 공개 랜딩 About 스토리 (어벗츠 소개) */
export const landingAbout = {
  eyebrow: "ABOUT ABUTS",
  headline: "진료실에서 느낀 불편을,\n직접 바꾸기 시작했습니다.",
  body: "임플란트 시술을 더 편하게, 진료실 업무를 더 단순하게.\n치과의사가 현장에서 직접 만든 솔루션입니다.",
  origin: "어벗츠는 치과의사가 진료 현장에서 시작한 브랜드입니다.",
  problemHeadline:
    "진료 중에도, 진료가 끝난 뒤에도\n개선하고 싶은 일이 있었습니다.",
  problems: [
    {
      step: "01",
      label: "시술의 불편",
      title: "매일 반복되는 임플란트 시술에서",
      body: "더 편한 방법을 찾고 싶었습니다.",
    },
    {
      step: "02",
      label: "업무의 번거로움",
      title: "수기 장부와 정산 업무에서",
      body: "더 단순한 방식이 필요했습니다.",
    },
  ],
  philosophyHeadline: "시술의 불편은 제품으로.\n업무의 번거로움은 플랫폼으로.",
  philosophyBody: "실제로 사용하는 사람의 관점에서 문제를 정의하고 해결합니다.",
  casesHeadline: "현장의 고민이 실제 개발로 이어집니다.",
  cases: [
    {
      id: "product" as const,
      label: "제품 개발 사례",
      title: "시술 편의에서 출발한 제품",
      body: "진료실에서 느낀 불편을 기구·키트·어벗먼트 디자인으로 풀었습니다.",
    },
    {
      id: "platform" as const,
      label: "플랫폼 개발 사례",
      title: "의뢰·진행·정산을 한 흐름으로",
      body: "장부와 메신저로 흩어지던 업무를 같은 화면의 제작 워크스페이스로 모았습니다. 치과는 의뢰 캘린더와 기공소 채팅을 한곳에서 봅니다.",
    },
  ],
  identityEyebrow: "직접 사용하며 개선합니다",
  identityHeadline: "만드는 사람이,\n매일 사용하는 사람이기도 합니다.",
  identityBody:
    "어벗츠의 제품과 플랫폼은 개발자의 치과에서 매일 사용됩니다.\n직접 쓰고, 바로 고치고, 다시 현장에 적용합니다.",
  growthEyebrow: "함께 넓혀가는 경험",
  growthHeadline: "한 치과에서 시작한 경험이,\n동료 치과로 이어졌습니다.",
  growthBody:
    "현장에서 검증된 방식이 동료 치과의 긍정적인 반응으로 이어졌고,\n그 피드백이 다시 제품과 플랫폼을 다듬는 동력이 되었습니다.",
  ctaHeadline: "치과의사가 만들고,\n진료 현장에서 함께 다듬는 어벗츠.",
  ctaBody: "실제 경험을 바탕으로 더 편한 방법을 찾아갑니다.",
  ctaPlatform: "플랫폼 알아보기",
  ctaProduct: "제품 알아보기",
} as const;

/** 플랫폼 섹션 퀵 메뉴 (공개 랜딩) */
export const landingQuickMenus = [
  { id: "request", label: "제작 의뢰", href: "/signup" },
  { id: "progress", label: "진행 조회", href: "/login" },
  { id: "shipping", label: "배송 조회", href: "/login" },
  { id: "store", label: "제품 구매", href: "/signup" },
  { id: "orders", label: "주문 내역", href: "/login" },
  { id: "settlement", label: "정산 내역", href: "/login" },
] as const;

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
    title: "파일 등록",
    body: "스캔·디자인·의뢰 정보를 한곳에서 등록",
  },
  {
    step: "02",
    title: "제작 진행",
    body: "기공·CNC 스테이지가 같은 타임라인으로",
  },
  {
    step: "03",
    title: "완료 및 배송",
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
