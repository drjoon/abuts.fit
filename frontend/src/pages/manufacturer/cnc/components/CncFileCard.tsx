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
      className={`flex flex-col items-start justify-between rounded-lg border border-slate-200 bg-white px-3 py-3 min-h-[72px] text-left hover:border-blue-400 hover:bg-blue-50/60 transition-colors w-full overflow-hidden ${
        className || ""
      }`}
    >
      {children}
    </button>
  );
};
