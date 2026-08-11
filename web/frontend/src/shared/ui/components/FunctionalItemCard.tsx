// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useState, type ReactNode, type MouseEvent } from "react";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { cn } from "@/shared/ui/cn";

interface FunctionalItemCardProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onRemove?: () => Promise<void> | void;
  onUpdate?: () => void;
  confirmTitle?: string;
  confirmDescription?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  className?: string;
  removeIcon?: ReactNode;
  alwaysShowActions?: boolean;
}

export const FunctionalItemCard = ({
  children,
  onClick,
  onRemove,
  onUpdate,
  confirmTitle = "이 항목을 취소하시겠습니까?",
  confirmDescription,
  confirmLabel = "취소하기",
  cancelLabel = "닫기",
  disabled,
  className,
  removeIcon = "X",
  alwaysShowActions,
}: FunctionalItemCardProps) => {
  const [open, setOpen] = useState(false);

  const handleRemoveClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled || !onRemove) return;
    setOpen(true);
  };

  const handleConfirm = async () => {
    try {
      await onRemove?.();
    } finally {
      setOpen(false);
    }
  };

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          "relative group rounded-lg border bg-white transition-all",
          onClick ? "cursor-pointer hover:shadow-sm" : "hover:bg-slate-50/70",
          className,
        )}
      >
        {(onUpdate || (onRemove && !disabled)) && (
          <div
            className={cn(
              "absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-1 transition-opacity",
              alwaysShowActions
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100",
            )}
          >
            {onUpdate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate();
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white shadow-sm"
                title="수정"
              >
                U
              </button>
            )}
            {onRemove && !disabled && (
              <button
                type="button"
                onClick={handleRemoveClick}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-white shadow-sm"
                title="삭제"
              >
                {removeIcon}
              </button>
            )}
          </div>
        )}
        {children}
      </div>

      {onRemove && (
        <ConfirmDialog
          open={open}
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={handleConfirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
};
