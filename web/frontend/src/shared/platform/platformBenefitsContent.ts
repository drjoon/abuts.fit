// related files:
// - web/frontend/src/features/platform/PlatformBenefitsDialog.tsx
// - web/frontend/src/features/lab/LabPlatformBenefitsBanner.tsx
// - 2026-08-12: 기공소·치과 가입 이유 모달 SSOT.
import {
  Factory,
  MailX,
  PenTool,
  RefreshCw,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type PlatformBenefitsVariant = "lab" | "practice";

export type PlatformBenefitItem = {
  icon: LucideIcon;
  title: string;
  points: readonly [string, string];
};

export type PlatformBenefitsConfig = {
  title: string;
  description: string;
  footerNote: string;
  items: readonly PlatformBenefitItem[];
};

const LAB_BENEFITS: PlatformBenefitsConfig = {
  title: "기공소가 어벗츠를 쓰는 이유",
  description:
    "이메일·정산·신규 거래·커스텀어벗 생산까지, 기공소 업무를 한곳에서 이어줍니다.",
  footerNote:
    "궁금한 점이 있으면 채팅·문의로 편하게 말씀해 주세요. 함께 맞춰가겠습니다.",
  items: [
    {
      icon: MailX,
      title: "이제 이메일 쓰지 마세요",
      points: [
        "기공의뢰서·구강스캔 전달과 지난 내역 관리가 한곳에서 끝납니다.",
        "의뢰건별 채팅으로 치과와 바로 소통합니다.",
      ],
    },
    {
      icon: Wallet,
      title: "정산·계산서는 맡기세요",
      points: [
        "입금 내역, 크레딧 잔고, 소비 내역을 플랫폼이 관리합니다.",
        "매달 정산과 계산서 발행까지 함께 처리합니다.",
      ],
    },
    {
      icon: Users,
      title: "자동 매칭으로 의뢰를 받으세요",
      points: [
        "월 플랫폼 수수료로 치과의 자동 매칭 의뢰에 참여할 수 있습니다.",
        "성공 시 기공비의 일부를 플랫폼 수수료로 지급하며, 식별 정보는 비공개입니다.",
      ],
    },
    {
      icon: Factory,
      title: "커스텀어벗 생산도 맡겨주세요",
      points: [
        "전공정 자동화로 합리적인 가격의 고품질 CNC 커스텀어벗을 생산합니다.",
        "3D 모델·의뢰서 이동과 관리를 플랫폼에서 원스톱으로 처리합니다.",
      ],
    },
    {
      icon: RefreshCw,
      title: "계속 업데이트합니다",
      points: [
        "문의·채팅·메일·전화로 기공소 의견을 듣습니다.",
        "빠른 속도로 서비스를 개선해 나갑니다.",
      ],
    },
  ],
};

const PRACTICE_BENEFITS: PlatformBenefitsConfig = {
  title: "치과가 어벗츠를 쓰는 이유",
  description:
    "이메일·정산·기공소 매칭·커스텀어벗까지, 치과 업무를 한곳에서 이어줍니다.",
  footerNote:
    "궁금한 점이 있으면 채팅·문의로 편하게 말씀해 주세요. 함께 맞춰가겠습니다.",
  items: [
    {
      icon: MailX,
      title: "이제 이메일 쓰지 마세요",
      points: [
        "기공의뢰서·구강스캔 전달과 지난 내역 관리가 한곳에서 끝납니다.",
        "의뢰건별 채팅으로 기공소와 바로 소통합니다.",
      ],
    },
    {
      icon: Wallet,
      title: "정산·계산서는 맡기세요",
      points: [
        "크레딧 잔고와 기공비·어벗 의뢰비 내역을 플랫폼에서 확인할 수 있습니다.",
        "결제·사용 내역을 관리하고 계산서 발행까지 함께 처리합니다.",
      ],
    },
    {
      icon: Search,
      title: "실력 있는 기공소를 찾으세요?",
      points: [
        "어벗츠 인증 기공소와 자동 매칭할 수 있습니다. 치과·기공소 식별 정보는 비공개입니다.",
        "기존 거래 기공소로 직접 보낼 수도 있습니다.",
      ],
    },
    {
      icon: PenTool,
      title: "직접 커스텀 어벗 디자인하세요?",
      points: [
        "디자인하신 어벗 STL 파일을 올려주시면 고품질의 CNC 어벗을 생산해드립니다.",
        "3D 모델·의뢰서 이동과 관리를 플랫폼에서 원스톱으로 처리합니다.",
      ],
    },
    {
      icon: RefreshCw,
      title: "계속 업데이트합니다",
      points: [
        "문의·채팅·메일·전화로 치과 의견을 듣습니다.",
        "빠른 속도로 서비스를 개선해 나갑니다.",
      ],
    },
  ],
};

export const getPlatformBenefitsConfig = (
  variant: PlatformBenefitsVariant,
): PlatformBenefitsConfig =>
  variant === "practice" ? PRACTICE_BENEFITS : LAB_BENEFITS;
