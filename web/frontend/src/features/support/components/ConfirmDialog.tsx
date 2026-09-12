// change-log:
// - 2026-09-12: z-[320]/[321] — Popover/Tooltip(z-400)이 위에 오도록(플로팅 패널 z-300 위).
// - 2026-09-12: title — ReactNode 허용(제목+도움말 아이콘).
// - 2026-09-10: showCloseButton · closeOnBackdrop · dense 옵션.
// - 2026-08-19: busy — 확인 처리 중 버튼 잠금.
// - 2026-08-11: panelClassName — 3D 프리뷰 등 넓은 확인 모달용.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/shared/ui/cn";

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 패널 너비 등 추가 클래스 (기본 max-w-md) */
  panelClassName?: string;
  /** 확인 버튼 톤. 기본 danger(삭제 등). 진행 확인은 primary. */
  confirmTone?: "danger" | "primary";
  /** true면 확인/닫기 버튼을 잠근다 */
  busy?: boolean;
  /** busy와 별도로 확인만 비활성(라벨은 유지) */
  confirmDisabled?: boolean;
  /** 헤더 오른쪽 X 닫기 */
  showCloseButton?: boolean;
  /** 딤드 영역 클릭 시 onCancel */
  closeOnBackdrop?: boolean;
  /** 패딩·제목·본문 여백 축소(리메이크 청구 등) */
  dense?: boolean;
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
  busy = false,
  confirmDisabled = false,
  showCloseButton = false,
  closeOnBackdrop = false,
  dense = false,
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

  const confirmLocked = busy || confirmDisabled;

  const confirmButtonClass =
    confirmTone === "primary"
      ? "px-4 py-2 rounded-lg bg-primary-strong hover:bg-primary-strong text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      : "px-4 py-2 rounded-lg bg-destructive hover:bg-destructive text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-destructive";

  const handleDismiss = () => {
    if (busy) return;
    onCancel();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm pointer-events-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        e.stopPropagation();
        if (closeOnBackdrop && e.target === e.currentTarget) handleDismiss();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "relative z-[321] max-h-[90vh] w-full max-w-md transform overflow-y-auto rounded-2xl bg-white shadow-2xl transition-all",
          dense ? "p-4" : "p-6",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            dense ? "mb-2" : "mb-4",
          )}
        >
          <h2
            className={cn(
              "min-w-0 flex-1 font-bold text-gray-900",
              dense ? "text-lg" : "text-xl",
            )}
          >
            {title}
          </h2>
          {showCloseButton ? (
            <button
              type="button"
              disabled={busy}
              aria-label="닫기"
              title="닫기"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
        {description && (
          <div
            className={cn(
              "text-gray-700 text-sm",
              dense ? "mb-3" : "mb-6 sm:text-base",
            )}
          >
            {description}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              if (busy) return;
              onCancel();
            }}
            className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            disabled={confirmLocked}
            onClick={(e) => {
              e.stopPropagation();
              if (confirmLocked) return;
              void onConfirm();
            }}
            className={`${confirmButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? "처리 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
