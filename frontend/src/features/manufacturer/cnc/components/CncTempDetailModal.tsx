import type { ReactNode } from "react";

interface CncTempDetailModalProps {
  open: boolean;
  body: ReactNode;
  onRequestClose: () => void;
}

export const CncTempDetailModal = ({
  open,
  body,
  onRequestClose,
}: CncTempDetailModalProps) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm"
      onClick={onRequestClose}
    >
      <div
        className="bg-white/95 p-6 sm:p-8 rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.35)] w-full max-w-4xl transform transition-all border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              모터 온도
            </h2>
          </div>
          <button
            onClick={onRequestClose}
            className="text-gray-400 hover:text-gray-600 text-2xl sm:text-3xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1 sm:pr-2">
          <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3 sm:p-4">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
};
