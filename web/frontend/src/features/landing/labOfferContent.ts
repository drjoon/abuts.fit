// change-log:
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
import { LANDING_CUSTOM_TRACKING } from "./landingAssets";

export type LabIconKey =
  | "ai"
  | "credit"
  | "platform"
  | "custom"
  | "align"
  | "axis"
  | "margin"
  | "scanbody"
  | "crown"
  | "check"
  | "request"
  | "start"
  | "design"
  | "cnc"
  | "ship"
  | "lab"
  | "store"
  | "infinity"
  | "refund"
  | "receipt"
  | "settle"
  | "preset"
  | "save"
  | "chat";

export type LabAdvantage = {
  icon: LabIconKey;
  label: string;
  title: string;
  body: string[];
  tags: string[];
};

export type LabStep = {
  icon: LabIconKey;
  title: string;
  line: string;
};

export type LabCreditSpoke = {
  icon: LabIconKey;
  label: string;
  line: string;
  tag: string;
};

export type LabCreditFact = {
  icon: LabIconKey;
  title: string;
  body: string[];
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
  ai: {
    eyebrow: string;
    title: string[];
    lead: string[];
    steps: LabStep[];
    points: Array<{ icon: LabIconKey; title: string; line: string }>;
  };
  pipeline: {
    eyebrow: string;
    title: string;
    lead: string[];
    steps: LabStep[];
    image: { src: string; alt: string };
    notes: string[];
  };
  credit: {
    eyebrow: string;
    title: string;
    lead: string[];
    hubLabel: string;
    hubNote: string;
    spokes: LabCreditSpoke[];
    facts: LabCreditFact[];
    notice: string;
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
    title: ["AI 디자인부터", "커스텀어벗 납품까지"],
    body: [
      "스캔만 올리면 디자인·생산·배송이 이어지고,",
      "스토어와 같은 크레딧으로 결제합니다.",
    ],
    hud: "AI SCAN",
  },

  advantages: {
    eyebrow: "WHY LAB SERVICE",
    title: "기공서비스를 고르는 네 가지 이유.",
    lead: [
      "기능을 늘어놓지 않았습니다.",
      "치과 의뢰가 막힘없이 끝나는 데 필요한 것만 담았습니다.",
    ],
    items: [
      {
        icon: "ai",
        label: "AI-POWERED 디자인",
        title: "의뢰서에서 바로 시작하는 AI 디자인",
        body: [
          "스캔 정렬·삽입축·마진·스캔바디를 자동으로 잡습니다.",
          "기공사는 확인하고 다듬기만 합니다.",
        ],
        tags: ["스캔 정렬", "삽입축", "마진", "스캔바디"],
      },
      {
        icon: "credit",
        label: "ONE CREDIT",
        title: "스토어도 기공도, 하나의 크레딧",
        body: [
          "기공·커스텀어벗·스토어 기성품을",
          "같은 크레딧으로 결제합니다.",
        ],
        tags: ["기공", "커스텀어벗", "스토어"],
      },
      {
        icon: "platform",
        label: "SMART PLATFORM",
        title: "의뢰서 한 장에 모두 담깁니다",
        body: [
          "스캔·요청·채팅·도착일이 한 화면에 남습니다.",
          "구강 스캔이 없어도 의뢰할 수 있습니다.",
        ],
        tags: ["진행 상황", "의뢰서 채팅", "도착일"],
      },
      {
        icon: "custom",
        label: "CUSTOM ABUTMENT",
        title: "디자인을 올리면 곧 생산",
        body: [
          "어벗 디자인이 업로드되면 애크로덴트 CNC 자동 생산이 시작됩니다.",
          "심플웨이 규격도 당연히 호환됩니다.",
        ],
        tags: ["애크로덴트 CNC", "심플웨이", "묶음 배송"],
      },
    ],
  },

  ai: {
    eyebrow: "AI DESIGN",
    title: ["의뢰서 값 그대로,", "디자인이 시작됩니다."],
    lead: [
      "환자·임플란트·보철·스캔은 의뢰서에 이미 있습니다.",
      "다시 입력하지 않고 그대로 디자인에 연결합니다.",
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
        title: "확인 · 밀링",
        line: "언더컷·교합 접촉·두께를 확인하고 밀링 디스크 배치까지 마칩니다.",
      },
    ],
    points: [
      {
        icon: "preset",
        title: "기공소 디자인 프리셋",
        line: "재료·두께·시멘트 갭을 저장해 치과별 기본값으로 씁니다.",
      },
      {
        icon: "save",
        title: "자동 저장",
        line: "작업은 자동으로 저장되고, 닫았다 열어도 이어집니다.",
      },
      {
        icon: "chat",
        title: "채팅으로 바로 전달",
        line: "그림으로 표시해 채팅에 첨부하면 치과가 바로 확인합니다.",
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
    title: "충전은 한 번, 결제는 어디서나.",
    lead: [
      "기공·커스텀어벗·스토어 기성품을 하나의 크레딧으로 결제합니다.",
      "잔액과 사용 내역도 한곳에서 봅니다.",
    ],
    hubLabel: "크레딧",
    hubNote: "거래 선수금",
    spokes: [
      { icon: "lab", label: "기공", line: "치과 기공의뢰", tag: "면세" },
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
        body: ["정산으로 쌓인 기공크레딧으로 어벗 주문도 결제할 수 있습니다."],
      },
    ],
    notice: "크레딧은 선불페이가 아닌 B2B 거래 선수금(예치금)입니다.",
  },

  faq: {
    eyebrow: "FAQ",
    heading: "자주 묻는 질문",
    items: [
      {
        q: "기공서비스는 한마디로 뭔가요?",
        a: [
          "의뢰 한 번으로 AI 디자인, 커스텀어벗 생산, 배송, 크레딧 결제까지 이어지는 기공 서비스입니다.",
        ],
      },
      {
        q: "AI 디자인은 무엇을 해 주나요?",
        a: [
          "의뢰서의 임플란트·보철·스캔 값을 그대로 받아 스캔 정렬, 삽입축, 마진, 스캔바디 매칭을 자동으로 잡습니다.",
          "기공사가 확인하고 다듬어 보철을 완성합니다.",
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
        q: "계산서는 어떻게 발행되나요?",
        a: [
          "충전할 때는 발행하지 않습니다.",
          "사용한 금액을 월합으로 면세 계산서(기공·어벗)와 과세 세금계산서(스토어)로 나눠 발행합니다.",
        ],
      },
      {
        q: "커스텀어벗은 어떻게 만들어지나요?",
        a: [
          "기공소가 디자인을 업로드하면 애크로덴트 CNC 생산이 자동으로 시작됩니다.",
          "완성된 어벗은 보철과 함께 치과로 나갑니다.",
        ],
      },
      {
        q: "구강 스캔이 없어도 의뢰할 수 있나요?",
        a: [
          "네. 스캔이 없거나 사진만 있어도 전송됩니다.",
          "러버인상(석고모델) 의뢰도 같은 방식으로 보낼 수 있습니다.",
        ],
      },
      {
        q: "거래하던 기공소와도 쓸 수 있나요?",
        a: [
          "네. 의뢰할 때 기공소를 지정하면 그 기공소의 수가로 진행됩니다.",
          "플랫폼에 가입하면 어벗츠 기공서비스와 같은 통합 서비스를 이용할 수 있습니다.",
        ],
      },
    ],
  },

  closing: {
    eyebrow: "START LAB SERVICE",
    title: "AI 디자인과 하나의 크레딧, 지금 시작하세요.",
    body: [
      "스캔을 올리면 디자인·생산·배송이 이어집니다.",
      "도입이 궁금하시면 상담으로 안내해 드립니다.",
    ],
  },
};
