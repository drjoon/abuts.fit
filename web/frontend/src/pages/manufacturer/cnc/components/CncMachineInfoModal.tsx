import React from "react";

interface CncMachineInfoModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  programInfo: {
    mainProgramName?: string | null;
    mainProgramComment?: string | null;
    subProgramName?: string | null;
    subProgramComment?: string | null;
  } | null;
  alarms: { type: number; no: number }[];
  onRequestClose: () => void;
}

export const CncMachineInfoModal: React.FC<CncMachineInfoModalProps> = ({
  open,
  loading,
  error,
  programInfo,
  alarms,
  onRequestClose,
}) => {
  if (!open) return null;

  const mainName = programInfo?.mainProgramName ?? "-";
  const mainComment = programInfo?.mainProgramComment ?? "-";
  const subName = programInfo?.subProgramName ?? "-";
  const subComment = programInfo?.subProgramComment ?? "-";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm"
      onClick={onRequestClose}
    >
      <div
        className="bg-white/95 p-6 sm:p-8 rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.35)] w-full max-w-xl transform transition-all border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              프로그램 / 알람
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
            {loading ? (
              <div className="text-sm text-slate-600">조회 중...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      MAIN
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {mainName}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 break-words">
                      {mainComment}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      SUB
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {subName}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 break-words">
                      {subComment}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-white border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    ALARM
                  </div>
                  {alarms.length === 0 ? (
                    <div className="text-sm text-emerald-700">알람 없음</div>
                  ) : (
                    <div className="space-y-1">
                      {alarms.map((a, idx) => (
                        <div
                          key={`${a.type}-${a.no}-${idx}`}
                          className="text-sm text-red-700"
                        >
                          {String(a.type)}-{String(a.no)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500">
                  MAIN/SUB가 O0로 보이면 실제로 활성 프로그램이 로드되지 않은
                  상태일 수 있습니다.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
