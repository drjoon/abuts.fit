// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
// - web/frontend/src/shared/sales/platformPitchBlocks.tsx

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
    "심플웨이로 시작하는 정확한 임플란트 워크플로우 — 치과·기공소·제조사를 하나의 흐름으로",
  body: "식립부터 어벗 선택, 커스텀어벗 제작과 납품까지. 의뢰·디자인·생산·납품이 같은 플랫폼에서 이어집니다.",
  identity:
    "임플란트 수술·기공·생산을 연결하는 워크플로우 플랫폼. 심플웨이에서 커스텀어벗·기공 협업까지 한 흐름으로 이어집니다.",
  vision:
    "치과와 기공소가 각자의 전문성에 집중하면서도, 같은 케이스를 정확히 협업하는 통합 임플란트 워크플로우.",
  manufacturerNote: "커스텀 어벗먼트 CNC 제조는 (주)애크로덴트가 담당합니다.",
  pitch30s:
    "어벗츠.핏은 심플웨이로 시작해 식립·어벗 선택부터 커스텀어벗 제작·납품까지, 치과·기공소·애크로덴트 생산을 하나의 플랫폼으로 연결합니다.",
} as const;

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

/** 랜딩·오퍼 본문. 넓은 화면에서는 가운데로 모은다. */
export const landingContent = "mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-10";

/** 섹션 상하 여백 — 오퍼·홈 공통 */
export const landingSectionY = {
  band: "pt-16 pb-20 sm:pt-20 sm:pb-24",
  bandTight: "pt-12 pb-16 sm:pt-16 sm:pb-20",
  bandLoose: "pt-20 pb-24 sm:pt-24 sm:pb-28",
  storyGap: "gap-16 sm:gap-24",
  media: "h-[22rem] sm:h-[26rem] lg:h-[30rem]",
  sceneMin: "min-h-[56vh] sm:min-h-[62vh]",
} as const;

/**
 * `/` · `/offer/*` Waveon 타이포 SSOT.
 * 본문 15px대, h2 ~36–40px — LandingHome 과 동일.
 */
export const landingTypo = {
  eyebrow: "text-[11px] font-semibold tracking-[0.2em]",
  h1: "text-[1.875rem] font-bold leading-tight tracking-tight sm:text-[2.5rem] lg:text-[3.25rem]",
  h2: "break-keep text-[1.5rem] font-semibold leading-snug tracking-tight sm:text-[2rem] lg:text-[2.25rem]",
  h3: "break-keep text-lg font-semibold tracking-tight sm:text-xl",
  lead: "break-keep text-[14px] leading-6 text-slate-600 sm:text-[15px] sm:leading-6",
  body: "break-keep text-[14px] leading-6 text-slate-600 sm:text-[15px] sm:leading-[1.65]",
  link: "text-[14px] font-semibold sm:text-[15px]",
} as const;

/** `/` · `/offer/*` 하늘색·카드·히어로 워시 SSOT */
export const landingSky = {
  ink: "text-[#0b2a5c]",
  accent: "text-sky-600",
  accentStrong: "text-[#2563eb]",
  band: "bg-[#eef6ff]",
  card: "rounded-2xl border border-sky-100/80 bg-white shadow-[0_10px_32px_rgba(37,99,235,0.06)]",
  pill:
    "rounded-full bg-[#2563eb] text-white shadow-[0_8px_22px_rgba(37,99,235,0.25)] hover:bg-[#1d4ed8]",
  pillGhost:
    "rounded-full border border-sky-200 bg-white text-[#0b2a5c] hover:bg-sky-50",
  /** 히어로 오버레이 — Waveon과 동일한 짙은 블루 */
  heroWash:
    "bg-[linear-gradient(rgba(7,25,55,0.62),rgba(7,25,55,0.65))]",
} as const;

/**
 * 공개 히어로 하늘색 워시 — `LandingSkyWash` 와 동일 토큰.
 * 이벤트(`/events/*`)·랜딩(`/`) 헤더 뒤 배경 SSOT.
 */
export const landingSkyWashClass =
  "bg-[radial-gradient(ellipse_at_20%_0%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(ellipse_at_90%_10%,rgba(37,99,235,0.14),transparent_50%),linear-gradient(180deg,#f8fafc_0%,#eef4fb_55%,#ffffff_100%)]";

/** `/` 히어로. 메뉴는 심플웨이 · 기공서비스. 이벤트는 `#events`. */
export const landingHome = {
  heroEyebrow: "DENTAL IMPLANT WORKFLOW",
  heroTitle: ["어벗츠가 제공하는", "간단 명료한 워크플로우"],
  heroBody: "식립부터 어벗 선택, 기공 의뢰와 납품까지.",
  heroSupport: "치과·기공소·제조사를 하나의 흐름으로 연결합니다.",

  ctaStart: "시작하기",
  browseEyebrow: "ABUTS WORKFLOW",
  browseHeading: "식립부터 보철까지, 하나의 흐름으로.",
  browseLead:
    "심플웨이와 어벗츠 플랫폼이 임플란트 수술·기공·생산의 단계를 더 명확하게 연결합니다.",
  whyEyebrow: "WHY ABUTS.FIT",
  whyHeading: "케이스의 모든 단계를 연결합니다.",
  whyLead:
    "치과의 의뢰, 기공소의 디자인, 애크로덴트의 생산과 납품까지 하나의 플랫폼 안에서 이어집니다.",
  workflowEyebrow: "ONE CONNECTED WORKFLOW",
  workflowHeading: "더 명확하게, 더 빠르게, 더 안정적으로.",
  workflowLead:
    "어벗츠 플랫폼은 치과와 기공소가 각자의 전문성에 집중하면서도 같은 케이스를 정확히 협업할 수 있도록 설계되었습니다.",
  stepsEyebrow: "HOW IT WORKS",
  stepsHeading: "커스텀어벗은 이렇게 완성됩니다.",
  stepsLead:
    "치과의 스캔 데이터부터 기공 디자인, 생산과 납품까지 케이스에 필요한 과정을 연결합니다.",
  storiesHeading: "수술부터 납품까지, 끊기지 않게.",
  storiesLead:
    "심플웨이로 준비하고, 플랫폼에서 의뢰·디자인·생산을 이어갑니다.",
  faqEyebrow: "FAQ",
  faqHeading: "자주 묻는 질문",
  eventsHeading: "진행 중인 행사",
  ctaBandTitle: "통합된 임플란트 워크플로우를 시작하세요.",
  ctaBandBody: [
    "심플웨이 도입부터 치과·기공소 협업, 커스텀어벗 기공서비스까지 필요한 방향을 함께 안내해 드립니다.",
  ],
  ctaConsult: "상담 신청하기",
  /** 히어로 CTA — 가입이 아니라 다음 섹션으로 스크롤 (하단 `#contact`에서 가입) */
  ctaHero: "더 알아보기",
} as const;

/** `/` 비즈니스 탭 (Waveon business) */
export const landingHomeBusinessTabs = [
  {
    id: "simple-way" as const,
    label: "심플웨이",
    eyebrow: "SIMPLEWAY",
    title: "직관적인 수술과 보철",
    body: [
      "심플웨이 시스템 기반으로 이상적인 위치에 임플란트를 식립하고, 케이스에 맞는 어벗을 선택해 보철 단계를 편하게 준비합니다.",
    ],
    cta: "심플웨이 자세히 보기",
    href: "/offer/simple-way",
    image: { src: "/landing/waveon/workflow.jpg", alt: "심플웨이 어벗·보철" },
  },
  {
    id: "custom" as const,
    label: "커스텀어벗 및 어벗츠기공",
    eyebrow: "LAB SERVICE",
    title: "구강스캔 데이터를 빠르고 정확하게 전달",
    body: [
      "기성 어벗 뿐만 아니라 커스텀 어벗도 자유롭게 선택하실 수 있습니다.",
      "구강스캔 데이터와 의뢰 내용을 어벗츠 플랫폼으로 전달해 기공서비스를 바로 시작할 수 있습니다.",
    ],
    cta: "기공서비스 자세히 보기",
    href: "/offer/lab",
    image: { src: "/landing/waveon/hero.jpg", alt: "커스텀어벗 검수" },
  },
  {
    id: "lab" as const,
    label: "기공소 협업",
    eyebrow: "LAB PARTNERSHIP",
    title: "기존 기공소와도 함께",
    body: [
      "거래하시던 기공소를 소개해주세요.",
      "플랫폼 가입시 어벗츠 기공서비스와 동일한 통합 서비스를 제공받으실 수 있습니다.",
    ],
    cta: "플랫폼 도입 상담",
    href: "/contact",
    image: {
      src: "/landing/waveon/partnership.jpg",
      alt: "치과·기공소 협업",
    },
  },
] as const;

/** `/` 비즈니스 하단 이슈 3점 */
export const landingHomePainPoints = [
  {
    step: "01",
    title: "수술과 보철 사이의 복잡한 판단",
    body: "심플웨이는 임플란트 식립과 어벗 선택을 직관적으로 연결해 다음 단계를 편하게 준비하도록 돕습니다.",
  },
  {
    step: "02",
    title: "흩어진 데이터와 의뢰 내용",
    body: "스캔 데이터, 요청 사항, 케이스 정보가 분산되면 제작에 필요한 확인이 반복될 수 있습니다.",
  },
  {
    step: "03",
    title: "분리된 기공·생산 과정",
    body: "디자인 완료 후 제조까지 하나의 흐름으로 이어져야 납기와 품질을 안정적으로 관리할 수 있습니다.",
  },
] as const;

/** `/` WHY 밴드 — 문장 단위 body → UI에서 `<br />`(마침표 경계만). */
export const landingHomeWhy = [
  {
    eyebrow: "SCAN TO REQUEST",
    title: "구강스캔에서 의뢰까지",
    body: [
      "치과가 스캔 데이터와 요청 내용을 플랫폼으로 전달하면, 기공소는 필요한 정보를 한눈에 확인합니다.",
    ],
  },
  {
    eyebrow: "DESIGN TO PRODUCTION",
    title: "디자인에서 생산까지",
    body: [
      "커스텀어벗 디자인이 등록되면 애크로덴트 통합 생산 시스템으로 실시간 연결되어 가공과 생산이 이어집니다.",
    ],
  },
  {
    eyebrow: "CONNECTED PARTNERS",
    title: "기존 기공소와도 함께",
    body: [
      "거래하시던 기공소를 소개해주세요.",
      "플랫폼 가입시 어벗츠 기공서비스와 동일한 통합 서비스를 제공받으실 수 있습니다.",
    ],
  },
] as const;

/** `/` 워크플로우 3단계 */
export const landingHomeWorkflow = [
  {
    step: "01",
    title: "직관적인 수술 준비",
    body: "심플웨이를 통해 이상적인 식립 위치와 어벗 선택을 간결한 흐름으로 준비합니다.",
  },
  {
    step: "02",
    title: "정확한 기공 협업",
    body: "의뢰 내용과 이슈를 케이스 단위로 공유해 필요한 소통과 문제 해결을 이어갑니다.",
  },
  {
    step: "03",
    title: "통합된 생산과 납품",
    body: "디자인 등록 후 통합 생산 시스템에서 실시간 가공하여 고품질 결과물을 납품합니다.",
  },
] as const;

/** `/` HOW IT WORKS 4단계 */
export const landingHomeSteps = [
  {
    title: "구강스캔·의뢰 등록",
    body: "치과가 스캔 데이터와 케이스별 요청 사항을 어벗츠 플랫폼으로 빠르게 전달합니다.",
  },
  {
    title: "기공소 작업·소통",
    body: "기공소가 의뢰 내용을 확인하고, 이슈가 있으면 해당 케이스 안에서 치과와 소통합니다.",
  },
  {
    title: "커스텀어벗",
    body: "기공소가 커스텀 어벗 디자인을 플랫폼에 등록하면, 통합 시스템이 실시간 가공하여 납품합니다.",
  },
  {
    title: "기공소 생산·납품",
    body: "커스텀어벗과 기공물은 기공소의 최종 검수를 거쳐 최상의 상태로 납품합니다.",
  },
] as const;

/** `/` FAQ */
export const landingHomeFaq = [
  {
    q: "심플웨이는 무엇인가요?",
    a: "심플웨이는 임플란트 수술에서 사용하는 툴과 재료입니다. 직관적인 제품 구성으로 이상적인 식립 위치를 준비하고, 케이스에 맞는 어벗 선택과 보철 진행을 편하게 돕습니다.",
  },
  {
    q: "기성 어벗과 커스텀어벗은 어떻게 선택하나요?",
    a: "기성 어벗으로 진행할 수 있는 케이스도 있으며, 환자별 조건에 따라 커스텀어벗이 필요한 경우에는 어벗츠 플랫폼을 통한 기공서비스를 이용할 수 있습니다.",
  },
  {
    q: "치과는 스캔 데이터를 어떻게 전달하나요?",
    a: "구강스캔 데이터와 의뢰 내용을 어벗츠 플랫폼에서 케이스별로 전달합니다. 기공소는 요청 사항을 정확히 파악하고, 필요한 경우 해당 의뢰 건에서 치과와 소통할 수 있습니다.",
  },
  {
    q: "기존에 거래하던 기공소도 이용할 수 있나요?",
    a: "네. 거래하시던 기공소를 소개해주세요. 플랫폼 가입시 어벗츠 기공서비스와 동일한 통합 서비스를 제공받으실 수 있습니다.",
  },
  {
    q: "제조와 납품은 어떻게 진행되나요?",
    a: "기공소가 커스텀어벗 디자인을 플랫폼에 등록하면 통합 구축된 애크로덴트 생산 시스템에서 실시간 가공과 생산이 진행되어 납품됩니다.",
  },
] as const;

/** `/` 히어로·타일 아래 스토리. 문장 단위 body → UI에서 `<br />`. */
export type LandingHomeStory = {
  title: string;
  line: string;
  body: string[];
  image: { src: string; alt: string };
  href?: string;
};

export const landingHomeStories: LandingHomeStory[] = [
  {
    title: "직관적인 수술과 보철",
    line: "심플웨이 툴과 재료로 식립과 어벗 선택을 이어갑니다.",
    body: [
      "심플웨이 시스템 기반으로 이상적인 위치에 임플란트를 식립하고, 케이스에 맞는 어벗을 선택해 보철 단계를 편하게 준비합니다.",
      "수술과 보철 사이의 복잡한 판단을 더 직관적인 흐름으로 줄입니다.",
    ],
    image: {
      src: "/landing/waveon/workflow.jpg",
      alt: "임플란트 어벗·보철 구성",
    },
    href: "/offer/simple-way",
  },
  {
    title: "흩어진 데이터와 의뢰를 한곳으로",
    line: "스캔·요청·케이스 정보가 같은 화면에서 이어집니다.",
    body: [
      "스캔 데이터, 요청 사항, 케이스 정보가 분산되면 제작에 필요한 확인이 반복될 수 있습니다.",
      "치과가 스캔과 요청을 플랫폼으로 전달하면, 기공소는 필요한 정보를 한눈에 확인합니다.",
      "이슈가 있으면 해당 케이스 안에서 소통과 문제 해결을 이어갑니다.",
    ],
    image: {
      src: "/landing/waveon/partnership.jpg",
      alt: "치과·기공소 디지털 협업",
    },
    href: "/offer/lab",
  },
  {
    title: "디자인에서 생산·납품까지",
    line: "기공과 애크로덴트 생산이 하나의 흐름으로 이어집니다.",
    body: [
      "디자인 완료 후 제조까지 하나의 흐름으로 이어져야 납기와 품질을 안정적으로 관리할 수 있습니다.",
      "커스텀어벗 디자인이 등록되면 애크로덴트 통합 생산 시스템으로 실시간 연결되어 가공이 이어집니다.",
      "거래하시던 기공소를 소개해주세요.",
      "플랫폼 가입시 어벗츠 기공서비스와 동일한 통합 서비스를 제공받으실 수 있습니다.",
    ],
    image: {
      src: "/landing/waveon/hero.jpg",
      alt: "커스텀 어벗 검수·생산",
    },
    href: "/offer/lab",
  },
];
