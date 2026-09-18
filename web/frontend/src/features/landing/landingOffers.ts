// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §1.5–§2.6 · web/frontend/rules.md (기공의뢰·정산·스토어)
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

export type OfferSection = {
  title: string;
  body: string;
  visual: OfferVisual;
};

export type LandingOffer = {
  slug: string;
  navLabel: string;
  punch: string;
  line: string;
  lead: string;
  tile: OfferVisual;
  sections: OfferSection[];
};

const PROSTHETIC_KIT = "/store/acrodent/prosthetic-kit.jpg";

export const landingOffers: LandingOffer[] = [
  {
    slug: "platform",
    navLabel: "플랫폼",
    punch: "의뢰, 정산, 배송.",
    line: "치과와 기공소가 같은 화면에서 끝냅니다.",
    lead: "기공의뢰서, 정산과 계산서, 배송 확인. 제품 구매까지 한 계정입니다.",
    tile: { kind: "workspace" },
    sections: [
      {
        title: "메신저 대신, 의뢰서.",
        body: "치과가 스캔과 보철을 올립니다. 기공소를 지정하거나, 인증된 기공소에 자동으로 맡깁니다. 진행은 의뢰, 작업시작, 디자인, 출고로 같은 화면에 남고, 채팅도 그 옆입니다.",
        visual: { kind: "workspace" },
      },
      {
        title: "돈도 같은 기록.",
        body: "결제는 크레딧입니다. 선불페이가 아니라, 기공·커스텀어벗·스토어에만 쓰는 거래 선수금입니다. 기공과 커스텀어벗은 부가세 없는 계산서, 스토어 기성품은 부가세 포함 세금계산서. 월말에 각각 따로 나갑니다. 지정 의뢰는 플랫폼 수수료가 없고, 자동매칭은 작업이 끝난 뒤 기공비에서만 빠집니다. 월 참여비는 없습니다.",
        visual: {
          kind: "blank",
          caption: "크레딧 잔액과 월말 계산서·세금계산서가 나란히 보이는 화면",
        },
      },
      {
        title: "어디로 가는지 보입니다.",
        body: "치과와 기공소 사이 배송은 무료입니다. 출고와 추적은 의뢰서와 같은 화면에서 확인합니다.",
        visual: {
          kind: "blank",
          caption: "출고 예정과 배송 추적이 의뢰 카드에 붙은 화면",
        },
      },
      {
        title: "제품은 스토어에서.",
        body: "심플 힐링, 심플어벗, 시술 키트를 같은 계정으로 삽니다. 가격은 부가세 포함이고, 기공 결제와 스토어 결제는 나누어 진행합니다.",
        visual: {
          kind: "pair",
          items: [
            {
              src: LANDING_CASE_HEALING,
              alt: "심플 힐링 어벗",
              caption: "심플 힐링 어벗",
            },
            {
              src: LANDING_CASE_KIT,
              alt: "Surgical Kit",
              caption: "Surgical Kit",
            },
          ],
        },
      },
    ],
  },
  {
    slug: "simple-way",
    navLabel: "심플웨이",
    punch: "스캔하면 시작.",
    line: "힐링에서 심플어벗, 보철 기공까지.",
    lead: "심플 힐링 어벗을 구강 스캔해 올리면, 어벗 선택과 보철이 한 흐름입니다.",
    tile: {
      kind: "pair",
      items: [
        {
          src: LANDING_CASE_HEALING,
          alt: "심플 힐링 어벗",
          caption: "심플 힐링 어벗",
        },
        {
          src: LANDING_CASE_ABUTMENT,
          alt: "심플어벗",
          caption: "심플어벗",
        },
      ],
    },
    sections: [
      {
        title: "짧게 심고, 짧게 고릅니다.",
        body: "심플 힐링 어벗과 심플어벗은 Hex·Non-Hex로 나뉩니다. 시술은 Surgical Kit, 보철 체결은 Prosthetic Kit. 제조는 (주)애크로덴트입니다.",
        visual: {
          kind: "pair",
          items: [
            {
              src: LANDING_CASE_HEALING,
              alt: "심플 힐링 어벗",
              caption: "심플 힐링 어벗",
            },
            {
              src: LANDING_CASE_ABUTMENT,
              alt: "심플어벗",
              caption: "심플어벗",
            },
          ],
        },
      },
      {
        title: "힐링을 스캔해 올리면.",
        body: "구강에 체결한 심플 힐링 어벗을 스캔해 플랫폼에 올립니다. 그다음 규격 심플어벗을 고르거나, 커스텀어벗 제작으로 넘깁니다.",
        visual: {
          kind: "blank",
          caption: "구강에 체결된 심플 힐링 어벗을 스캔하는 장면",
        },
      },
      {
        title: "키트는 두 가지.",
        body: "Surgical Kit는 식립, Prosthetic Kit는 치은 형성과 어벗 체결입니다. 스토어에서 키트와 어벗을 먼저 갖춥니다.",
        visual: {
          kind: "pair",
          items: [
            {
              src: LANDING_CASE_KIT,
              alt: "Surgical Kit",
              caption: "Surgical Kit",
            },
            {
              src: PROSTHETIC_KIT,
              alt: "Prosthetic Kit",
              caption: "Prosthetic Kit",
            },
          ],
        },
      },
      {
        title: "보철은 기공으로.",
        body: "어벗이 정해지면 크라운·브리지 같은 보철이 같은 의뢰서에서 이어집니다. 기공사업부나 지정 기공소가 그 다음을 맡습니다.",
        visual: {
          kind: "blank",
          caption: "심플어벗 위에 보철이 올라간 완성 케이스",
        },
      },
    ],
  },
  {
    slug: "custom-abutment",
    navLabel: "커스텀어벗",
    punch: "일정한 품질의 CNC 어벗.",
    line: "플랫폼 주문이 가공이 됩니다.",
    lead: "플랫폼과 연계된 자동화 공정으로, 균일한 품질의 CNC 커스텀 어벗을 만듭니다.",
    tile: {
      kind: "photo",
      src: LANDING_CAD_PREVIEW,
      alt: "커스텀 어벗 CAD",
    },
    sections: [
      {
        title: "주문이 가공이 됩니다.",
        body: "스캔이 올라온 의뢰가 애크로덴트 CNC로 이어집니다. 건마다 같은 공정이라 품질이 균일합니다.",
        visual: {
          kind: "photo",
          src: LANDING_CAD_PREVIEW,
          alt: "커스텀 어벗 CAD 프리뷰",
        },
      },
      {
        title: "기공소가 디자인하면, 바로 깎습니다.",
        body: "작업시작과 함께 스캔 기준으로 제작이 열립니다. 그 기공소가 디자인을 올리는 순간 가공이 자동으로 시작됩니다.",
        visual: {
          kind: "blank",
          caption: "기공소가 디자인을 올리고 가공이 시작되는 화면",
        },
      },
      {
        title: "만든 뒤, 주문한 기공소로.",
        body: "완성품은 치과로 바로 가지 않고 주문한 기공소가 받습니다. 보철과 함께 치과로 이어집니다.",
        visual: {
          kind: "blank",
          caption: "CNC로 가공된 커스텀 어벗이 출고되는 장면",
        },
      },
      {
        title: "대금은 나뉘어 있습니다.",
        body: "치과가 내는 커스텀어벗 금액은 그 기공소 수가입니다. 생산 단가는 플랫폼에 고시되어 있고, 기공소가 어벗츠와 정산합니다. 배송비는 박스당이며, 이 대금은 부가세 없는 계산서입니다.",
        visual: {
          kind: "blank",
          caption: "커스텀어벗 고시 단가와 박스당 배송비가 보이는 안내",
        },
      },
    ],
  },
  {
    slug: "lab",
    navLabel: "기공사업부",
    punch: "보철을 이어서.",
    line: "어벗츠 제품으로 이어지는 기공.",
    lead: "어벗츠가 직접 운영하는 기공소입니다. 어벗츠 제품 다음의 보철을 맡습니다.",
    tile: {
      kind: "blank",
      caption: "기공실에서 보철을 작업하는 사진",
    },
    sections: [
      {
        title: "어벗츠의 기공소.",
        body: "기공사업부는 어벗츠 주식회사 안의 기공소입니다. 치과 의뢰를 직접 받아 보철을 만들고, 기공료를 받습니다.",
        visual: {
          kind: "blank",
          caption: "어벗츠 기공실 전경",
        },
      },
      {
        title: "접수에서 출고까지.",
        body: "의뢰가 오면 작업시작으로 보드에 올립니다. 디자인과 제작을 거쳐 출고하고, 진행은 플랫폼과 같은 화면에서 봅니다.",
        visual: { kind: "workspace" },
      },
      {
        title: "어벗츠 제품이 그대로 이어집니다.",
        body: "심플어벗을 고른 케이스도, CNC 커스텀어벗이 도착한 케이스도, 보철 기공으로 넘어갑니다. 제품과 기공이 다른 업체에서 끊기지 않습니다.",
        visual: {
          kind: "blank",
          caption: "심플어벗 또는 커스텀어벗에 보철이 연결된 완성물",
        },
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
