// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import React from "react";

export type MaterialDiameterChipProps = {
  label: string;
  /**
   * 클릭 시 소재 설정 모달 등을 열기 위한 핸들러.
   * 없으면 단순 표시용으로 렌더링합니다.
   */
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => void;
  /**
   * 크기/스타일 변형: "circle" 은 정원형 아이콘, "pill" 은 가로로 긴 버튼.
   */
  variant?: "circle" | "pill";
  /**
   * 비활성화 여부 (로딩 중 등).
   */
  disabled?: boolean;
  title?: string;
  tone?: "default" | "danger";
};

export const MaterialDiameterChip: React.FC<MaterialDiameterChipProps> = ({
  label,
  onClick,
  variant = "circle",
  disabled = false,
  title = "소재 선택",
  tone = "default",
}) => {
  if (!label) return null;

  const commonClass =
    tone === "danger"
      ? "inline-flex items-center justify-center bg-destructive-soft text-destructive border border-destructive/80 hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-40 shadow-sm text-[10px] font-extrabold"
      : "inline-flex items-center justify-center bg-white/80 text-slate-700 border border-slate-200 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-40 shadow-sm text-[10px] font-extrabold";

  if (variant === "pill") {
    return (
      <button
        type="button"
        className={`${commonClass} rounded-full px-3 h-8 min-w-[1rem]`}
        onClick={onClick}
        disabled={disabled || !onClick}
        title={title}
      >
        {label}
      </button>
    );
  }

  // circle
  return (
    <button
      type="button"
      className={`${commonClass} rounded-full w-8 h-8`}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
    >
      {label}
    </button>
  );
};
