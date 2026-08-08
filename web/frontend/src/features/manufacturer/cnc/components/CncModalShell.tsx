// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncToolStatusModal.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncPlaylistDrawer.tsx
// - web/frontend/src/shared/ui/BodyPortal.tsx
import type { ReactNode } from "react";
import { BodyPortal } from "@/shared/ui/BodyPortal";

export type CncModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASS: Record<CncModalSize, string> = {
  sm: "max-w-lg",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
};

export type CncModalShellProps = {
  open: boolean;
  title: string;
  subtitle?: string | null;
  size?: CncModalSize;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Accessible label id prefix */
  titleId?: string;
  bodyClassName?: string;
};

/**
 * CNC / 가공 보드 모달 공통 셸.
 * 공구상태 모달 톤(슬레이트·타이틀/서브타이틀·무그라데이션)을 SSOT로 둔다.
 */
export function CncModalShell({
  open,
  title,
  subtitle,
  size = "md",
  headerActions,
  footer,
  children,
  onClose,
  titleId = "cnc-modal-title",
  bodyClassName,
}: CncModalShellProps) {
  if (!open) return null;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-[2px] sm:py-12"
        onClick={onClose}
      >
        <div
          className={`flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)] ${SIZE_CLASS[size]}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
          </div>

          <div
            className={
              bodyClassName ||
              "min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
            }
          >
            {children}
          </div>

          {footer ? (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </BodyPortal>
  );
}

export default CncModalShell;
