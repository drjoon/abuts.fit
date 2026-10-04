// change-log:
// - 2026-10-05: 장점 — 기존 기공소와 다른 두 가지(구강스캔 특화 · AI 지향). FIT TOGETHER 제외.
// - 2026-10-05: 장점 카피 — 구강스캔 도입 도움·호흡, AI는 전부가 아님.
// - 2026-10-05: 구강스캔 특화 · 맞춤 소통 · AI+검수 축으로 리팩터. 생성 이미지 3컷.
// - 2026-09-30: 커스텀어벗 장점 카드 카피 — 업로드 시 CNC 자동 생산, 심플웨이 규격 호환.
// - 2026-09-30: 기공서비스 카피 「3D 스캔」→「구강 스캔」(장점 카드·FAQ).
// - 2026-09-29: 기공서비스 오퍼 리팩터 — AI 디자인 · 스토어/기공 하나의 크레딧 · 플랫폼 · 커스텀어벗 연동을 장점으로 재구성.
//   「미리 충전하는 방식이 아닙니다」 카피 제거(크레딧=B2B 거래 선수금, 사용분 월합 계산서).
// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/LabOfferSections.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - rules.md §0.6 (AI 디자인) · §2.3 (크레딧/정산) · §2.4 (PTX)
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts (크레딧 정의·환불·계산서 SSOT)
//
// `/offer/lab` 전용 섹션 카피. 금액은 적지 않는다(단가 SSOT는 관리자 설정·PricingPolicyDialog).
// 문장 배열은 한 칸 = 한 문장 = 한 줄(`<br />`).
import {
  LANDING_LAB_AI_REVIEW,
  LANDING_LAB_ORAL_SCAN,
} from "./landingAssets";

export type LabIconKey =
  | "ai"
  | "align"
  | "axis"
  | "margin"
  | "scanbody"
  | "crown"
  | "check"
  | "design"
  | "save";

export type LabAdvantage = {
  icon: LabIconKey;
  label: string;
  title: string;
  body: string[];
  tags: string[];
};

export type LabStory = {
  name: string;
  line: string;
  body: string[];
  image: { src: string; alt: string };
};

export type LabStep = {
  icon: LabIconKey;
  title: string;
  line: string;
};

export type LabOfferExtras = {
  hero: {
    title: string[];
    body: string[];
    /** 스캔 캔버스 위 상태 뱃지 */
    hud: string;
  };
  advantages: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: LabAdvantage[];
  };
  stories: {
    eyebrow: string;
    title: string;
    lead: string[];
    items: LabStory[];
  };
  ai: {
    eyebrow: string;
    title: string[];
    lead: string[];
    steps: LabStep[];
    points: Array<{ icon: LabIconKey; title: string; line: string }>;
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

export const LAB_OFFER_EXTRAS: LabOfferExtras = {
  hero: {
    title: ["구강스캔에 진심인 치과와", "맞습니다."],
    body: [
      "어벗츠기공소는 구강스캔 의뢰에 특화되어 있습니다.",
      "스캔 데이터가 쌓일수록, 더 잘 맞는 보철을 만듭니다.",
    ],
    hud: "ORAL SCAN",
  },

  advantages: {
    eyebrow: "WHY ABUTS LAB",
    title: "기존 기공소와 다른 두 가지.",
    lead: [
      "구강스캔 데이터 경험을 쌓았습니다.",
      "시작하는 치과에도, 이미 잘 쓰는 치과에도 맞춥니다.",
    ],
    items: [
      {
        icon: "align",
        label: "ORAL SCAN",
        title: "구강스캔 의뢰에 특화",
        body: [
          "어벗츠기공소는 구강스캔 데이터 경험을 쌓았습니다.",
          "구강스캔 도입을 꺼려하시는 치과에 도움을 드릴 수 있습니다.",
          "이미 구강스캔을 잘 쓰시는 치과는 호흡이 잘 맞습니다.",
        ],
        tags: ["구강스캔", "도입 도움", "호흡"],
      },
      {
        icon: "ai",
        label: "AI DESIGN",
        title: "AI 디자인을 지향합니다",
        body: [
          "아직 AI가 모든 일을 하지 않습니다.",
          "사람의 검수와 수작업이 필요합니다만,",
          "치과와의 시간이 쌓일수록 작업 결과가 정확하고 빨라집니다.",
        ],
        tags: ["검수", "수작업", "경험 축적"],
      },
    ],
  },

  stories: {
    eyebrow: "HOW WE WORK",
    title: "구강스캔과 AI가 한 흐름입니다.",
    lead: ["시작하는 치과에도, 이미 잘 쓰는 치과에도 맞춥니다."],
    items: [
      {
        name: "구강스캔 의뢰에 특화",
        line: "스캔 데이터를 다루는 경험이 많습니다.",
        body: [
          "구강스캔 도입을 꺼려하시는 치과에 도움을 드릴 수 있습니다.",
          "이미 구강스캔을 잘 쓰시는 치과는 호흡이 잘 맞습니다.",
        ],
        image: {
          src: LANDING_LAB_ORAL_SCAN,
          alt: "구강스캐너와 3D 악궁 스캔",
        },
      },
      {
        name: "AI가 잡고, 사람이 확인합니다",
        line: "아직 AI가 모든 일을 하지 않습니다.",
        body: [
          "사람의 검수와 수작업이 필요합니다만,",
          "치과와의 시간이 쌓일수록 작업 결과가 정확하고 빨라집니다.",
        ],
        image: {
          src: LANDING_LAB_AI_REVIEW,
          alt: "AI 디자인 화면을 기공사가 검수하는 모습",
        },
      },
    ],
  },

  ai: {
    eyebrow: "AI DESIGN",
    title: ["의뢰서 값으로 시작하고,", "사람이 마칩니다."],
    lead: [
      "환자·임플란트·보철·스캔은 의뢰서에 이미 있습니다.",
      "AI가 초안을 잡고, 기공사가 검수하고 다듬습니다.",
    ],
    steps: [
      {
        icon: "align",
        title: "스캔 정렬",
        line: "상·하악과 바이트 스캔을 자동으로 맞춥니다.",
      },
      {
        icon: "axis",
        title: "삽입축",
        line: "삽입축을 자동으로 잡고, 화면을 보며 직접 다듬을 수 있습니다.",
      },
      {
        icon: "margin",
        title: "마진",
        line: "치아와 잇몸이 갈라지는 곳을 마진으로 잡고, 점과 펜으로 고칩니다.",
      },
      {
        icon: "scanbody",
        title: "스캔바디 매칭",
        line: "의뢰 임플란트에 맞는 스캔바디와 심플어벗 형상을 골라 겹칩니다.",
      },
      {
        icon: "crown",
        title: "보철 생성",
        line: "크라운·브리지·인레이·온레이를 만들고 기공소 프리셋 값을 적용합니다.",
      },
      {
        icon: "check",
        title: "검수 · 밀링",
        line: "언더컷·교합·두께를 사람이 확인하고 밀링 배치까지 마칩니다.",
      },
    ],
    points: [
      {
        icon: "check",
        title: "사람의 검수",
        line: "AI 초안을 기공사가 보고 맞는지 확인합니다.",
      },
      {
        icon: "design",
        title: "필요한 수작업",
        line: "마진·교합처럼 아직 손이 가는 구간이 있습니다.",
      },
      {
        icon: "save",
        title: "쌓이는 경험",
        line: "치과와의 시간이 쌓일수록 작업 결과가 정확하고 빨라집니다.",
      },
    ],
  },

  faq: {
    eyebrow: "FAQ",
    heading: "자주 묻는 질문",
    items: [
      {
        q: "어벗츠기공소는 한마디로 뭔가요?",
        a: [
          "어벗츠가 운영하는 기공소입니다.",
          "구강스캔 의뢰에 특화되어 있고, AI 디자인과 커스텀어벗 납품까지 이어집니다.",
        ],
      },
      {
        q: "기존 기공소와 무엇이 다른가요?",
        a: [
          "구강스캔 의뢰에 특화되어 있습니다.",
          "AI 디자인을 지향하고, 사람이 검수합니다.",
        ],
      },
      {
        q: "러버모델(석고모델)도 받나요?",
        a: [
          "러버모델은 거래하던 협력 기공소로 보내는 것이 맞습니다.",
          "어벗츠기공소는 구강스캔 의뢰에 집중합니다.",
        ],
      },
      {
        q: "AI 디자인은 완전 자동인가요?",
        a: [
          "아직 AI가 모든 일을 하지 않습니다.",
          "사람의 검수와 수작업이 필요합니다만,",
          "치과와의 시간이 쌓일수록 작업 결과가 정확하고 빨라집니다.",
        ],
      },
      {
        q: "거래하던 기공소와도 쓸 수 있나요?",
        a: [
          "네. 거래하던 기공소는 협력 기공소로 그대로 이용합니다.",
          "구강스캔 의뢰는 어벗츠기공소에도 보낼 수 있습니다.",
        ],
      },
    ],
  },

  closing: {
    eyebrow: "START ABUTS LAB",
    title: "구강스캔에 진심이라면, 여기서 맞춥니다.",
    body: [
      "구강스캔 의뢰에 특화되어 있습니다.",
      "케이스가 쌓일수록 AI 디자인도 정확하고 빨라집니다.",
    ],
  },
};
