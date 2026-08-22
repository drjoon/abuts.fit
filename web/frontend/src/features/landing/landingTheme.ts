// related files:
// - web/frontend/src/features/landing/LandingPlatformIntro.tsx
// - web/frontend/src/features/landing/LandingPlatformSection.tsx
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx

/** 랜딩 UI 토큰 — 페이지 배경은 PublicPageLayout SSOT */
export const landingTheme = {
  accentText: "text-primary/90",
  headlineGradient:
    "bg-gradient-to-r from-primary-glow via-primary to-accent bg-clip-text text-transparent",
  glass:
    "border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl",
  glassStrong:
    "border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  imageFrame:
    "overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-[1px] shadow-[0_32px_80px_rgba(0,0,0,0.35)]",
  imageInner: "rounded-[15px] bg-white/95 ring-1 ring-white/20",
  ctaPrimary:
    "rounded-full bg-white text-slate-900 shadow-[0_8px_32px_rgba(255,255,255,0.12)] transition-all hover:bg-white/90",
  ctaGhost:
    "rounded-full border border-white/15 bg-white/[0.04] text-white/85 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[0.08] hover:text-white",
  statCard:
    "rounded-2xl border border-white/15 bg-white/90 text-slate-900 shadow-[0_18px_45px_rgba(6,8,20,0.35)] backdrop-blur-2xl",
  featureCard:
    "rounded-2xl border border-white/10 bg-white/90 text-slate-900 shadow-[0_18px_45px_rgba(6,8,20,0.35)] backdrop-blur-2xl",
  pipelineCard:
    "rounded-2xl border border-white/10 bg-gradient-to-br from-white/95 to-white/80 text-slate-900 shadow-[0_20px_50px_rgba(6,8,20,0.35)] backdrop-blur-2xl",
} as const;

export const workflowSteps = [
  "주문",
  "생산",
  "추적",
  "결제",
  "계산서",
] as const;

export const landingStats = [
  { label: "월간 케이스", value: "1,500+" },
  { label: "평균 처리 시간", value: "24h 이내" },
  { label: "동기화 성공률", value: "98.7%" },
] as const;

export const landingFeatures = [
  {
    title: "제조 품질 보증",
    description: "제조 단계마다 검사·승인 절차로 일관된 품질을 제공합니다.",
  },
  {
    title: "통합 워크플로우",
    description: "의뢰·제작·배송까지 단일 대시보드에서 관리합니다.",
  },
  {
    title: "실시간 상태 추적",
    description: "스테이지 타임라인으로 작업 현황을 즉시 확인합니다.",
  },
  {
    title: "비동기 지원",
    description: "문의는 이메일로 답변되어 운영에 방해되지 않습니다.",
  },
] as const;

export const landingPipeline = [
  {
    step: "01",
    title: "의뢰 등록",
    body: "3D 모델·그림 파일 업로드 및 의뢰 메타 입력",
  },
  {
    step: "02",
    title: "제조 진행",
    body: "제조 스테이지별 승인·피드백",
  },
  {
    step: "03",
    title: "배송 & 추적",
    body: "가상 우편함·실시간 배송 추적",
  },
] as const;

export const whyAbutsPoints = [
  "스테이지 기반 가시성으로 제조 요청 우선순위를 즉시 조정",
  "자동 가상 우편함 배치로 배송 동선과 추적 경험 개선",
  "MongoDB·S3 SSOT 구조로 모든 기록을 안전하게 보관",
] as const;
