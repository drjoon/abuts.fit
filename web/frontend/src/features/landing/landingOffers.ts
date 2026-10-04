// change-log:
// - 2026-10-04: 메뉴 심플웨이 → 플랫폼(`/offer/platform`). 장점·실제 UI 캡처는 `platformOfferContent.ts`.
// - 2026-09-30: 기공서비스 스토리 카피 「3D 스캔」→「구강 스캔」.
// - 2026-09-29: 기공서비스(lab) 오퍼를 AI 디자인 · 하나의 크레딧 · 플랫폼 · 커스텀어벗 연동 중심으로 재구성.
// related files:
// - web/frontend/src/features/landing/labOfferContent.ts
// - web/frontend/src/features/landing/platformOfferContent.ts
// - web/frontend/src/features/landing/LabOfferSections.tsx
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
//
// 메뉴: 플랫폼 · 어벗츠기공소. 이벤트는 랜딩 `#events`.
// `/` 카피 SSOT: landingTheme
// 정가(판매가·배송비)는 스토어 SSOT: storeCatalog.ts
import {
  LANDING_PLATFORM_BOARD,
  LANDING_WAVEON_PARTNERSHIP,
} from "./landingAssets";
import { LAB_OFFER_EXTRAS, type LabOfferExtras } from "./labOfferContent";
import {
  PLATFORM_OFFER_EXTRAS,
  type PlatformOfferExtras,
} from "./platformOfferContent";

export type OfferVisual =
  | { kind: "blank"; caption: string }
  | { kind: "photo"; src: string; alt: string }
  | {
      kind: "pair";
      items: Array<{ src: string; alt: string; caption: string }>;
    }
  | { kind: "workspace" }
  | {
      kind: "slideshow";
      shots: Array<{ src: string; alt: string }>;
    };

export type OfferIcon =
  | "request"
  | "start"
  | "pay"
  | "ship"
  | "store"
  | "scan"
  | "healing"
  | "abutment"
  | "kit"
  | "crown"
  | "cnc"
  | "lab"
  | "quality"
  | "box";

export type OfferHighlight = {
  icon: OfferIcon;
  label: string;
  line: string;
};

export type OfferBuy =
  | { kind: "start"; label: string }
  | { kind: "store"; label: string; productId: string };

export type OfferProductCard = {
  name: string;
  line: string;
  price: string;
  priceNote: string;
  specs: [string, string, string];
  buy: OfferBuy;
  visual: OfferVisual;
};

export type OfferScene = {
  title: string;
  line: string;
  visual: OfferVisual;
};

/** 히어로 직후 3카드 요약. */
export type OfferGlance = {
  title: string;
  /** 문장 단위 → UI에서 `<br />`. */
  lead: string[];
  items: Array<{ label: string; title: string; body: string | string[] }>;
  /** sm 이상 카드 가로 비율. 없으면 균등. */
  columns?: "3-7";
  summary?: string;
};

/** 용어 한 줄 정리. */
export type OfferGlossary = {
  title: string;
  lead: string;
  items: Array<{ term: string; line: string }>;
};

/** 가격 없는 설명. body는 문장 단위 → UI에서 `<br />`. */
export type OfferStory = {
  name: string;
  line: string;
  body: string[];
  /** 스펙·체크리스트가 필요할 때만. */
  points?: string[];
  visual?: OfferVisual;
  /** full = 이미지 풀폭 위 + 카피 아래 (개념 다이어그램). */
  layout?: "split" | "full";
};

/** 직경 색 동그라미. label이 점 안 숫자. */
export type SpecSwatch = {
  label: string;
  name: string;
  color: string;
  ink: string;
};

export type SpecLine =
  | string
  | { lead?: string; swatches: SpecSwatch[] };

export type OfferFlowChart = {
  name: string;
  line?: string;
  body: string[];
  /** 위에서 아래(10→6). 기본은 defaultRowId만 노출. */
  rows: Array<{ id: string; src: string; alt: string }>;
  defaultRowId: string;
};

export type LandingOffer = {
  slug: string;
  navLabel: string;
  /** 홈 타일. 오퍼 히어로는 heroTitle. */
  punch: string;
  /** 히어로 eyebrow — 없으면 navLabel 대문자화 */
  heroEyebrow?: string;
  heroTitle: string;
  /** 타이틀 바로 아래 한 줄 (선택) */
  heroLead?: string;
  /** 히어로 본문. 문장 단위 → UI에서 `<br />`. 없으면 line 한 줄. */
  heroBody?: string[];
  line: string;
  lead: string;
  /** video=유튜브/키트 영상 · photo=풀블리드 스틸 · tile=텍스트+미디어 · brand=전용 히어로 */
  hero: "video" | "photo" | "tile" | "brand";
  /** YouTube 히어로(짧은 루프). hero==="video" 일 때. */
  youtube?: {
    id: string;
    startSec?: number;
    endSec?: number;
    /** 여러 구간을 순서대로 순환. 있으면 start/end 보다 우선. */
    segments?: Array<{ startSec: number; endSec: number }>;
    poster?: string;
    /** 1이면 원본 속도. */
    playbackRate?: number;
  };
  tile: OfferVisual;
  /** 오퍼 히어로. 없으면 tile. 홈 타일과 겹치지 않을 때. */
  pageVisual?: OfferVisual;
  /** 히어로 스틸 오른쪽 짝. pageVisual 과 한 화면에 둔다. */
  heroCompanion?: OfferVisual;
  /** 히어로 아래 시작 버튼. 상품 카드가 있으면 쓰지 않는다. */
  cta?: OfferBuy;
  /** 히어로 직후 카탈로그 안내(구성). */
  guides?: OfferStory[];
  /** Flow Chart — 기본 1라인, 클릭 시 전체. */
  flowChart?: OfferFlowChart;
  /** 히어로 직후 한눈에 보기. */
  glance?: OfferGlance;
  highlights?: OfferHighlight[];
  scene?: OfferScene;
  /** 정가·배송·구매. */
  products?: [OfferProductCard, OfferProductCard];
  stories?: OfferStory[];
  /** 소개 영상. 무음 루프. */
  kitsClip?: {
    eyebrow: string;
    heading: string;
    id: string;
    startSec: number;
    /** 영상 타임라인 끝(초). 2:11 = 131. */
    endSec: number;
    playbackRate: number;
  };
  /** value가 배열이면 문장·항목 단위로 줄을 나눈다. swatches·줄 안 swatches는 숫자 동그라미. note는 문장 단위. */
  specs?: Array<{
    label: string;
    value: string | SpecLine[];
    swatches?: SpecSwatch[];
    note?: string[];
  }>;
  glossary?: OfferGlossary;
  /** 어벗츠기공소 전용 섹션. `hero: "brand"` 와 함께 쓴다. */
  lab?: LabOfferExtras;
  /** 플랫폼 전용 섹션. `hero: "brand"` 와 함께 쓴다. */
  platform?: PlatformOfferExtras;
  faq?: Array<{ q: string; a: string | string[] }>;
};

/** 레거시 slug → 현재 메뉴 오퍼 */
export const LEGACY_OFFER_REDIRECTS: Record<string, string> = {
  "simple-way": "platform",
  "custom-abutment": "lab",
};

const WAVEON_PARTNERSHIP_TILE: OfferVisual = {
  kind: "photo",
  src: LANDING_WAVEON_PARTNERSHIP,
  alt: "치과·기공소 디지털 협업",
};

const PLATFORM_BOARD_TILE: OfferVisual = {
  kind: "photo",
  src: LANDING_PLATFORM_BOARD,
  alt: "어벗츠 플랫폼 보드",
};

export const landingOffers: LandingOffer[] = [
  {
    slug: "platform",
    navLabel: "플랫폼",
    punch: "의뢰·스캔·채팅이 한 화면으로",
    heroEyebrow: "ABUTS PLATFORM",
    heroTitle: "치과와 기공소를 한 화면에서 잇습니다",
    heroBody: PLATFORM_OFFER_EXTRAS.hero.body,
    line: "진행을 묻지 않아도, 지금 어디인지 보입니다.",
    lead: "같은 케이스를, 같은 화면에서.",
    hero: "brand",
    tile: PLATFORM_BOARD_TILE,
    cta: { kind: "start", label: "시작하기" },
    platform: PLATFORM_OFFER_EXTRAS,
    glossary: PLATFORM_OFFER_EXTRAS.glossary,
  },
  {
    slug: "lab",
    navLabel: "어벗츠기공소",
    punch: "AI 디자인부터 커스텀어벗 납품까지",
    heroEyebrow: "ABUTS LAB",
    heroTitle: "AI 디자인부터 커스텀어벗 납품까지",
    heroBody: LAB_OFFER_EXTRAS.hero.body,
    line: "의뢰 한 번으로 디자인·생산·배송·결제까지 이어집니다.",
    lead: "스캔을 올리면, 보철과 맞춤 어벗까지 한 번에.",
    hero: "brand",
    tile: WAVEON_PARTNERSHIP_TILE,
    cta: { kind: "start", label: "의뢰하기" },
    lab: LAB_OFFER_EXTRAS,
    glossary: {
      title: "헷갈리는 용어, 한 줄로 정리.",
      lead: "기공 의뢰에서 자주 나오는 용어만 짧게 풀어 두었습니다.",
      items: [
        {
          term: "AI 디자인",
          line: "의뢰서 값으로 정렬·삽입축·마진·스캔바디를 자동으로 잡는 디자인 도구예요.",
        },
        {
          term: "커스텀어벗",
          line: "CAD로 디자인해 CNC로 깎는 환자 맞춤 어벗이에요.",
        },
        {
          term: "어벗츠기공소",
          line: "어벗츠가 운영하는 기공소예요. 치과는 협력 기공소 대신 이곳에도 의뢰할 수 있어요.",
        },
        {
          term: "크레딧(거래 선수금)",
          line: "기공·커스텀어벗·스토어를 함께 결제하는 예치금이에요. 선불페이가 아니에요.",
        },
        {
          term: "협력 기공소",
          line: "치과가 거래하던 기공소예요. 지정하면 그 기공소의 수가로 진행돼요.",
        },
        {
          term: "애크로덴트",
          line: "어벗츠 제품을 만드는 제조사예요.",
        },
      ],
    },
  },
];

export function getLandingOffer(slug: string | undefined) {
  return landingOffers.find((offer) => offer.slug === slug);
}

export function offerPath(slug: string) {
  return `/offer/${slug}`;
}
