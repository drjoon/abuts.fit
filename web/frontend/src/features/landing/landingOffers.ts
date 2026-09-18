// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
//
// 가격은 공개 고시·판매가만 적는다.
// - 스토어 판매가(부가세 포함): storeCatalog.ts STORE_LIST_INCLUSIVE_PRICES
// - 스토어 배송: STORE_SHIPPING_FEE_INCLUSIVE 3,300
// - 커스텀어벗 고시: membershipProductionPrice 15,000 / membershipDesignAndProductionPrice 25,000
// - 커스텀어벗 배송: creditSettings.shippingFee 3,500 (부가세 없는 계산서)
// - 기공 기준가: autoMatchBudget.ts ADMIN_LAB_FEE_BASE (의뢰 시 확정)
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
  shipping: string;
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
  highlights: OfferHighlight[];
  scene: OfferScene;
  products: [OfferProductCard, OfferProductCard];
  slides: OfferSlide[];
  specs: Array<{ label: string; value: string }>;
  learn: Array<{ label: string; line: string; href: string }>;
  faq: Array<{ q: string; a: string }>;
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
    highlights: [
      { icon: "request", label: "의뢰서", line: "스캔과 보철을 올립니다" },
      { icon: "start", label: "작업시작", line: "진행이 한 화면에 남음" },
      { icon: "pay", label: "정산", line: "월말 계산서가 나갑니다" },
      { icon: "ship", label: "배송", line: "치과·기공소 배송 무료" },
      { icon: "store", label: "스토어", line: "같은 계정으로 구매" },
    ],
    scene: {
      title: "메신저 대신 의뢰서.",
      line: "스캔과 보철이 한 기록입니다.",
      visual: { kind: "workspace" },
    },
    products: [
      {
        name: "지정 의뢰",
        line: "플랫폼 수수료가 없습니다.",
        price: "₩0",
        priceNote: "월 참여비 없음",
        shipping: "배송 무료",
        specs: ["기공소를 직접 지정", "플랫폼 수수료 없음", "진행은 같은 화면"],
        buy: { kind: "start", label: "시작하기" },
        visual: { kind: "workspace" },
      },
      {
        name: "심플어벗",
        line: "스토어에서 바로 삽니다.",
        price: "₩15,400",
        priceNote: "부가세 포함 · 1EA",
        shipping: "배송비 ₩3,300",
        specs: ["Hex · Non-Hex", "높이 S · M · L · XL", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-abutment-2" },
        visual: ABUTMENT_VISUAL,
      },
    ],
    slides: [
      {
        title: "크레딧으로 결제.",
        line: "선불페이가 아닌 거래 선수금.",
        visual: { kind: "workspace" },
      },
      {
        title: "계산서는 둘로.",
        line: "기공과 스토어는 따로 나갑니다.",
        visual: PAIR_VISUAL,
      },
      {
        title: "출고가 보입니다.",
        line: "추적이 의뢰 카드에 붙습니다.",
        visual: KIT_VISUAL,
      },
    ],
    specs: [
      { label: "결제", value: "크레딧" },
      { label: "계산서", value: "월말 분리" },
      { label: "지정 수수료", value: "없음" },
      { label: "치과 배송", value: "무료" },
    ],
    learn: [
      { label: "심플웨이", line: "힐링에서 보철까지.", href: "/offer/simple-way" },
      { label: "커스텀어벗", line: "주문이 가공이 됩니다.", href: "/offer/custom-abutment" },
    ],
    faq: [
      {
        q: "월 이용료가 있나요?",
        a: "없습니다. 기공·커스텀어벗·스토어는 크레딧으로 결제합니다.",
      },
      {
        q: "지정 의뢰 수수료는요?",
        a: "없습니다. 자동매칭만 작업이 끝난 뒤 기공비에서 빠집니다.",
      },
      {
        q: "배송비는 얼마인가요?",
        a: "치과와 기공소 사이는 무료입니다. 스토어 배송비는 ₩3,300입니다.",
      },
      {
        q: "계산서는 어떻게 나오나요?",
        a: "기공·커스텀어벗은 부가세 없는 계산서, 스토어는 세금계산서. 월말에 따로.",
      },
      {
        q: "누가 가입하나요?",
        a: "치과와 기공소가 같은 플랫폼을 씁니다.",
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
    scene: {
      title: "힐링을 스캔합니다.",
      line: "그다음 어벗을 고릅니다.",
      visual: PAIR_VISUAL,
    },
    products: [
      {
        name: "심플 힐링",
        line: "식립 뒤 치은을 형성합니다.",
        price: "₩15,400",
        priceNote: "부가세 포함 · 1EA",
        shipping: "배송비 ₩3,300",
        specs: ["Hex · Non-Hex", "높이·직경 12종", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-healing-2" },
        visual: HEALING_VISUAL,
      },
      {
        name: "심플어벗",
        line: "보철 전에 규격을 고릅니다.",
        price: "₩15,400",
        priceNote: "부가세 포함 · 1EA",
        shipping: "배송비 ₩3,300",
        specs: ["Hex · Non-Hex", "높이 S · M · L · XL", "제조 (주)애크로덴트"],
        buy: { kind: "store", label: "구매하기", productId: "simple-abutment-2" },
        visual: ABUTMENT_VISUAL,
      },
    ],
    slides: [
      {
        title: "Surgical Kit.",
        line: "판매가 ₩1,320,000.",
        visual: KIT_VISUAL,
      },
      {
        title: "Prosthetic Kit.",
        line: "판매가 ₩880,000.",
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
      { label: "힐링", value: "12종" },
      { label: "심플어벗", value: "12종" },
      { label: "키트", value: "식립 · 체결" },
      { label: "제조", value: "(주)애크로덴트" },
    ],
    learn: [
      { label: "플랫폼", line: "의뢰와 정산이 한곳.", href: "/offer/platform" },
      { label: "커스텀어벗", line: "규격 다음의 CNC.", href: "/offer/custom-abutment" },
    ],
    faq: [
      {
        q: "심플웨이는 무엇인가요?",
        a: "심플 힐링을 스캔해 올리고, 심플어벗과 보철로 이어지는 흐름입니다.",
      },
      {
        q: "Hex와 Non-Hex가 있나요?",
        a: "힐링과 심플어벗 모두 Hex · Non-Hex입니다. 판매가는 각 ₩15,400입니다.",
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
    highlights: [
      { icon: "request", label: "주문", line: "스캔이 올라오면 시작" },
      { icon: "lab", label: "디자인", line: "기공소가 올리면 가공" },
      { icon: "cnc", label: "CNC", line: "건마다 같은 공정" },
      { icon: "box", label: "출고", line: "주문한 기공소로" },
      { icon: "pay", label: "정산", line: "고시 단가로 정산" },
    ],
    scene: {
      title: "디자인이 곧 가공.",
      line: "올리는 순간 CNC가 시작.",
      visual: {
        kind: "photo",
        src: LANDING_CAD_PREVIEW,
        alt: "커스텀 어벗 CAD",
      },
    },
    products: [
      {
        name: "생산",
        line: "디자인은 기공소가 합니다.",
        price: "₩15,000",
        priceNote: "고시 · 1어벗",
        shipping: "박스당 ₩3,500",
        specs: ["부가세 없는 계산서", "기공소가 디자인", "완성품은 기공소로"],
        buy: { kind: "start", label: "의뢰하기" },
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗 CAD",
        },
      },
      {
        name: "디자인+생산",
        line: "디자인부터 가공까지.",
        price: "₩25,000",
        priceNote: "고시 · 1어벗",
        shipping: "박스당 ₩3,500",
        specs: ["부가세 없는 계산서", "디자인비 포함", "완성품은 기공소로"],
        buy: { kind: "start", label: "의뢰하기" },
        visual: ABUTMENT_VISUAL,
      },
    ],
    slides: [
      {
        title: "주문이 가공됩니다.",
        line: "애크로덴트 CNC로 이어집니다.",
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗 CAD",
        },
      },
      {
        title: "기공소가 받습니다.",
        line: "보철과 함께 치과로 갑니다.",
        visual: { kind: "workspace" },
      },
      {
        title: "대금은 나뉩니다.",
        line: "치과 수가는 기공소 수가.",
        visual: PAIR_VISUAL,
      },
    ],
    specs: [
      { label: "생산 고시", value: "₩15,000" },
      { label: "디자인+생산", value: "₩25,000" },
      { label: "배송", value: "박스당 ₩3,500" },
      { label: "계산서", value: "부가세 없음" },
    ],
    learn: [
      { label: "심플웨이", line: "규격 어벗부터.", href: "/offer/simple-way" },
      { label: "기공사업부", line: "보철을 이어서.", href: "/offer/lab" },
    ],
    faq: [
      {
        q: "가격은 얼마인가요?",
        a: "생산 ₩15,000, 디자인+생산 ₩25,000. 플랫폼 고시이고 1어벗 기준입니다.",
      },
      {
        q: "배송비는요?",
        a: "박스당 ₩3,500입니다. 이 대금은 부가세 없는 계산서입니다.",
      },
      {
        q: "완성품은 어디로 가나요?",
        a: "치과가 아니라 주문한 기공소로 갑니다. 보철과 함께 치과로 이어집니다.",
      },
      {
        q: "가공은 언제 시작되나요?",
        a: "작업시작 후, 그 기공소가 디자인을 올리는 순간 시작됩니다.",
      },
      {
        q: "치과가 내는 돈은요?",
        a: "치과가 내는 커스텀어벗 금액은 그 기공소 수가입니다. 생산 단가는 고시입니다.",
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
    highlights: [
      { icon: "lab", label: "기공실", line: "어벗츠가 직접 운영" },
      { icon: "start", label: "작업시작", line: "접수되면 보드에" },
      { icon: "crown", label: "보철", line: "크라운과 브리지" },
      { icon: "abutment", label: "연결", line: "어벗 다음이 끊기지 않음" },
      { icon: "ship", label: "출고", line: "치과로 배송은 무료" },
    ],
    scene: {
      title: "접수에서 출고까지.",
      line: "진행은 플랫폼과 같습니다.",
      visual: { kind: "workspace" },
    },
    products: [
      {
        name: "크라운",
        line: "치아당 기준가입니다.",
        price: "₩60,000",
        priceNote: "치아당 · 기준가",
        shipping: "배송 무료",
        specs: ["의뢰 시 수가 확정", "어벗츠 기공사업부", "치과 배송은 무료"],
        buy: { kind: "start", label: "의뢰하기" },
        visual: ABUTMENT_VISUAL,
      },
      {
        name: "인레이",
        line: "치아당 기준가입니다.",
        price: "₩50,000",
        priceNote: "치아당 · 기준가",
        shipping: "배송 무료",
        specs: ["의뢰 시 수가 확정", "자동매칭 기준가", "치과 배송은 무료"],
        buy: { kind: "start", label: "의뢰하기" },
        visual: { kind: "workspace" },
      },
    ],
    slides: [
      {
        title: "어벗츠의 기공소.",
        line: "보철을 직접 만듭니다.",
        visual: { kind: "workspace" },
      },
      {
        title: "심플어벗 다음.",
        line: "보철이 같은 흐름입니다.",
        visual: ABUTMENT_VISUAL,
      },
      {
        title: "커스텀어벗 다음.",
        line: "도착하면 보철로 넘깁니다.",
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗",
        },
      },
    ],
    specs: [
      { label: "크라운", value: "₩60,000" },
      { label: "인레이", value: "₩50,000" },
      { label: "단위", value: "치아당 기준" },
      { label: "배송", value: "무료" },
    ],
    learn: [
      { label: "플랫폼", line: "의뢰하고 진행을 봅니다.", href: "/offer/platform" },
      { label: "커스텀어벗", line: "CNC 다음이 보철.", href: "/offer/custom-abutment" },
    ],
    faq: [
      {
        q: "기공사업부는 무엇인가요?",
        a: "어벗츠 주식회사 안의 기공소입니다. 치과 의뢰를 직접 받아 보철을 만듭니다.",
      },
      {
        q: "가격은 확정인가요?",
        a: "크라운 ₩60,000, 인레이 ₩50,000은 치아당 기준가입니다. 실제 수가는 의뢰할 때 확정됩니다.",
      },
      {
        q: "배송비는요?",
        a: "치과와 기공소 사이 배송은 무료입니다.",
      },
      {
        q: "어떤 케이스를 맡나요?",
        a: "심플어벗을 고른 케이스와, CNC 커스텀어벗이 도착한 케이스의 보철입니다.",
      },
      {
        q: "진행은 어디서 보나요?",
        a: "작업시작, 디자인, 출고가 플랫폼과 같은 화면에 남습니다.",
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
