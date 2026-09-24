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
  LANDING_CASE_HEALING,
  LANDING_CUSTOM_ABUTMENT,
  LANDING_CUSTOM_TRACKING,
  LANDING_PLATFORM_BOARD,
  LANDING_PLATFORM_LEDGER,
  LANDING_PLATFORM_REQUEST,
  LANDING_PLATFORM_STATS,
  LANDING_SW_ABUTMENT_CROWN,
  LANDING_SW_BONE_SHAPER,
  LANDING_SW_CHECK_KIT,
  LANDING_SW_CHECK_PIN,
  LANDING_SW_GUIDE_HOW_TO,
  LANDING_SW_GUIDE_KIT,
  LANDING_SW_GUIDE_PEN_PIN,
  LANDING_SW_HERO_KITS,
  LANDING_SW_PROSTHETIC_KIT,
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

export type OfferSlide = {
  title: string;
  line: string;
  visual: OfferVisual;
};

export type OfferScene = {
  title: string;
  line: string;
  visual: OfferVisual;
};

/** 가격 없는 설명. body는 문장 단위 → UI에서 `<br />`. */
export type OfferStory = {
  name: string;
  line: string;
  body: string[];
  /** 스펙·체크리스트가 필요할 때만. */
  points?: string[];
  visual?: OfferVisual;
};

export type LandingOffer = {
  slug: string;
  navLabel: string;
  /** 홈 타일. 오퍼 히어로는 heroTitle. */
  punch: string;
  heroTitle: string;
  line: string;
  lead: string;
  /** video=키트 영상 · photo=풀블리드 스틸 · tile=텍스트+미디어 */
  hero: "video" | "photo" | "tile";
  tile: OfferVisual;
  /** 오퍼 히어로. 없으면 tile. 홈 타일과 겹치지 않을 때. */
  pageVisual?: OfferVisual;
  /** 히어로 아래 시작 버튼. 상품 카드가 있으면 쓰지 않는다. */
  cta?: OfferBuy;
  highlights?: OfferHighlight[];
  scene?: OfferScene;
  /** 정가·배송·구매. 심플웨이만. */
  products?: [OfferProductCard, OfferProductCard];
  stories?: OfferStory[];
  slideHeading?: string;
  slides?: OfferSlide[];
  specs?: Array<{ label: string; value: string }>;
  faq?: Array<{ q: string; a: string }>;
};

/** 레거시 `/offer/platform` · `/offer/custom-abutment` → 새 메뉴 오퍼 */
export const LEGACY_OFFER_REDIRECTS: Record<string, string> = {
  platform: "simple-way",
  "custom-abutment": "lab",
};

const FULL_PACKAGE = "/store/acrodent/full-package.jpg";

const HEALING_VISUAL: OfferVisual = {
  kind: "photo",
  src: LANDING_CASE_HEALING,
  alt: "심플 힐링 어벗",
};

const ABUTMENT_VISUAL: OfferVisual = {
  kind: "photo",
  src: LANDING_CASE_ABUTMENT,
  alt: "심플어벗",
};

const HERO_KITS: OfferVisual = {
  kind: "photo",
  src: LANDING_SW_HERO_KITS,
  alt: "심플웨이 Guide · Check · Prosthetics 키트",
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

/** 이벤트(`/events/simpleway-gribo` extras)와 동일 카피 — 심플웨이·기공서비스에 넣음 */
const PLATFORM_STORY: OfferStory = {
  name: "어벗츠 플랫폼",
  line: "치과·기공소",
  body: [
    "치과와 기공소가 온라인으로 기공을 의뢰하고, 어벗츠 커스텀어벗과도 바로 연동됩니다.",
  ],
  visual: {
    kind: "photo",
    src: LANDING_PLATFORM_BOARD,
    alt: "어벗츠 플랫폼 의뢰 보드",
  },
};

const PLATFORM_FAQ = {
  q: "어벗츠 플랫폼은 무엇인가요?",
  a: "치과와 기공소가 온라인으로 기공을 의뢰하고, 어벗츠 커스텀어벗과도 바로 연동됩니다.",
};

export const landingOffers: LandingOffer[] = [
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "직관적인 수술과 보철",
    heroTitle: "직관적인 수술과 보철",
    line: "식립 위치와 어벗 선택을 간결한 흐름으로.",
    lead: "심플웨이 툴과 재료로 이상적인 식립을 준비하고, 케이스에 맞는 어벗으로 보철까지 이어갑니다.",
    hero: "photo",
    tile: WAVEON_WORKFLOW_TILE,
    pageVisual: HERO_KITS,
    highlights: [
      { icon: "kit", label: "Guide", line: "가이드펜·핀으로 위치를" },
      { icon: "scan", label: "Check", line: "체크핀으로 경로를 확인" },
      { icon: "healing", label: "힐링", line: "이머전스 프로파일을 형성" },
      { icon: "abutment", label: "심플어벗", line: "같은 직경으로 이어짐" },
      { icon: "request", label: "플랫폼", line: "치과·기공소 온라인 의뢰" },
      { icon: "store", label: "스토어", line: "키트·제품을 바로 주문" },
    ],
    scene: {
      title: "탑다운으로 잡습니다.",
      line: "가이드펜과 핀이 보철 직경을 먼저 정합니다.",
      visual: {
        kind: "photo",
        src: LANDING_SW_GUIDE_HOW_TO,
        alt: "가이드펜 직경 선택",
      },
    },
    products: [
      {
        name: "심플 힐링",
        line: "가이드 직경과 맞는 치은을 형성합니다.",
        price: "₩16,500",
        priceNote: "부가세 포함 · 1EA",
        specs: ["Hex · Non-Hex", "직경 6 · 7 · 9", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-healing-2" },
        visual: HEALING_VISUAL,
      },
      {
        name: "심플어벗",
        line: "같은 색·같은 직경으로 보철을 올립니다.",
        price: "₩16,500",
        priceNote: "부가세 포함 · 1EA",
        specs: ["Hex · Non-Hex", "높이 XS–XL", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-abutment-2" },
        visual: ABUTMENT_VISUAL,
      },
    ],
    stories: [
      {
        name: "가이드펜과 가이드핀.",
        line: "보철 직경부터 정합니다.",
        body: [
          "가이드펜으로 탑다운 위치를 잡고, 가이드핀으로 여러 부위를 나란히 맞춥니다.",
          "심플 힐링은 같은 직경 라인으로 이어져, 이머전스 프로파일이 처음부터 맞습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_SW_GUIDE_PEN_PIN,
          alt: "가이드펜과 가이드핀",
        },
      },
      {
        name: "본쉐이퍼.",
        line: "힐링이 앉을 자리를 만듭니다.",
        body: [
          "치조골이 막으면 심플 힐링이 끝까지 들어가지 않습니다.",
          "본쉐이퍼는 힐링 프로파일에 맞춰 골을 성형해, 체결이 막히지 않게 합니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_SW_BONE_SHAPER,
          alt: "본쉐이퍼로 골 성형",
        },
      },
      {
        name: "체크핀.",
        line: "보철 경로를 다시 확인합니다.",
        body: [
          "체결 뒤 체크핀으로 위치와 각도를 봅니다.",
          "다수치일수록 누적 오차를 줄이고, 이머전스도 함께 점검합니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_SW_CHECK_PIN,
          alt: "체크핀으로 경로 확인",
        },
      },
      {
        name: "심플어벗으로 보철.",
        line: "가이드와 같은 프로파일.",
        body: [
          "심플어벗은 가이드펜·핀·체크핀과 맞는 이머전스와 포스트를 갖습니다.",
          "CAD/CAM 보철에 맞춰져 있고, 규격이 아니면 같은 화면에서 커스텀으로 넘깁니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_SW_ABUTMENT_CROWN,
          alt: "심플어벗 위 보철",
        },
      },
      PLATFORM_STORY,
    ],
    slideHeading: "색 · 키트.",
    slides: [
      {
        title: "직경은 색으로.",
        line: "6 노랑 · 7 초록 · 8 보라 · 9 파랑 · 10 하늘.",
        visual: {
          kind: "photo",
          src: LANDING_SW_GUIDE_KIT,
          alt: "Guide Kit 직경 색상",
        },
      },
      {
        title: "Guide Kit.",
        line: "가이드펜 · 컵 · 가이드핀.",
        visual: {
          kind: "photo",
          src: LANDING_SW_GUIDE_HOW_TO,
          alt: "가이드펜 사용",
        },
      },
      {
        title: "Check Kit.",
        line: "체크핀 · 본쉐이퍼.",
        visual: {
          kind: "photo",
          src: LANDING_SW_CHECK_KIT,
          alt: "Check Kit",
        },
      },
      {
        title: "Prosthetics Kit.",
        line: "치은 형성 · 어벗 체결 · 판매가 ₩1,100,000.",
        visual: {
          kind: "photo",
          src: LANDING_SW_PROSTHETIC_KIT,
          alt: "Prosthetics Kit",
        },
      },
      {
        title: "500만 패키지.",
        line: "제품과 키트를 묶어 · 패키지 판매가 ₩5,000,000.",
        visual: {
          kind: "photo",
          src: FULL_PACKAGE,
          alt: "500만 패키지",
        },
      },
    ],
    specs: [
      { label: "직경 색", value: "6–10 · 노·녹·보·청·하늘" },
      { label: "힐링", value: "직경 6·7·9" },
      { label: "심플어벗", value: "높이 XS–XL · Hex·Non-Hex" },
      { label: "키트", value: "Guide · Check · Prosthetics" },
      { label: "제조", value: "(주)애크로덴트" },
    ],
    faq: [
      {
        q: "심플웨이는 어떤 흐름인가요?",
        a: "가이드펜·핀으로 보철 직경을 정한 뒤, 체크핀으로 확인하고, 심플 힐링과 심플어벗으로 이어집니다. 규격이 맞지 않으면 같은 화면에서 커스텀어벗으로 넘길 수 있습니다.",
      },
      PLATFORM_FAQ,
      {
        q: "색상은 무엇을 뜻하나요?",
        a: "직경 라인입니다. 6은 노랑, 7은 초록, 8은 보라, 9는 파랑, 10은 하늘입니다. 가이드·힐링·어벗이 같은 색을 따릅니다.",
      },
      {
        q: "힐링과 심플어벗은 어떻게 고르나요?",
        a: "둘 다 Hex · Non-Hex입니다. 힐링은 직경 6·7·9, 심플어벗은 높이 XS–XL입니다. 판매가는 각 ₩16,500, 부가세 포함, 1EA입니다.",
      },
      {
        q: "키트는 무엇이 필요한가요?",
        a: "Guide Kit는 위치·직경 가이드, Check Kit는 경로 확인과 본쉐이퍼, Prosthetics Kit는 치은 형성과 어벗 체결입니다.",
      },
      {
        q: "커스텀어벗은 언제 쓰나요?",
        a: "규격 어벗으로 맞추기 어려울 때입니다. 기공소가 작업시작한 뒤 디자인을 올리면 CNC 가공이 시작되고, 완성품은 주문한 기공소로 갑니다. 런칭가 1만원, 정상가 1.3만원입니다.",
      },
      {
        q: "스토어 배송비는요?",
        a: "상품 10만원 이상 배송비 무료, 미만은 ₩3,500(부가세 포함)입니다. 치과와 기공소 사이 기공 배송과는 별도입니다.",
      },
      {
        q: "진행과 정산은 어디서 보나요?",
        a: "의뢰, 작업시작, 디자인, 출고, 추적이 같은 화면입니다. 월 이용료는 없고, 쓴 금액만 매월 말 계산서로 나갑니다.",
      },
    ],
  },
  {
    slug: "lab",
    navLabel: "기공서비스",
    punch: "디자인에서 생산까지",
    heroTitle: "디자인에서 생산까지",
    line: "의뢰·기공 협업·애크로덴트 납품을 한 흐름으로.",
    lead: "스캔 의뢰부터 커스텀어벗 디자인, 애크로덴트 생산·납품까지 같은 플랫폼에서 이어집니다.",
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
    highlights: [
      { icon: "request", label: "플랫폼", line: "치과·기공소 온라인 의뢰" },
      { icon: "lab", label: "기공실", line: "어벗츠가 직접 운영합니다" },
      { icon: "crown", label: "보철", line: "크라운과 브리지" },
      { icon: "cnc", label: "커스텀", line: "CNC 어벗이 이 기공소로" },
      { icon: "start", label: "작업시작", line: "기공소가 받으면 시작합니다" },
      { icon: "ship", label: "배송", line: "치과와 기공소 사이는 무료" },
    ],
    scene: {
      title: "디자인이 곧 가공.",
      line: "올리는 순간 CNC가 시작.",
      visual: {
        kind: "photo",
        src: LANDING_CUSTOM_ABUTMENT,
        alt: "커스텀 어벗 실물",
      },
    },
    stories: [
      PLATFORM_STORY,
      {
        name: "심플어벗 위에 보철을.",
        line: "고른 규격이 그대로 이어집니다.",
        body: [
          "힐링을 스캔하고 심플어벗 규격을 고르면, 보철이 같은 의뢰로 넘어옵니다.",
          "어벗츠가 직접 운영하는 기공실에서 크라운·브리지를 만듭니다.",
          "제품과 기공이 끊기지 않아, 환자에게 가는 날도 조금 더 분명해집니다.",
        ],
        visual: ABUTMENT_VISUAL,
      },
      {
        name: "커스텀어벗이 도착하면.",
        line: "보철과 함께 치과로.",
        body: [
          "CNC 어벗이 이 기공소로 들어오면, 그 위에서 보철을 이어 만듭니다.",
          "따로 맞춰 보낼 필요 없이, 치과로 한 번에 출고합니다.",
          "작업시작부터 출고까지 같은 화면에 남습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗",
        },
      },
      {
        name: "손으로 맞추는 대신, 시스템으로.",
        line: "어벗츠 자동화로 균일한 고품질.",
        body: [
          "스캔과 디자인이 올라오면 가공이 시작됩니다.",
          "애크로덴트 CNC가 같은 툴패스·같은 스펙으로 깎습니다.",
          "추적 화면에서 가공부터 출고까지 따라갈 수 있습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CUSTOM_TRACKING,
          alt: "CNC 추적관리",
        },
      },
      {
        name: "‘어디까지 됐지?’를 묻지 않아도.",
        line: "상태와 채팅이 한곳에.",
        body: [
          "작업시작부터 디자인, 출고까지 같은 보드에 남습니다.",
          "도착일과 보철 내용이 보이고, 문의는 그 의뢰서 옆 채팅에서 합니다.",
          "자리를 비워 전화할 일이 조금 줄어듭니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_REQUEST,
          alt: "신규 의뢰",
        },
      },
      {
        name: "쓴 만큼, 월말에.",
        line: "크레딧으로 결제합니다.",
        body: [
          "충전할 때는 계산서가 나오지 않습니다.",
          "실제로 쓴 금액만 매월 말, 기공·커스텀어벗은 면세 계산서로 나갑니다.",
          "런칭 이벤트 기간 커스텀어벗은 1만원, 이후 정상가는 1.3만원입니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_LEDGER,
          alt: "정산 내역",
        },
      },
    ],
    faq: [
      {
        q: "기공서비스는 무엇인가요?",
        a: "어벗츠가 직접 운영하는 기공소입니다. 치과 의뢰를 받아 보철을 만듭니다.",
      },
      PLATFORM_FAQ,
      {
        q: "무엇을 맡기나요?",
        a: "어벗츠 제품 다음의 보철입니다. 심플어벗을 고른 뒤나, 커스텀어벗이 도착한 뒤 이어집니다.",
      },
      {
        q: "커스텀어벗과는요?",
        a: "기공소가 디자인을 올리면 CNC가 시작하고, 완성품이 이 기공소로 도착하면 보철과 함께 만들고 치과로 한 번에 나갑니다.",
      },
      {
        q: "커스텀어벗 판매가는 얼마인가요?",
        a: "런칭 이벤트 기간은 1만원 + 배송비입니다. 이벤트 종료 후 정상가는 1.3만원이며, 배송은 박스당입니다. 기공소는 FM덴탈 월정액 배송을 선택할 수 있습니다.",
      },
      {
        q: "심플웨이와는 어떻게 이어지나요?",
        a: "힐링을 스캔하고 규격 어벗을 고르면, 보철이 같은 의뢰로 넘어옵니다.",
      },
      {
        q: "진행과 정산은 어디서 보나요?",
        a: "의뢰, 작업시작, 디자인, 출고, 추적이 같은 화면입니다. 치과와 기공소 사이 배송은 무료이고, 쓴 금액만 매월 말 계산서로 나갑니다.",
      },
      {
        q: "월 이용료가 있나요?",
        a: "없습니다. 기공소 월 참여비도 없고, 치과 멤버십 월 과금도 없습니다. 기공과 커스텀어벗은 크레딧(거래 선수금)으로 결제합니다.",
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
