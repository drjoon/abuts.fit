import type { ReactNode } from "react";

import type { HealthLevel } from "@/pages/manufacturer/cnc/components/MachineCard";

interface CncToolStatusModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  toolLifeDirty: boolean;
  health: HealthLevel;
  onRequestClose: () => void;
  onOpenToolOffsetEditor: () => void;
  onSave?: () => void;
}

export const CncToolStatusModal = ({
  open,
  title,
  body,
  toolLifeDirty: _toolLifeDirty,
  health: _health, // 현재는 row 단위 색상으로만 표현하고 상단 뱃지에는 사용하지 않음
  onRequestClose,
  onOpenToolOffsetEditor,
  onSave,
}: CncToolStatusModalProps) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8 sm:py-12 backdrop-blur-sm"
      onClick={onRequestClose}
    >
      <div
        className="bg-white/95 p-6 sm:p-8 rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.35)] w-full max-w-xl max-h-[calc(100vh-4rem)] transform transition-all border border-gray-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                {title}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {title === "공구 상태" && (
              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border-emerald-100">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  정상
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 border-amber-100">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  주의
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 border-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  교체 필요
                </span>
              </div>
            )}
            <button
              onClick={onRequestClose}
              className="text-gray-400 hover:text-gray-600 text-2xl sm:text-3xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="pr-1 sm:pr-2 mb-3 flex-1 overflow-y-auto">{body}</div>
        {title === "공구 상태" && (
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (onSave) onSave();
                onRequestClose();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-xs sm:text-sm transition-colors"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
