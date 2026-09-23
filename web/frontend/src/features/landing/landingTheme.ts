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

/** `/` 히어로. 네 메뉴 카피는 `landingOffers.ts`. */
export const landingHome = {
  heroTitle: "심플웨이를 시작으로.",
  heroBody: "의뢰하고, 깎고, 기공합니다.",
  heroSupport: "플랫폼이 모두를 이어줍니다.",
  ctaStart: "시작하기",
  storiesHeading: "한 흐름으로.",
  storiesLead: "제품에서 의뢰, 가공, 기공까지.",
  ctaBandTitle: "지금 시작해 보세요.",
  ctaBandBody: [
    "회원가입 후 의뢰서를 열면 됩니다.",
    "심플웨이 제품은 스토어에서, 커스텀어벗과 기공은 같은 화면에서 이어집니다.",
  ],
} as const;

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
    title: "심플웨이로 하루를 엽니다.",
    line: "힐링을 심고, 스캔하면 보철이 이어집니다.",
    body: [
      "식립 뒤 치은을 짧게 잡고, 구강 스캔을 올리면 됩니다.",
      "심플어벗 규격을 고르면 같은 의뢰서에서 보철 기공으로 넘어갑니다.",
      "아침에 올린 케이스가 저녁에도 어디쯤인지, 화면만 보면 압니다.",
    ],
    image: {
      src: "/landing/simple-way-kits.jpg",
      alt: "심플웨이 시술 키트",
    },
    href: "/offer/simple-way",
  },
  {
    title: "전화 대신, 같은 화면.",
    line: "의뢰·작업시작·출고·정산이 한곳에 남습니다.",
    body: [
      "‘어디까지 됐지?’를 묻느라 자리를 비울 일이 줄어듭니다.",
      "치과와 기공소가 같은 의뢰서를 보고, 채팅도 그 옆에서 합니다.",
      "크레딧으로 결제하고, 쓴 만큼만 월말에 계산서가 나갑니다.",
    ],
    image: {
      src: "/landing/platform-board.jpg",
      alt: "플랫폼 의뢰 진행 화면",
    },
    href: "/offer/platform",
  },
  {
    title: "깎고, 이어서 기공합니다.",
    line: "디자인이 올라오면 CNC가 돌고, 보철이 이어집니다.",
    body: [
      "커스텀어벗은 건마다 같은 자동화 공정을 거쳐 기공소로 도착합니다.",
      "어벗츠 기공사업부가 그 위에 보철을 올리고, 치과로 한 번에 보냅니다.",
      "만드는 손이 달라도, 흐름은 끊기지 않습니다.",
    ],
    image: {
      src: "/landing/custom-abutment-product.jpg",
      alt: "커스텀 어벗 실물",
    },
    href: "/offer/custom-abutment",
  },
  {
    title: "모두가 이어집니다.",
    line: "치과, 기공소, 제조가 한 네트워크에.",
    body: [
      "심플웨이 제품부터 커스텀어벗, 보철 기공까지 같은 플랫폼 위에 있습니다.",
      "따로 쓰던 메신저와 엑셀을 줄이고, 진행과 돈이 같은 기록에 남습니다.",
      "환자를 위한 하루가, 조금 더 조용해지도록.",
    ],
    image: {
      src: "/landing/store-shelf.jpg",
      alt: "어벗츠 스토어 제품",
    },
    href: "/offer/lab",
  },
];
