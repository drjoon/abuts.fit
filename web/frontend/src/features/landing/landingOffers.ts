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
} from "./landingAssets";

export type OfferVisual =
  | { kind: "blank"; caption: string }
  | { kind: "photo"; src: string; alt: string }
  | {
      kind: "pair";
      items: Array<{ src: string; alt: string; caption: string }>;
    }
  | { kind: "workspace" };

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

/** 가격 없는 설명 카드. 치과가 고르는 이유. */
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
  stories?: [OfferStory, OfferStory];
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
    lead: "기공의뢰서, 정산과 계산서, 배송 확인. 제품 구매까지 한 계정입니다.",
    hero: "tile",
    tile: { kind: "workspace" },
    cta: { kind: "start", label: "시작하기" },
    highlights: [
      { icon: "request", label: "의뢰서", line: "스캔과 보철을 올립니다" },
      { icon: "start", label: "진행", line: "의뢰에서 출고까지" },
      { icon: "scan", label: "채팅", line: "의뢰서 옆에서 합니다" },
      { icon: "pay", label: "정산", line: "월말 계산서가 나갑니다" },
      { icon: "ship", label: "배송", line: "기공소 배송은 무료" },
    ],
    stories: [
      {
        name: "지정 기공소",
        line: "수수료 없이 맡깁니다.",
        points: ["원하는 기공소 지정", "플랫폼 수수료 없음", "월 참여비도 없음"],
        visual: { kind: "workspace" },
      },
      {
        name: "진행과 정산",
        line: "돈과 물건이 한 기록.",
        points: ["상태가 같은 화면", "계산서는 월말에", "배송 문의가 줄어듦"],
      },
    ],
    faq: [
      {
        q: "월 이용료가 있나요?",
        a: "없습니다. 기공과 커스텀어벗은 크레딧으로 결제합니다.",
      },
      {
        q: "지정 의뢰도 수수료가 있나요?",
        a: "없습니다. 자동매칭만 작업이 끝난 뒤 기공비에서 빠집니다.",
      },
      {
        q: "배송비는요?",
        a: "치과와 기공소 사이는 무료입니다.",
      },
      {
        q: "계산서는 어떻게 나오나요?",
        a: "기공·커스텀어벗은 부가세 없는 계산서입니다. 월말에 나갑니다.",
      },
      {
        q: "진행은 어디서 보나요?",
        a: "의뢰, 작업시작, 디자인, 출고가 같은 화면에 남습니다.",
      },
    ],
  },
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "스캔하면 시작.",
    heroTitle: "스캔하면 시작.",
    line: "힐링에서 보철까지.",
    lead: "심플 힐링 어벗을 구강 스캔해 올리면, 어벗 선택과 보철이 한 흐름입니다.",
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
        q: "심플웨이는 무엇인가요?",
        a: "심플 힐링을 스캔해 올리고, 심플어벗과 보철로 이어지는 흐름입니다.",
      },
      {
        q: "Hex와 Non-Hex가 있나요?",
        a: "힐링과 심플어벗 모두 Hex · Non-Hex입니다. 판매가는 각 ₩16,500입니다.",
      },
      {
        q: "키트는 무엇이 필요한가요?",
        a: "Surgical Kit는 식립, Prosthetic Kit는 치은 형성과 어벗 체결입니다.",
      },
      {
        q: "배송비는요?",
        a: "스토어 배송비는 건당 ₩3,300, 부가세 포함입니다.",
      },
      {
        q: "보철은 어디서 하나요?",
        a: "어벗이 정해지면 같은 의뢰서에서 기공으로 이어집니다.",
      },
    ],
  },
  {
    slug: "custom-abutment",
    navLabel: "커스텀어벗",
    punch: "일정한 품질의 CNC 어벗.",
    heroTitle: "일정한 CNC 품질.",
    line: "주문이 가공이 됩니다.",
    lead: "플랫폼과 연계된 자동화 공정으로, 균일한 품질의 CNC 커스텀 어벗을 만듭니다.",
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
        a: "작업시작 후, 그 기공소가 디자인을 올리는 순간입니다.",
      },
      {
        q: "완성품은 어디로 가나요?",
        a: "치과가 아니라 주문한 기공소로 갑니다. 보철과 함께 치과로 이어집니다.",
      },
      {
        q: "품질은 왜 일정한가요?",
        a: "건마다 같은 CNC 공정이기 때문입니다.",
      },
      {
        q: "치과가 내는 금액은요?",
        a: "그 기공소 수가입니다. 생산 단가는 기공소와 어벗츠가 정산합니다.",
      },
    ],
  },
  {
    slug: "lab",
    navLabel: "기공사업부",
    punch: "보철을 이어서.",
    heroTitle: "보철을 이어서.",
    line: "어벗츠 제품 다음 기공.",
    lead: "어벗츠가 직접 운영하는 기공소입니다. 어벗츠 제품 다음의 보철을 맡습니다.",
    hero: "tile",
    tile: { kind: "workspace" },
    cta: { kind: "start", label: "의뢰하기" },
    highlights: [
      { icon: "lab", label: "기공실", line: "어벗츠가 직접 운영" },
      { icon: "crown", label: "보철", line: "크라운과 브리지" },
      { icon: "abutment", label: "연결", line: "어벗 다음이 이어짐" },
      { icon: "ship", label: "배송", line: "치과 배송은 무료" },
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
        a: "어벗츠 제품 다음의 보철입니다. 심플어벗이든 커스텀어벗이든 이어집니다.",
      },
      {
        q: "배송비는요?",
        a: "치과와 기공소 사이는 무료입니다.",
      },
      {
        q: "진행은 어디서 보나요?",
        a: "작업시작, 디자인, 출고가 같은 화면에 남습니다.",
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
