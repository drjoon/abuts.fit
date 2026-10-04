// change-log:
// - 2026-10-05: CNC 카드 — 어벗 STL 업로드만으로 애크로덴트 CNC 생산이 시작된다는 설명.
// - 2026-10-04: 장점 카피 — 익명 강조 제거. 진행 가시성·스캔/작업물·채팅 중심으로.
// - 2026-10-04: `/offer/platform` 전용 카피 — 스캔/작업물 확인·채팅 소통 장점 + 실제 UI 캡처 3컷.
// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - web/frontend/src/features/landing/landingTheme.ts
//
// `/offer/platform` 전용 섹션 카피. 금액은 적지 않는다.
// 문장 배열은 한 칸 = 한 문장 = 한 줄(`<br />`).
import {
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
  | "lab";

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

export type PlatformExtraReason = {
  icon: PlatformIconKey;
  title: string;
  body: string[];
};

export type PlatformStep = {
  title: string;
  body: string;
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
  extras: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: PlatformExtraReason[];
  };
  audiences: {
    eyebrow: string;
    title: string;
    lead: string[];
  };
  steps: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: PlatformStep[];
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
    eyebrow: "WHY ABUTS PLATFORM",
    title: "치과와 기공소, 각자 써야 하는 이유.",
    lead: [
      "보내는 쪽과 받는 쪽, 가장 크게 달라지는 점만 꼽았습니다.",
    ],
    items: [
      {
        icon: "practice",
        label: "FOR PRACTICE · 치과",
        title: "거래 기공소를 골라 의뢰",
        body: [
          "거래하던 협력 기공소로도, 어벗츠기공소로도 의뢰합니다.",
          "진행 상태와 작업물은 전화 없이 목록에서 확인합니다.",
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

  extras: {
    eyebrow: "MORE REASONS",
    title: "행정은 어벗츠가, 생산까지 한 번에.",
    lead: ["협력 기공소든 어벗츠기공소든, 같은 방식으로 처리됩니다."],
    items: [
      {
        icon: "credit",
        title: "크레딧으로 결제",
        body: [
          "기공·커스텀어벗·스토어를 같은 크레딧으로 씁니다.",
          "선결제금은 어벗츠 계좌로 입금됩니다.",
        ],
      },
      {
        icon: "board",
        title: "정산·계산서는 어벗츠에서",
        body: [
          "치과, 기공소 모두 일일이 의뢰 내역을 확인할 필요 없습니다.",
          "특히 기공소는 치과별 정산 및 계산서 발행까지 자동으로 처리됩니다.",
        ],
      },
      {
        icon: "cnc",
        title: "디자인에서 CNC 생산까지",
        body: [
          "어벗 STL을 업로드하기만 하면 자동으로 애크로덴트의 CNC 커스텀어벗 생산이 시작됩니다.",
        ],
      },
    ],
  },

  audiences: {
    eyebrow: "FOR PRACTICE · LAB",
    title: "치과와 기공소, 각자 필요한 화면.",
    lead: [
      "보내는 쪽과 받는 쪽이 같은 케이스를 봅니다.",
      "역할만 다를 뿐입니다.",
    ],
  },

  steps: {
    eyebrow: "HOW IT WORKS",
    title: "의뢰부터 납품까지, 네 단계.",
    lead: ["케이스에 필요한 과정만 짧게 이어 두었습니다."],
    items: [
      {
        title: "구강스캔·의뢰 등록",
        body: "치과가 스캔과 요청을 플랫폼으로 보냅니다.",
      },
      {
        title: "기공소 작업·소통",
        body: "기공소가 확인하고, 이슈는 그 케이스 채팅에서 나눕니다.",
      },
      {
        title: "커스텀어벗",
        body: "어벗 STL을 올리면 애크로덴트 CNC 생산이 시작됩니다.",
      },
      {
        title: "검수·납품",
        body: "작업물을 확인하고 치과로 납품합니다.",
      },
    ],
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
          "크레딧 선결제금은 어벗츠 계좌로 입금되고, 매달 어벗츠가 기공소로 정산해 지급합니다.",
          "계산서는 어벗츠가 치과에 발급하고, 협력 기공소는 어벗츠에 발급합니다.",
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
