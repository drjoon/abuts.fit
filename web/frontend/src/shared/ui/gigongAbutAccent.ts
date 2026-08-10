// change-log:
// - 2026-08-11: 연결선을 중앙(취소선) → 하단 배경 레일로, 색 밝게·투명도 완화.
// - 2026-08-11: 사이드바 버튼 그라데이션 제거. 가로 연결선 SSOT·굵기 공유.
// - 2026-08-11: 기공/어벗 액센트(그라데이션·연결선) SSOT — 대시보드 요약·사이드바 공유.
// related files:
// - web/frontend/src/pages/requestor/dashboard/components/RequestorDashboardStatsCards.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx

export type GigongAbutAccentKey = "기공" | "어벗";

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
      "border-sky-200/70 bg-gradient-to-r from-sky-50 via-white to-slate-50/80",
    line: "bg-gradient-to-r from-sky-200 via-sky-300 to-sky-200",
    text: "text-slate-700",
    glow: "shadow-[0_8px_20px_-14px_rgba(14,165,233,0.55)]",
  },
  어벗: {
    shell:
      "border-teal-200/70 bg-gradient-to-r from-teal-50 via-white to-slate-50/80",
    line: "bg-gradient-to-r from-teal-200 via-teal-300 to-teal-200",
    text: "text-slate-700",
    glow: "shadow-[0_8px_20px_-14px_rgba(13,148,136,0.45)]",
  },
};

export const DEFAULT_GIGONG_ABUT_ACCENT: GigongAbutAccentTheme = {
  shell:
    "border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50/80",
  line: "bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200",
  text: "text-slate-700",
  glow: "shadow-[0_8px_20px_-14px_rgba(100,116,139,0.45)]",
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
