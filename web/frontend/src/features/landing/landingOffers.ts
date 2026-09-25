// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
//
  // 메뉴: 심플웨이 · 기공서비스. 이벤트는 랜딩 `#events`. 플랫폼·커스텀어벗은 두 오퍼에 섞어 넣는다.
  // `/` 카피 SSOT: landingTheme (Waveon 워크플로우 메시지 · 기존 섹션 디자인 유지)
  // 정가(판매가·배송비)는 심플웨이 제품 + 커스텀어벗(런칭/정상). 스토어 SSOT: storeCatalog.ts
  // · STORE_SHIPPING_FEE_INCLUSIVE 3,500 · 10만원↑무료. 기공서비스 본문은 금액을 적지 않는다.
import {
  LANDING_CAD_PREVIEW,
  LANDING_CASE_ABUTMENT,
  LANDING_CUSTOM_ABUTMENT,
  LANDING_CUSTOM_TRACKING,
  LANDING_PLATFORM_BOARD,
  LANDING_PLATFORM_LEDGER,
  LANDING_PLATFORM_REQUEST,
  LANDING_PLATFORM_STATS,
  LANDING_SW_CATALOG_ASSEMBLY,
  LANDING_SW_CUSTOM_ASSEMBLY,
  LANDING_SW_FLOW_DEFAULT_ROW_ID,
  LANDING_SW_FLOW_ROWS,
  LANDING_WAVEON_PARTNERSHIP,
  LANDING_WAVEON_WORKFLOW,
} from "./landingAssets";

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

/** 히어로 직후 3카드 요약 (기공서비스 AT A GLANCE). */
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

const DIAMETER_DOT = {
  "6": { name: "6 노랑", color: "#E0C850", ink: "#3d3410" },
  "7": { name: "7 초록", color: "#4EAE82", ink: "#083528" },
  "8": { name: "8 보라", color: "#7A3488", ink: "#ffffff" },
  "9": { name: "9 파랑", color: "#3E92C4", ink: "#ffffff" },
  "10": { name: "10 하늘", color: "#6AADC0", ink: "#0b2a5c" },
} as const;

function diameterDot(id: keyof typeof DIAMETER_DOT, label = id): SpecSwatch {
  const dot = DIAMETER_DOT[id];
  const colorName = dot.name.replace(/^\S+\s/, "");
  return { label, color: dot.color, ink: dot.ink, name: `${label} ${colorName}` };
}

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
  /** video=유튜브/키트 영상 · photo=풀블리드 스틸 · tile=텍스트+미디어 */
  hero: "video" | "photo" | "tile";
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
  /** 심플웨이 Flow Chart — 기본 1라인, 클릭 시 전체. */
  flowChart?: OfferFlowChart;
  /** 히어로 직후 한눈에 보기 (기공서비스). */
  glance?: OfferGlance;
  highlights?: OfferHighlight[];
  scene?: OfferScene;
  /** 정가·배송·구매. 심플웨이만. */
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
  faq?: Array<{ q: string; a: string | string[] }>;
};

/** 레거시 `/offer/platform` · `/offer/custom-abutment` → 새 메뉴 오퍼 */
export const LEGACY_OFFER_REDIRECTS: Record<string, string> = {
  platform: "simple-way",
  "custom-abutment": "lab",
};

const ABUTMENT_VISUAL: OfferVisual = {
  kind: "photo",
  src: LANDING_CASE_ABUTMENT,
  alt: "심플어벗",
};

const HERO_ASSEMBLY: OfferVisual = {
  kind: "photo",
  src: LANDING_SW_CATALOG_ASSEMBLY,
  alt: "픽스처·어벗츠 심플어벗·보철 조립도",
};

const HERO_CUSTOM_ASSEMBLY: OfferVisual = {
  kind: "photo",
  src: LANDING_SW_CUSTOM_ASSEMBLY,
  alt: "픽스처·어벗츠 커스텀어벗·보철 조립도",
};

const WAVEON_WORKFLOW_TILE: OfferVisual = {
  kind: "photo",
  src: LANDING_WAVEON_WORKFLOW,
  alt: "임플란트 어벗·보철 구성",
};

const WAVEON_PARTNERSHIP_TILE: OfferVisual = {
  kind: "photo",
  src: LANDING_WAVEON_PARTNERSHIP,
  alt: "치과·기공소 디지털 협업",
};

export const landingOffers: LandingOffer[] = [
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "직관적인 수술과 보철",
    heroEyebrow: "SIMPLEWAY",
    heroTitle: "직관적인 수술과 보철",
    heroBody: [
      "심플웨이로 원하는 자리에 픽스쳐를 심고,",
      "어벗츠 어벗과 어벗츠 보철이 편안하게 올라갑니다.",
    ],
    line: "식립 위치와 어벗 선택을 간결한 흐름으로.",
    lead: "식립부터 보철까지, 하나의 흐름으로.",
    hero: "photo",
    tile: WAVEON_WORKFLOW_TILE,
    pageVisual: HERO_ASSEMBLY,
    heroCompanion: HERO_CUSTOM_ASSEMBLY,
    glance: {
      title: "심플웨이, 딱 두 가지만 기억하세요.",
      lead: [],
      columns: "3-7",
      items: [
        {
          label: "무엇인가",
          title: "탑다운 컨셉을 심플하게 구현",
          body: "임플란트를 보철의 중점에 심고, 대합치와의 거리를 확인해서 수술 단계에서 이미 보철을 프로비전합니다.",
        },
        {
          label: "어떻게",
          title: "수술 → 힐링 → 보철, 세 단계",
          body: [
            "1. 서지컬펜으로 심고, 서지컬핀으로 대합치 간격을 확인, 본쉐이퍼로 치조골 간섭을 제거합니다.",
            "2. 그립·스캔 가능한 심플 힐링으로 골유착 기다린 뒤, 파우더 없이 구강스캔합니다.",
            "3. 어벗츠 플랫폼으로 심플하게 보철 제작합니다.",
          ],
        },
      ],
    },
    flowChart: {
      name: "Flow Chart.",
      body: [
        "시작은 근원심 크기 서지컬펜 드릴링",
      ],
      rows: LANDING_SW_FLOW_ROWS.map((row) => ({ ...row })),
      defaultRowId: LANDING_SW_FLOW_DEFAULT_ROW_ID,
    },
    kitsClip: {
      eyebrow: "SIMPLEWAY PROTOCOL",
      heading: "임플란트 수술 예시",
      id: "WYNPxDo-DP0",
      startSec: 92,
      endSec: 131,
      playbackRate: 2,
    },
    specs: [
      {
        label: "직경 색",
        value: "",
        swatches: [
          diameterDot("6"),
          diameterDot("7"),
          diameterDot("8"),
          diameterDot("9"),
          diameterDot("10"),
        ],
        note: [
          "위 숫자는 제품의 실직경이 아니라",
          "최종 보철의 근원심경을 의미합니다.",
        ],
      },
      {
        label: "심플 힐링, 어벗",
        value: [
          {
            lead: "직경",
            swatches: [
              diameterDot("6"),
              diameterDot("7", "7·8"),
              diameterDot("9", "9·10"),
            ],
          },
          "높이 XS·S·M·L·XL",
          "회전방지 Hex·Non-Hex",
        ],
      },
      { label: "키트", value: "Surgical · Prosthetics" },
      { label: "제조", value: "(주)애크로덴트" },
    ],
    faq: [
      {
        q: "심플웨이는 무엇인가요?",
        a: [
          "탑다운 컨셉을 심플하게 구현합니다.",
          "임플란트를 보철의 중점에 심고, 대합치와의 거리를 확인해 수술 단계에서 보철을 프로비전합니다.",
        ],
      },
      {
        q: "시술은 어디서 시작하나요?",
        a: [
          "시작은 근원심 크기 서지컬펜 드릴링입니다.",
          "이후 힐링을 거쳐 어벗츠 플랫폼으로 보철을 만듭니다.",
        ],
      },
      {
        q: "색은 무엇을 뜻하나요?",
        a: [
          "직경입니다.",
          "6은 노랑, 7은 초록, 8은 보라, 9는 파랑, 10은 하늘입니다.",
        ],
      },
      {
        q: "심플 힐링과 어벗은 어떻게 고르나요?",
        a: [
          "직경은 6, 7·8, 9·10입니다.",
          "높이는 XS·S·M·L·XL이고, 회전방지는 Hex·Non-Hex입니다.",
        ],
      },
      {
        q: "키트는 무엇인가요?",
        a: [
          "Surgical과 Prosthetics입니다.",
          "Surgical로 식립하고, Prosthetics로 힐링과 어벗을 체결합니다.",
        ],
      },
      {
        q: "커스텀어벗은 언제 쓰나요?",
        a: [
          "규격 어벗으로 맞추기 어려울 때입니다.",
          "같은 화면에서 커스텀어벗으로 넘길 수 있습니다.",
        ],
      },
      {
        q: "어벗츠 플랫폼은 무엇인가요?",
        a: [
          "치과와 기공소가 온라인으로 기공을 의뢰합니다.",
          "심플어벗과 커스텀어벗 보철이 같은 흐름으로 이어집니다.",
        ],
      },
    ],
  },
  {
    slug: "lab",
    navLabel: "기공서비스",
    punch: "디자인에서 생산까지",
    heroEyebrow: "LAB SERVICE",
    heroTitle: "디자인에서 생산까지",
    heroBody: [
      "의뢰·기공 협업·애크로덴트 납품을 한 흐름으로.",
      "스캔부터 커스텀어벗 생산까지 같은 플랫폼에서 이어집니다.",
    ],
    line: "의뢰부터 배송까지 어벗츠가 한 흐름으로 처리합니다.",
    lead: "스캔을 올리면, 보철과 맞춤 어벗까지 한 번에.",
    hero: "tile",
    tile: WAVEON_PARTNERSHIP_TILE,
    pageVisual: {
      kind: "slideshow",
      shots: [
        { src: LANDING_WAVEON_PARTNERSHIP, alt: "치과·기공소 디지털 협업" },
        { src: LANDING_CUSTOM_ABUTMENT, alt: "커스텀 어벗 실물" },
        { src: LANDING_CAD_PREVIEW, alt: "커스텀 어벗 CAD" },
        { src: LANDING_PLATFORM_STATS, alt: "정산 통계" },
      ],
    },
    cta: { kind: "start", label: "의뢰하기" },
    glance: {
      title: "기공서비스, 이 흐름만 알면 됩니다.",
      lead: [
        "스캔만 올리면 디자인·가공·배송까지 어벗츠가 처리합니다.",
        "핵심만 짧게 정리했습니다.",
      ],
      items: [
        {
          label: "무엇인가",
          title: "스캔만 올리면 보철·맞춤 어벗까지",
          body: "디자인, 맞춤 어벗 가공, 크라운·브리지 제작, 배송을 어벗츠가 온라인으로 한 번에 처리하는 기공 서비스입니다.",
        },
        {
          label: "어떻게",
          title: "의뢰 → 제작 → 배송, 화면에서",
          body: "치과가 온라인으로 의뢰하면 어벗츠 기공실이 제작하고, 맞춤 어벗과 보철을 함께 치과로 보냅니다.",
        },
        {
          label: "기대효과",
          title: "전화·메일 없이 상태를 한눈에",
          body: "진행 상황과 도착일이 화면에 남고, 결제는 실제로 사용한 만큼 매월 말에 정산됩니다.",
        },
      ],
      summary: "한 줄 요약 — 스캔만 올리면 디자인·가공·배송까지 한 번에",
    },
    highlights: [
      { icon: "request", label: "플랫폼", line: "치과가 온라인으로 의뢰합니다." },
      { icon: "lab", label: "기공실", line: "어벗츠가 직접 운영합니다." },
      { icon: "crown", label: "보철", line: "크라운과 브리지를 만듭니다." },
      { icon: "cnc", label: "맞춤 어벗", line: "환자 맞춤으로 깎아 보냅니다." },
      { icon: "start", label: "작업시작", line: "기공실이 받으면 시작합니다." },
      { icon: "ship", label: "배송", line: "치과까지 무료로 보냅니다." },
    ],
    scene: {
      title: "디자인이 곧 가공.",
      line: "올리는 순간 CNC 가공이 시작됩니다.",
      visual: {
        kind: "photo",
        src: LANDING_CUSTOM_ABUTMENT,
        alt: "커스텀 어벗 실물",
      },
    },
    stories: [
      {
        name: "어벗츠 플랫폼.",
        line: "치과 · 기공소.",
        body: [
          "치과와 기공소가 온라인으로 보철을 의뢰하고 진행 상황을 함께 봅니다.",
          "커스텀어벗 제작도 같은 화면에서 이어집니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_BOARD,
          alt: "어벗츠 플랫폼",
        },
      },
      {
        name: "심플어벗 위에 보철을.",
        line: "고른 규격이 그대로 이어집니다.",
        body: [
          "잇몸을 스캔하고 어벗 규격을 고르면, 보철이 같은 의뢰로 넘어옵니다.",
          "어벗츠 기공실이 크라운·브리지를 직접 만듭니다.",
        ],
        visual: ABUTMENT_VISUAL,
      },
      {
        name: "맞춤 어벗이 도착하면.",
        line: "보철과 함께 치과로.",
        body: [
          "맞춤 어벗이 기공실에 도착하면 그 위에 보철을 이어 만듭니다.",
          "따로 챙겨 보낼 필요 없이 치과로 한 번에 나갑니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "맞춤 어벗이 도착하면.",
        },
      },
      {
        name: "손으로 맞추는 대신, 시스템으로.",
        line: "누가 해도 비슷한 결과.",
        body: [
          "스캔과 디자인이 올라오면 가공이 바로 시작됩니다.",
          "같은 기준으로 깎기 때문에 결과가 매번 비슷하고, 진행 상황도 화면에서 따라갈 수 있습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CUSTOM_TRACKING,
          alt: "손으로 맞추는 대신, 시스템으로.",
        },
      },
      {
        name: "‘어디까지 됐지?’를 묻지 않아도.",
        line: "상태와 대화가 한곳에.",
        body: [
          "접수부터 디자인, 출고까지 같은 화면에 남습니다.",
          "도착일이 보이고, 문의는 그 의뢰서 옆에서 바로 합니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_REQUEST,
          alt: "‘어디까지 됐지?’를 묻지 않아도.",
        },
      },
      {
        name: "쓴 만큼, 월말에.",
        line: "실제 사용량으로 정산합니다.",
        body: [
          "미리 충전하는 방식이 아닙니다.",
          "실제로 쓴 만큼만 매월 말에 정산됩니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_LEDGER,
          alt: "쓴 만큼, 월말에.",
        },
      },
    ],
    glossary: {
      title: "헷갈리는 용어, 한 줄로 정리.",
      lead: "기공 의뢰에서 자주 나오는 용어만 짧게 풀어 두었습니다.",
      items: [
        {
          term: "어벗츠 플랫폼",
          line: "치과와 기공소가 온라인으로 의뢰·소통하는 공간이에요.",
        },
        {
          term: "커스텀어벗",
          line: "CAD로 디자인해 CNC로 깎는 환자 맞춤 어벗이에요.",
        },
        {
          term: "어벗츠 기공실",
          line: "어벗츠가 직접 운영하는 기공소예요.",
        },
        {
          term: "크레딧 정산",
          line: "충전이 아니라 쓴 만큼 매월 정산되는 방식이에요.",
        },
        {
          term: "애크로덴트",
          line: "어벗츠 제품을 만드는 제조사예요.",
        },
        {
          term: "심플어벗",
          line: "심플웨이에서 쓰는 규격 어벗이에요.",
        },
      ],
    },
    faq: [
      {
        q: "기공서비스는 한마디로 뭔가요?",
        a: "스캔만 올리면 디자인·맞춤 어벗 가공·보철 제작·배송까지 어벗츠가 온라인으로 처리하는 기공 서비스입니다.",
      },
      {
        q: "무엇을 맡길 수 있나요?",
        a: "크라운·브리지 보철과 맞춤 어벗 가공입니다. 심플어벗을 고른 뒤나, 맞춤 어벗이 도착한 뒤 같은 흐름으로 이어집니다.",
      },
      {
        q: "진행 상황은 어떻게 보나요?",
        a: "접수부터 디자인, 출고까지 같은 화면에 남습니다. 도착일이 보이고, 문의는 그 의뢰서 옆에서 바로 합니다.",
      },
      {
        q: "비용은 어떻게 내나요?",
        a: "미리 충전하는 방식이 아닙니다. 실제로 쓴 만큼만 매월 말에 정산됩니다.",
      },
      {
        q: "심플웨이와는 어떻게 이어지나요?",
        a: "잇몸을 스캔하고 어벗 규격을 고르면, 보철이 같은 의뢰로 넘어옵니다.",
      },
      {
        q: "커스텀어벗은 어떻게 만드나요?",
        a: "스캔과 디자인이 올라오면 CNC 가공이 바로 시작됩니다. 완성된 맞춤 어벗이 기공실에 도착하면 보철과 함께 치과로 나갑니다.",
      },
    ],
  },
];

export function getLandingOffer(slug: string | undefined) {
  return landingOffers.find((offer) => offer.slug === slug);
}

export function offerPath(slug: string) {
  return `/offer/${slug}`;
}
