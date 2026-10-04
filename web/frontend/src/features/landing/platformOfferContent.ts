// change-log:
// - 2026-10-05: 중복 섹션 통폐합 — extras·audiences 제거. 크레딧/CNC는 credit·pipeline, 대상은 glance에 통합.
// - 2026-10-05: 커스텀어벗 플로우·하나의 크레딧 섹션을 기공소 오퍼에서 이 페이지로 이동.
// - 2026-10-05: CNC 카드 — 어벗 STL 업로드만으로 애크로덴트 CNC 생산이 시작된다는 설명.
// - 2026-10-04: 장점 카피 — 익명 강조 제거. 진행 가시성·스캔/작업물·채팅 중심으로.
// - 2026-10-04: `/offer/platform` 전용 카피 — 스캔/작업물 확인·채팅 소통 장점 + 실제 UI 캡처 3컷.
// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts (크레딧 정의·환불·계산서 SSOT)
//
// `/offer/platform` 전용 섹션 카피. 금액은 적지 않는다.
// 문장 배열은 한 칸 = 한 문장 = 한 줄(`<br />`).
import {
  LANDING_CUSTOM_TRACKING,
  LANDING_PLATFORM_INBOX_CHAT,
  LANDING_PLATFORM_SCAN_CHAT,
  LANDING_PLATFORM_WORK_VIEWER,
} from "./landingAssets";

export type PlatformIconKey =
  | "status"
  | "scan"
  | "chat"
  | "partner"
  | "credit"
  | "cnc"
  | "board"
  | "practice"
  | "lab"
  | "request"
  | "start"
  | "design"
  | "ship"
  | "custom"
  | "store"
  | "labFee"
  | "infinity"
  | "refund"
  | "receipt"
  | "settle";

export type PlatformAdvantage = {
  icon: PlatformIconKey;
  label: string;
  title: string;
  body: string[];
  tags: string[];
};

export type PlatformStory = {
  name: string;
  line: string;
  body: string[];
  image: { src: string; alt: string };
};

export type PlatformFlowStep = {
  icon: PlatformIconKey;
  title: string;
  line: string;
};

export type PlatformCreditSpoke = {
  icon: PlatformIconKey;
  label: string;
  line: string;
  tag: string;
};

export type PlatformCreditFact = {
  icon: PlatformIconKey;
  title: string;
  body: string[];
};

export type PlatformOfferExtras = {
  hero: {
    title: string[];
    body: string[];
    hud: string;
    image: { src: string; alt: string };
  };
  glance: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: PlatformAdvantage[];
  };
  stories: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: PlatformStory[];
  };
  pipeline: {
    eyebrow: string;
    title: string;
    lead: string[];
    steps: PlatformFlowStep[];
    image: { src: string; alt: string };
    notes: string[];
  };
  credit: {
    eyebrow: string;
    title: string;
    lead: string[];
    hubLabel: string;
    hubNote: string;
    spokes: PlatformCreditSpoke[];
    facts: PlatformCreditFact[];
    notice: string;
  };
  glossary: {
    title: string;
    lead: string;
    items: Array<{ term: string; line: string }>;
  };
  faq: {
    eyebrow: string;
    heading: string;
    items: Array<{ q: string; a: string[] }>;
  };
  closing: {
    eyebrow: string;
    title: string;
    body: string[];
  };
};

export const PLATFORM_OFFER_EXTRAS: PlatformOfferExtras = {
  hero: {
    title: ["치과와 기공소를", "한 화면에서 잇습니다."],
    body: [
      "의뢰·스캔·작업물·채팅이 같은 케이스로 이어집니다.",
      "진행을 묻지 않아도, 지금 어디인지 보입니다.",
    ],
    hud: "LIVE CASE",
    image: {
      src: LANDING_PLATFORM_INBOX_CHAT,
      alt: "기공의뢰 목록과 채팅이 한 화면인 어벗츠 플랫폼",
    },
  },

  glance: {
    eyebrow: "FOR PRACTICE · LAB",
    title: "치과와 기공소, 각자 필요한 화면.",
    lead: [
      "보내는 쪽과 받는 쪽이 같은 케이스를 봅니다.",
      "역할에 맞게 달라지는 점만 꼽았습니다.",
    ],
    items: [
      {
        icon: "practice",
        label: "FOR PRACTICE · 치과",
        title: "거래 기공소를 골라 의뢰",
        body: [
          "협력 기공소로도, 어벗츠기공소로도 의뢰합니다.",
          "진행·작업물·출고는 전화 없이 목록에서 확인합니다.",
        ],
        tags: ["협력 기공소", "어벗츠기공소", "상태 보드"],
      },
      {
        icon: "lab",
        label: "FOR LAB · 기공소",
        title: "되묻지 않고 바로 작업",
        body: [
          "스캔·요청·채팅이 한 케이스로 도착합니다.",
          "수정 요청은 스캔 위에 그린 그림으로 받습니다.",
        ],
        tags: ["케이스 단위 수신", "채팅 첨부", "3D 뷰어"],
      },
    ],
  },

  stories: {
    eyebrow: "SEE IT IN THE APP",
    title: "실제 화면으로 보는 장점.",
    lead: ["지금 쓰는 화면과 같은 흐름입니다."],
    items: [
      {
        name: "어벗·보철, 언제든 확인.",
        line: "작업물이 올라오면 바로 엽니다.",
        body: [
          "어벗과 보철 STL을 같은 뷰어에서 봅니다.",
          "투명도와 치아 번호로 필요한 부분만 확인합니다.",
        ],
        image: {
          src: LANDING_PLATFORM_WORK_VIEWER,
          alt: "어벗·보철 3D 작업물 뷰어",
        },
      },
      {
        name: "스캔을 보고, 그림으로 말합니다.",
        line: "채팅 첨부로 바로 전달.",
        body: [
          "구강 스캔 위에 표시한 그림을 채팅에 붙입니다.",
          "말로만 설명하던 수정 요청이 화면으로 남습니다.",
        ],
        image: {
          src: LANDING_PLATFORM_SCAN_CHAT,
          alt: "구강 스캔 뷰어와 채팅 첨부",
        },
      },
      {
        name: "진행과 채팅이 한곳.",
        line: "상태 옆에서 바로 묻고 답합니다.",
        body: [
          "목록에서 케이스를 고르면 진행이 바로 보입니다.",
          "같은 화면에서 기공소와 대화를 이어갑니다.",
        ],
        image: {
          src: LANDING_PLATFORM_INBOX_CHAT,
          alt: "기공의뢰 목록과 케이스 채팅",
        },
      },
    ],
  },

  pipeline: {
    eyebrow: "CUSTOM ABUTMENT FLOW",
    title: "커스텀어벗, 의뢰부터 납품까지 한 줄로.",
    lead: [
      "디자인을 올리는 순간 생산이 시작됩니다.",
      "치과 도착일에서 거꾸로 출고일을 잡아 일정도 맞춥니다.",
    ],
    steps: [
      { icon: "request", title: "의뢰", line: "치과가 스캔과 요청을 보냅니다." },
      { icon: "start", title: "작업시작", line: "기공소가 받아 작업을 시작합니다." },
      { icon: "design", title: "디자인", line: "어벗 디자인을 마치고 올립니다." },
      {
        icon: "cnc",
        title: "CNC 생산",
        line: "업로드하면 애크로덴트 생산이 자동으로 시작됩니다.",
      },
      { icon: "ship", title: "납품", line: "어벗과 보철이 함께 치과로 나갑니다." },
    ],
    image: { src: LANDING_CUSTOM_TRACKING, alt: "커스텀어벗 CNC 추적관리" },
    notes: [
      "단계별 진행이 의뢰서에 그대로 표시됩니다.",
      "같은 치과로 가는 건은 묶음 배송으로 모읍니다.",
    ],
  },

  credit: {
    eyebrow: "ONE CREDIT",
    title: "충전은 한 번, 결제·정산은 어벗츠에서.",
    lead: [
      "기공·커스텀어벗·스토어를 하나의 크레딧으로 결제합니다.",
      "선결제금은 어벗츠 계좌로 입금되고, 정산·계산서도 한곳에서 처리됩니다.",
    ],
    hubLabel: "크레딧",
    hubNote: "거래 선수금",
    spokes: [
      { icon: "labFee", label: "기공", line: "치과 기공의뢰", tag: "면세" },
      { icon: "custom", label: "커스텀어벗", line: "디자인·생산 대금", tag: "면세" },
      { icon: "store", label: "스토어", line: "심플웨이 등 기성품", tag: "과세" },
    ],
    facts: [
      {
        icon: "infinity",
        title: "사용기한 없음",
        body: ["충전한 크레딧에는 유효기간이 없습니다."],
      },
      {
        icon: "refund",
        title: "미사용 잔액 환불",
        body: ["쓰지 않은 유료 크레딧은 요청 시 전액 환불됩니다."],
      },
      {
        icon: "receipt",
        title: "사용분 월합 계산서",
        body: [
          "충전 때는 발행하지 않고, 사용분을 월합으로 발행합니다.",
          "기공·어벗은 면세 계산서, 스토어는 과세 세금계산서로 나눕니다.",
        ],
      },
      {
        icon: "settle",
        title: "기공소는 정산과 상계",
        body: [
          "치과별 정산·계산서 발행까지 자동으로 처리됩니다.",
          "정산으로 쌓인 기공크레딧으로 어벗 주문도 결제할 수 있습니다.",
        ],
      },
    ],
    notice: "크레딧은 선불페이가 아닌 B2B 거래 선수금(예치금)입니다.",
  },

  glossary: {
    title: "헷갈리는 용어, 한 줄로 정리.",
    lead: "플랫폼에서 자주 나오는 말만 짧게 풀어 두었습니다.",
    items: [
      {
        term: "기공의뢰",
        line: "치과가 기공소로 보내는 케이스예요. 스캔·요청·채팅이 함께 갑니다.",
      },
      {
        term: "케이스 채팅",
        line: "그 의뢰서 옆에서 파일·그림·문의가 남는 대화예요.",
      },
      {
        term: "협력 기공소",
        line: "치과가 거래하던 기공소예요. 지정하면 그 기공소의 수가로 진행돼요.",
      },
      {
        term: "어벗츠기공소",
        line: "어벗츠가 운영하는 기공소예요. AI 디자인과 커스텀어벗을 맡습니다.",
      },
      {
        term: "크레딧",
        line: "기공·커스텀어벗·스토어를 함께 결제하는 거래 선수금이에요. 선결제금은 어벗츠 계좌로 입금돼요.",
      },
      {
        term: "애크로덴트",
        line: "어벗츠 제품을 만드는 제조사예요. CNC 생산을 맡습니다.",
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    heading: "자주 묻는 질문",
    items: [
      {
        q: "어벗츠 플랫폼은 무엇인가요?",
        a: [
          "치과와 기공소가 기공 의뢰·스캔·작업물·채팅을 한곳에서 이어가는 워크플로우입니다.",
        ],
      },
      {
        q: "스캔과 작업물은 어디서 보나요?",
        a: [
          "해당 기공의뢰의 뷰어에서 구강 스캔과 어벗·보철을 엽니다.",
          "업로드되면 언제든 다시 확인할 수 있습니다.",
        ],
      },
      {
        q: "기공소와는 어떻게 소통하나요?",
        a: [
          "케이스 채팅에서 문의·파일·그림을 주고받습니다.",
          "뷰어의 「채팅 첨부」로 표시한 화면을 바로 보낼 수 있습니다.",
        ],
      },
      {
        q: "기존에 거래하던 기공소도 이용할 수 있나요?",
        a: [
          "네. 거래하던 기공소는 협력 기공소로 그대로 이용합니다.",
          "의뢰할 때 기공소를 지정하면 그 기공소의 수가로 진행됩니다.",
        ],
      },
      {
        q: "협력 기공소와 어벗츠기공소는 무엇이 다른가요?",
        a: [
          "플랫폼 사용에는 둘 다 제한이 없습니다.",
          "어벗츠기공소는 AI 디자인부터 커스텀어벗 납품까지 맡아 수행합니다.",
        ],
      },
      {
        q: "기공비 결제와 계산서는 어떻게 되나요?",
        a: [
          "크레딧 선결제금은 어벗츠 계좌로 입금됩니다.",
          "충전할 때는 발행하지 않고, 사용한 금액을 월합으로 면세 계산서(기공·어벗)와 과세 세금계산서(스토어)로 나눕니다.",
        ],
      },
      {
        q: "크레딧은 스토어에서도 쓸 수 있나요?",
        a: [
          "네. 크레딧(거래 선수금)은 기공·커스텀어벗·스토어 기성품 대금에 함께 씁니다.",
          "선불페이가 아니며, 쓰지 않은 유료 크레딧은 요청 시 환불됩니다.",
        ],
      },
      {
        q: "커스텀어벗은 어떻게 만들어지나요?",
        a: [
          "기공소가 디자인을 업로드하면 애크로덴트 CNC 생산이 자동으로 시작됩니다.",
          "완성된 어벗은 보철과 함께 치과로 나갑니다.",
        ],
      },
    ],
  },

  closing: {
    eyebrow: "START WITH ABUTS",
    title: "같은 케이스를, 같은 화면에서 시작하세요.",
    body: [
      "의뢰부터 스캔·작업물·채팅까지 한곳에서 이어집니다.",
      "도입이 궁금하시면 상담으로 안내해 드립니다.",
    ],
  },
};
