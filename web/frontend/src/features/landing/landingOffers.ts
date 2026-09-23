// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
//
// 정가(판매가·배송비)는 심플웨이 + 커스텀어벗(런칭/정상). 스토어 SSOT: storeCatalog.ts
// · STORE_SHIPPING_FEE_INCLUSIVE 3,500 · 10만원↑무료. 플랫폼·기공사업부는 금액을 적지 않는다.
import {
  LANDING_CAD_PREVIEW,
  LANDING_CASE_ABUTMENT,
  LANDING_CASE_HEALING,
  LANDING_CASE_KIT,
  LANDING_CUSTOM_ABUTMENT,
  LANDING_CUSTOM_TRACKING,
  LANDING_PLATFORM_BOARD,
  LANDING_PLATFORM_LEDGER,
  LANDING_PLATFORM_REQUEST,
  LANDING_PLATFORM_STATS,
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
  hero: "video" | "tile";
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

const PROSTHETIC_KIT = "/store/acrodent/prosthetic-kit.jpg";
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

const KIT_VISUAL: OfferVisual = {
  kind: "photo",
  src: LANDING_CASE_KIT,
  alt: "Surgical Kit",
};

const PAIR_VISUAL: OfferVisual = {
  kind: "pair",
  items: [
    {
      src: LANDING_CASE_HEALING,
      alt: "심플 힐링 어벗",
      caption: "심플 힐링",
    },
    {
      src: LANDING_CASE_ABUTMENT,
      alt: "심플어벗",
      caption: "심플어벗",
    },
  ],
};

export const landingOffers: LandingOffer[] = [
  {
    slug: "platform",
    navLabel: "플랫폼",
    punch: "의뢰, 정산, 배송.",
    heroTitle: "의뢰, 정산, 배송.",
    line: "같은 화면에서 끝냅니다.",
    lead: "의뢰서에서 출고까지, 한곳에서.",
    hero: "tile",
    tile: {
      kind: "slideshow",
      shots: [
        { src: LANDING_PLATFORM_BOARD, alt: "의뢰 진행" },
        { src: LANDING_PLATFORM_REQUEST, alt: "신규 의뢰" },
        { src: LANDING_PLATFORM_STATS, alt: "정산 통계" },
        { src: LANDING_PLATFORM_LEDGER, alt: "정산 내역" },
      ],
    },
    cta: { kind: "start", label: "시작하기" },
    highlights: [
      { icon: "request", label: "의뢰서", line: "기공소·스캔·보철을 적습니다" },
      { icon: "start", label: "작업시작", line: "기공소가 받으면 시작합니다" },
      { icon: "scan", label: "채팅", line: "그 의뢰서 옆에서 합니다" },
      { icon: "pay", label: "정산", line: "크레딧으로 내고 월말 계산서" },
      { icon: "ship", label: "배송", line: "출고와 추적이 의뢰에 남습니다" },
    ],
    stories: [
      {
        name: "아침에 올리면, 저녁에도 보입니다.",
        line: "신규 의뢰는 스캔과 보철부터.",
        body: [
          "기공소를 고르고, 스캔 파일을 붙이고, 치아와 보철을 적습니다.",
          "따로 메신저에 파일을 보낼 필요가 없습니다.",
          "올린 순간부터 그 의뢰서가 기록이 됩니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_REQUEST,
          alt: "신규 의뢰",
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
          src: LANDING_PLATFORM_BOARD,
          alt: "의뢰 진행",
        },
      },
      {
        name: "쓴 만큼, 월말에.",
        line: "크레딧으로 결제합니다.",
        body: [
          "충전할 때는 계산서가 나오지 않습니다.",
          "실제로 쓴 금액만 매월 말, 기공·커스텀어벗은 면세 계산서로 나갑니다.",
          "진행과 돈이 같은 의에 있어, 나중에 맞추느라 헤매지 않습니다.",
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
        q: "월 이용료가 있나요?",
        a: "없습니다. 기공소 월 참여비도 없고, 치과 멤버십 월 과금도 없습니다. 기공과 커스텀어벗은 크레딧(거래 선수금)으로 결제합니다.",
      },
      {
        q: "의뢰는 어디로 보내나요?",
        a: "기공소를 지정하거나 자동매칭으로 보냅니다. 지정·자동매칭 모두 플랫폼 수수료는 없습니다.",
      },
      {
        q: "진행은 어디서 보나요?",
        a: "의뢰, 작업시작, 디자인, 출고, 추적이 같은 화면입니다. 채팅도 그 의뢰서 옆에서 합니다.",
      },
      {
        q: "계산서는 언제 나오나요?",
        a: "충전할 때가 아닙니다. 사용한 금액만 매월 말, 기공·커스텀어벗은 면세 계산서, 스토어는 세금계산서로 나갑니다.",
      },
      {
        q: "배송비는 있나요?",
        a: "치과와 기공소 사이 기공 배송은 무료입니다. 스토어 기성품은 상품 10만원 이상 배송비 무료, 미만은 ₩3,500(부가세 포함)입니다.",
      },
    ],
  },
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "스캔하면 시작.",
    heroTitle: "스캔하면 시작.",
    line: "힐링에서 보철까지.",
    lead: "심플웨이로 보철이 이어집니다.",
    hero: "video",
    tile: PAIR_VISUAL,
    highlights: [
      { icon: "healing", label: "힐링", line: "치은을 짧게 형성" },
      { icon: "abutment", label: "심플어벗", line: "규격에서 바로 선택" },
      { icon: "kit", label: "Surgical", line: "식립은 이 키트" },
      { icon: "crown", label: "Prosthetic", line: "체결은 이 키트" },
      { icon: "scan", label: "보철", line: "같은 의뢰로 이어짐" },
    ],
    products: [
      {
        name: "심플 힐링",
        line: "식립 뒤 치은을 형성합니다.",
        price: "₩16,500",
        priceNote: "부가세 포함 · 1EA",
        specs: ["Hex · Non-Hex", "직경 6 · 7 · 9", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-healing-2" },
        visual: HEALING_VISUAL,
      },
      {
        name: "심플어벗",
        line: "보철 전에 규격을 고릅니다.",
        price: "₩16,500",
        priceNote: "부가세 포함 · 1EA",
        specs: ["Hex · Non-Hex", "높이 XS–XL", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-abutment-2" },
        visual: ABUTMENT_VISUAL,
      },
    ],
    stories: [
      {
        name: "짧고 분명한 흐름.",
        line: "힐링을 스캔하고, 어벗을 고릅니다.",
        body: [
          "심플 힐링으로 치은을 잡은 뒤 구강 스캔을 올립니다.",
          "심플어벗은 Hex·Non-Hex, 높이 XS–XL 중에서 고르면 됩니다.",
          "선택한 규격 위에서 보철 의뢰가 같은 화면으로 이어집니다.",
        ],
        visual: PAIR_VISUAL,
      },
      {
        name: "손으로 만져본 그 감각이, 그대로.",
        line: "키트부터 제품까지 한 라인.",
        body: [
          "식립은 Surgical Kit, 치은 형성과 어벗 체결은 Prosthetic Kit로 이어집니다.",
          "제품과 키트가 같은 제조 라인에 있어, 현장에서 손이 헷갈리지 않습니다.",
          "스토어에서 주문하고, 플랫폼에서 보철까지 이으면 됩니다.",
        ],
        visual: KIT_VISUAL,
      },
    ],
    slideHeading: "키트도 함께.",
    slides: [
      {
        title: "Surgical Kit.",
        line: "식립에 쓰는 키트 · 판매가 ₩1,540,000.",
        visual: KIT_VISUAL,
      },
      {
        title: "Prosthetic Kit.",
        line: "치은 형성·어벗 체결 · 판매가 ₩1,100,000.",
        visual: {
          kind: "photo",
          src: PROSTHETIC_KIT,
          alt: "Prosthetic Kit",
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
      { label: "힐링", value: "직경 6·7·9" },
      { label: "심플어벗", value: "높이 5단" },
      { label: "키트", value: "식립 · 체결" },
      { label: "제조", value: "(주)애크로덴트" },
    ],
    faq: [
      {
        q: "심플웨이는 어떤 흐름인가요?",
        a: "심플 힐링을 구강 스캔해 올리고, 심플어벗 규격을 고른 뒤, 보철 의뢰로 이어집니다.",
      },
      {
        q: "힐링과 심플어벗은 어떻게 고르나요?",
        a: "둘 다 Hex · Non-Hex입니다. 힐링은 직경 6·7·9, 심플어벗은 높이 XS–XL입니다. 판매가는 각 ₩16,500, 부가세 포함, 1EA입니다.",
      },
      {
        q: "키트는 무엇이 필요한가요?",
        a: "Surgical Kit는 식립, Prosthetic Kit는 치은 형성과 어벗 체결입니다.",
      },
      {
        q: "보철은 어디서 만드나요?",
        a: "어벗이 정해지면 같은 의뢰서에서 기공으로 이어집니다. 기공사업부나 지정 기공소에 맡깁니다.",
      },
      {
        q: "스토어 배송비는요?",
        a: "상품 10만원 이상 배송비 무료, 미만은 ₩3,500(부가세 포함)입니다. 치과와 기공소 사이 기공 배송과는 별도입니다.",
      },
    ],
  },
  {
    slug: "custom-abutment",
    navLabel: "커스텀어벗",
    punch: "자동화로 균일한 고품질.",
    heroTitle: "균일한 CNC 품질.",
    line: "디자인을 올리면 시작.",
    lead: "건마다 같은 공정, 같은 품질.",
    hero: "tile",
    tile: {
      kind: "slideshow",
      shots: [
        { src: LANDING_CUSTOM_ABUTMENT, alt: "커스텀 어벗 실물" },
        { src: LANDING_CAD_PREVIEW, alt: "커스텀 어벗 CAD" },
        { src: LANDING_CUSTOM_TRACKING, alt: "CNC 추적관리" },
      ],
    },
    pageVisual: {
      kind: "photo",
      src: LANDING_CAD_PREVIEW,
      alt: "커스텀 어벗 CAD",
    },
    cta: { kind: "start", label: "의뢰하기" },
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
      {
        name: "손으로 맞추는 대신, 시스템으로.",
        line: "어벗츠 자동화로 균일한 고품질.",
        body: [
          "스캔과 디자인이 올라오면 가공이 시작됩니다.",
          "애크로덴트 CNC가 같은 툴패스·같은 스펙으로 깎습니다.",
          "건마다 사람이 달라도, 결과물의 편차는 작아집니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CUSTOM_ABUTMENT,
          alt: "균일 품질의 커스텀 어벗 실물",
        },
      },
      {
        name: "런칭 1만원, 이후 1.3만원.",
        line: "배송은 박스 단위.",
        body: [
          "런칭 이벤트 기간에는 1만원에 배송비가 더해집니다.",
          "이벤트 이후 정상가는 1.3만원이며, 배송은 박스당입니다.",
          "기공소는 FM덴탈 월정액 배송을 선택할 수 있습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗 CAD",
        },
      },
      {
        name: "도착은 기공소로.",
        line: "보철과 함께 치과로 이어집니다.",
        body: [
          "완성품은 치과로 바로 가지 않습니다.",
          "주문한 기공소가 받고, 그 위에서 보철 기공이 이어집니다.",
          "추적 화면에서 가공부터 출고까지 따라갈 수 있습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CUSTOM_TRACKING,
          alt: "CNC 추적관리",
        },
      },
    ],
    faq: [
      {
        q: "가공은 언제 시작되나요?",
        a: "기공소가 작업시작한 뒤, 그 기공소가 디자인을 올리는 순간입니다.",
      },
      {
        q: "완성품은 어디로 가나요?",
        a: "치과가 아니라 주문한 기공소로 갑니다. 보철과 함께 치과로 이어집니다.",
      },
      {
        q: "품질은 왜 일정한가요?",
        a: "어벗츠 자동화 시스템으로 건마다 같은 CNC 공정을 거치기 때문입니다. 제조는 (주)애크로덴트입니다.",
      },
      {
        q: "판매가는 얼마인가요?",
        a: "런칭 이벤트 기간은 1만원 + 배송비입니다. 이벤트 종료 후 정상가는 1.3만원이며, 배송은 박스당입니다. 기공소는 FM덴탈 월정액 배송을 선택할 수 있습니다.",
      },
      {
        q: "치과가 내는 금액은 무엇인가요?",
        a: "그 기공소의 커스텀어벗 수가입니다. 기공소가 어벗츠에 내는 생산비와는 따로 정산합니다.",
      },
      {
        q: "계산서는 언제 나오나요?",
        a: "커스텀어벗은 면세입니다. 계산서는 충전할 때가 아니라, 사용한 금액 기준으로 월말에 나갑니다.",
      },
    ],
  },
  {
    slug: "lab",
    navLabel: "기공사업부",
    punch: "보철을 이어서.",
    heroTitle: "보철을 이어서.",
    line: "어벗츠 제품 다음 기공.",
    lead: "심플어벗 다음, 커스텀어벗 다음.",
    hero: "tile",
    tile: { kind: "workspace" },
    cta: { kind: "start", label: "의뢰하기" },
    highlights: [
      { icon: "lab", label: "기공실", line: "어벗츠가 직접 운영합니다" },
      { icon: "crown", label: "보철", line: "크라운과 브리지" },
      { icon: "abutment", label: "연결", line: "어벗 다음이 같은 의뢰" },
      { icon: "ship", label: "배송", line: "치과와 기공소 사이는 무료" },
    ],
    stories: [
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
          "작업시작부터 출고까지 플랫폼 화면에 남습니다.",
        ],
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗",
        },
      },
    ],
    faq: [
      {
        q: "기공사업부는 무엇인가요?",
        a: "어벗츠가 직접 운영하는 기공소입니다. 치과 의뢰를 받아 보철을 만듭니다.",
      },
      {
        q: "무엇을 맡기나요?",
        a: "어벗츠 제품 다음의 보철입니다. 심플어벗을 고른 뒤나, 커스텀어벗이 도착한 뒤 이어집니다.",
      },
      {
        q: "심플웨이와는 어떻게 이어지나요?",
        a: "힐링을 스캔하고 규격 어벗을 고르면, 보철이 같은 의뢰로 넘어옵니다.",
      },
      {
        q: "커스텀어벗과는요?",
        a: "CNC 어벗이 이 기공소로 도착하면 보철과 함께 만들고, 치과로 한 번에 나갑니다.",
      },
      {
        q: "배송과 진행은 어디서 보나요?",
        a: "치과와 기공소 사이 배송은 무료입니다. 작업시작, 디자인, 출고가 같은 화면에 남습니다.",
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
