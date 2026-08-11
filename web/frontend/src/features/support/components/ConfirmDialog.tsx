// change-log:
// - 2026-08-11: panelClassName — 3D 프리뷰 등 넓은 확인 모달용.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/shared/ui/cn";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 패널 너비 등 추가 클래스 (기본 max-w-md) */
  panelClassName?: string;
  /** 확인 버튼 톤. 기본 danger(삭제 등). 진행 확인은 primary. */
  confirmTone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  panelClassName,
  confirmTone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const confirmButtonClass =
    confirmTone === "primary"
      ? "px-4 py-2 rounded-lg bg-primary-strong hover:bg-primary-strong text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      : "px-4 py-2 rounded-lg bg-destructive hover:bg-destructive text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive";

  return createPortal(
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[10050] p-4 backdrop-blur-sm pointer-events-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform transition-all z-[10051] max-h-[90vh] overflow-y-auto",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-gray-900">{title}</h2>
        {description && (
          <div className="text-gray-700 mb-6 text-sm sm:text-base">
            {description}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={(e) => {
              e.stopPropagation();
              void onConfirm();
            }}
            className={confirmButtonClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
