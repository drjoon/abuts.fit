// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncToolStatusPanel.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolPanels.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/CncPage.tsx
import type { ReactNode } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import { BodyPortal } from "@/shared/ui/BodyPortal";

interface CncToolStatusModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  toolLifeDirty: boolean;
  health: HealthLevel;
  onRequestClose: () => void;
  onOpenToolOffsetEditor: () => void;
  onSave?: () => void;
  /** 가공 통계 모달로 이동하는 콜백 (제공 시 헤더에 버튼 표시) */
  onOpenMachiningStats?: () => void;
}

function modalSizeClass(title: string): string {
  if (title === "가공 통계") return "max-w-5xl";
  if (title === "공구 상태") return "max-w-4xl";
  if (title === "공구 등록") return "max-w-lg";
  return "max-w-xl";
}

function subtitleFor(title: string): string | null {
  if (title === "공구 상태") return "슬롯별 수명 · 옵셋 · 교체";
  if (title === "공구 등록") return "슬롯 등록 또는 템플릿 적용";
  if (title === "가공 통계") return "슬롯별 누적 · 현재 장착 이후";
  return null;
}

export const CncToolStatusModal = ({
  open,
  title,
  body,
  toolLifeDirty: _toolLifeDirty,
  health: _health,
  onRequestClose,
  onOpenToolOffsetEditor: _onOpenToolOffsetEditor,
  onSave,
  onOpenMachiningStats,
}: CncToolStatusModalProps) => {
  if (!open) return null;

  const isToolStatus = title === "공구 상태";
  const subtitle = subtitleFor(title);

  return (
    <BodyPortal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-[2px] sm:py-12"
      onClick={onRequestClose}
    >
      <div
        className={`flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)] ${modalSizeClass(title)}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cnc-tool-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id="cnc-tool-modal-title"
              className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isToolStatus && onOpenMachiningStats ? (
              <button
                type="button"
                onClick={onOpenMachiningStats}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                가공 통계
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRequestClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <span className="text-xl leading-none">&times;</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {body}
        </div>

        {isToolStatus ? (
          <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => {
                if (onSave) onSave();
                onRequestClose();
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              닫기
            </button>
          </div>
        ) : null}
      </div>
    </div>
    </BodyPortal>
  );
};
