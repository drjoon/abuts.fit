// change-log:
// - 2026-08-18: 치과 요약 라벨 구강스캔/어벗디자인 → 기공/어벗 액센트 매핑.
// - 2026-08-11: 기공=soft blue(208°) / 어벗=soft gold(46°) — 낮은 채도.
// - 2026-08-11: 기공=sky(199°) / 어벗=coral(19°) 보색 쌍.
// - 2026-08-11: 기공=sky / 어벗=emerald — 다른 색 계열로 구분감 강화.
// - 2026-08-11: Service 토큰(service-gigong / service-abut)으로 교체 — sky/teal raw 제거.
// - 2026-08-11: 연결선을 중앙(취소선) → 하단 배경 레일로, 색 밝게·투명도 완화.
// - 2026-08-11: 사이드바 버튼 그라데이션 제거. 가로 연결선 SSOT·굵기 공유.
// - 2026-08-11: 기공/어벗 액센트(그라데이션·연결선) SSOT — 대시보드 요약·사이드바 공유.
// related files:
// - web/frontend/src/index.css
// - web/frontend/src/shared/ui/semanticStatus.ts
// - web/frontend/src/pages/requestor/dashboard/components/RequestorDashboardStatsCards.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/layout/DashboardSidebarNav.tsx

export type GigongAbutAccentKey = "기공" | "어벗";

/** 치과 대시보드 행 라벨(구강스캔/어벗디자인)도 기공·어벗 액센트에 매핑 */
export const resolveGigongAbutAccentKey = (
  label?: string | null,
): GigongAbutAccentKey | undefined => {
  if (label === "기공" || label === "구강스캔") return "기공";
  if (label === "어벗" || label === "어벗디자인") return "어벗";
  return undefined;
};

export type GigongAbutAccentTheme = {
  shell: string;
  line: string;
  text: string;
  glow: string;
};

/** 요약카드·사이드바 공통 가로 연결선 굵기 */
export const GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS = "h-[3px]";

export const GIGONG_ABUT_ACCENT: Record<
  GigongAbutAccentKey,
  GigongAbutAccentTheme
> = {
  기공: {
    shell:
      "border-service-gigong-muted/70 bg-gradient-to-r from-service-gigong-soft via-white to-secondary/80",
    line: "bg-gradient-to-r from-service-gigong-muted via-service-gigong to-service-gigong-muted",
    text: "text-foreground",
    glow: "shadow-[0_8px_20px_-14px_hsl(var(--service-gigong)/0.45)]",
  },
  어벗: {
    shell:
      "border-service-abut-muted/70 bg-gradient-to-r from-service-abut-soft via-white to-secondary/80",
    line: "bg-gradient-to-r from-service-abut-muted via-service-abut to-service-abut-muted",
    text: "text-foreground",
    glow: "shadow-[0_8px_20px_-14px_hsl(var(--service-abut)/0.4)]",
  },
};

export const DEFAULT_GIGONG_ABUT_ACCENT: GigongAbutAccentTheme = {
  shell:
    "border-border bg-gradient-to-r from-secondary via-white to-secondary/80",
  line: "bg-gradient-to-r from-border via-muted-foreground/40 to-border",
  text: "text-foreground",
  glow: "shadow-[0_8px_20px_-14px_hsl(var(--muted-foreground)/0.35)]",
};

/** 카드/메뉴 뒤 하단 배경 레일 — 텍스트를 가로지르지 않음 */
export const gigongAbutConnectorLineClass = (
  key?: GigongAbutAccentKey | null,
): string => {
  const line =
    (key && GIGONG_ABUT_ACCENT[key]?.line) ||
    DEFAULT_GIGONG_ABUT_ACCENT.line;
  return [
    "pointer-events-none absolute inset-x-0 bottom-1 z-0 rounded-full opacity-55",
    GIGONG_ABUT_CONNECTOR_THICKNESS_CLASS,
    line,
  ].join(" ");
};
