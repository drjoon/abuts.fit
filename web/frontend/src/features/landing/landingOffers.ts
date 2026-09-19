// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
//
// 정가(판매가·배송비)는 심플웨이만. 스토어 SSOT: storeCatalog.ts STORE_LIST_INCLUSIVE_PRICES
// · STORE_SHIPPING_FEE_INCLUSIVE 3,300. 플랫폼·커스텀어벗·기공사업부는 금액을 적지 않는다.
import {
  LANDING_CAD_PREVIEW,
  LANDING_CASE_ABUTMENT,
  LANDING_CASE_HEALING,
  LANDING_CASE_KIT,
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

/** 가격 없는 설명. 화면이 하는 일과 맞춘다. */
export type OfferStory = {
  name: string;
  line: string;
  points: [string, string, string];
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
    lead: "의뢰서에서 출고까지.",
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
        name: "신규 의뢰",
        line: "스캔과 보철을 올립니다.",
        points: ["기공소를 지정합니다", "스캔 파일을 붙입니다", "치아와 보철을 고릅니다"],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_REQUEST,
          alt: "신규 의뢰",
        },
      },
      {
        name: "진행",
        line: "상태와 채팅이 한곳.",
        points: ["의뢰에서 출고까지 남습니다", "도착일과 보철이 보입니다", "문의는 의뢰서 옆입니다"],
        visual: {
          kind: "photo",
          src: LANDING_PLATFORM_BOARD,
          alt: "의뢰 진행",
        },
      },
      {
        name: "정산",
        line: "쓴 만큼, 월말에.",
        points: ["크레딧(거래 선수금)으로 냅니다", "충전할 때 계산서는 없습니다", "기공·어벗은 면세 계산서"],
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
        a: "기공소를 지정하거나 자동매칭으로 보냅니다. 지정 의뢰는 플랫폼 수수료가 없습니다. 자동매칭만 작업이 끝난 뒤 기공비에서 수수료가 빠집니다.",
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
        a: "치과와 기공소 사이 기공 배송은 무료입니다. 스토어 기성품만 건당 ₩3,300, 부가세 포함입니다.",
      },
    ],
  },
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "스캔하면 시작.",
    heroTitle: "스캔하면 시작.",
    line: "힐링에서 보철까지.",
    lead: "스캔이 보철로 이어집니다.",
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
    slideHeading: "키트도 함께.",
    slides: [
      {
        title: "Surgical Kit.",
        line: "판매가 ₩1,540,000.",
        visual: KIT_VISUAL,
      },
      {
        title: "Prosthetic Kit.",
        line: "판매가 ₩1,100,000.",
        visual: {
          kind: "photo",
          src: PROSTHETIC_KIT,
          alt: "Prosthetic Kit",
        },
      },
      {
        title: "500만 패키지.",
        line: "패키지 판매가 ₩5,000,000.",
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
        a: "건당 ₩3,300, 부가세 포함입니다. 치과와 기공소 사이 기공 배송과는 별도입니다.",
      },
    ],
  },
  {
    slug: "custom-abutment",
    navLabel: "커스텀어벗",
    punch: "일정한 품질의 CNC 어벗.",
    heroTitle: "일정한 CNC 품질.",
    line: "디자인을 올리면 시작.",
    lead: "건마다 같은 공정입니다.",
    hero: "tile",
    tile: {
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
        src: LANDING_CAD_PREVIEW,
        alt: "커스텀 어벗 CAD",
      },
    },
    stories: [
      {
        name: "같은 품질",
        line: "건마다 같은 공정입니다.",
        points: ["스캔이 올라오면 시작", "애크로덴트 CNC", "품질이 균일합니다"],
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗 CAD",
        },
      },
      {
        name: "기공소로 도착",
        line: "보철과 함께 옵니다.",
        points: ["치과로 바로 가지 않음", "주문한 기공소가 받음", "보철 기공으로 이어짐"],
        visual: { kind: "workspace" },
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
        a: "건마다 같은 CNC 공정이기 때문입니다. 제조는 (주)애크로덴트입니다.",
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
        name: "심플어벗 다음",
        line: "고른 규격 위에 보철.",
        points: ["힐링 스캔 다음", "규격 어벗을 고르면", "보철이 같은 의뢰"],
        visual: ABUTMENT_VISUAL,
      },
      {
        name: "커스텀어벗 다음",
        line: "도착하면 보철로 넘깁니다.",
        points: ["CNC가 기공소로", "보철과 함께 제작", "치과로 한 번에"],
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
