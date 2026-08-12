// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import React from "react";

interface CncFileCardProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

export const CncFileCard: React.FC<CncFileCardProps> = ({
  children,
  onClick,
  className,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`app-surface flex flex-col items-start justify-between px-3 py-3 min-h-[72px] text-left hover:border-primary/70 hover:bg-primary-soft/60 transition-colors w-full overflow-hidden ${
        className || ""
      }`}
    >
      {children}
    </button>
  );
};
