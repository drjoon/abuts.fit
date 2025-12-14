import React from "react";

interface CncWorkBoardPanelProps {
  opStatus: any | null;
  programSummary: {
    current?: any;
    list?: any[];
  } | null;
  scanStatus: "idle" | "running" | "ok" | "error";
  scanError: string | null;
  lastScanAt: string | null;
  scanHistory: {
    status: "ok" | "error";
    message?: string | null;
    at: string;
  }[];
  onOpenProgramDetail?: (prog: any | null) => void;
  onRefresh: () => void;
}

// 우측 작업 보드 패널: 현재/다음 프로그램 + 최근 스캔 상태 요약
export const CncWorkBoardPanel: React.FC<CncWorkBoardPanelProps> = ({
  opStatus,
  programSummary,
  scanStatus,
  scanError,
  lastScanAt,
  scanHistory,
  onOpenProgramDetail,
  onRefresh,
}) => {
  const current = programSummary?.current ?? null;
  const list = Array.isArray(programSummary?.list)
    ? programSummary?.list ?? []
    : [];

  const currentNo = current?.programNo ?? current?.no ?? "-";
  const currentName =
    current?.programName ?? current?.name ?? `#${currentNo ?? "-"}`;

  const currentIndex = list.findIndex((p: any) => {
    const no = p?.programNo ?? p?.no;
    return no != null && no === currentNo;
  });

  const nextProgram =
    currentIndex >= 0 && currentIndex + 1 < list.length
      ? list[currentIndex + 1]
      : null;

  const nextNo = nextProgram?.programNo ?? nextProgram?.no ?? "-";
  const nextName =
    nextProgram?.programName ?? nextProgram?.name ?? `#${nextNo ?? "-"}`;

  const statusCode =
    typeof opStatus?.result === "number" ? opStatus.result : null;
  const statusLabel =
    statusCode == null ? "Unknown" : statusCode === 0 ? "OK" : "Error";

  const scanBadge = (() => {
    if (scanStatus === "running")
      return {
        label: "스캔 중",
        className:
          "bg-blue-50 text-blue-700 border-blue-100 before:bg-blue-400",
      };
    if (scanStatus === "ok")
      return {
        label: "정상",
        className:
          "bg-emerald-50 text-emerald-700 border-emerald-100 before:bg-emerald-500",
      };
    if (scanStatus === "error")
      return {
        label: "에러",
        className: "bg-red-50 text-red-700 border-red-100 before:bg-red-500",
      };
    return {
      label: "대기",
      className:
        "bg-slate-50 text-slate-600 border-slate-100 before:bg-slate-400",
    };
  })();

  return (
    <aside className="mt-6 sm:mt-0 sm:ml-6 w-full sm:w-80 lg:w-96 flex-shrink-0">
      <div className="h-full rounded-2xl bg-white/80 border border-gray-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-0.5">
              작업 보드
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border relative pl-3 before:content-[''] before:absolute before:left-1.5 before:w-1.5 before:h-1.5 before:rounded-full ${scanBadge.className}`}
              >
                <span>{scanBadge.label}</span>
              </span>
              <button
                type="button"
                onClick={onRefresh}
                className="text-[11px] text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
              >
                다시 스캔
              </button>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-500 flex flex-col items-end">
              <span>장비 상태</span>
              {lastScanAt && (
                <span className="mt-0.5 text-[10px] text-gray-400">
                  마지막 스캔: {lastScanAt}
                </span>
              )}
            </div>
            <div
              className={`mt-0.5 text-xs font-semibold ${
                statusLabel === "OK"
                  ? "text-emerald-600"
                  : statusLabel === "Error"
                  ? "text-red-600"
                  : "text-slate-500"
              }`}
            >
              {statusLabel}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-4 py-3 gap-3 text-xs text-gray-700">
          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1">
              현재 프로그램
            </div>
            <button
              type="button"
              className="w-full text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 hover:border-blue-300 hover:bg-blue-50/60 transition-colors"
              onClick={() => {
                if (onOpenProgramDetail && current) {
                  onOpenProgramDetail(current);
                }
              }}
            >
              <div className="text-[11px] text-gray-500 mb-0.5">번호</div>
              <div className="text-sm font-semibold text-gray-900">
                {currentNo ?? "-"}
              </div>
              <div className="mt-1 text-[11px] text-gray-600 truncate">
                {currentName}
              </div>
            </button>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-gray-500 mb-1">
              다음 프로그램 (예상)
            </div>
            <button
              type="button"
              className="w-full text-left rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 hover:border-blue-300 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
              onClick={() => {
                if (onOpenProgramDetail && nextProgram) {
                  onOpenProgramDetail(nextProgram);
                }
              }}
              disabled={!nextProgram}
            >
              <div className="text-[11px] text-gray-500 mb-0.5">번호</div>
              <div className="text-sm font-semibold text-gray-900">
                {nextProgram ? nextNo ?? "-" : "-"}
              </div>
              <div className="mt-1 text-[11px] text-gray-600 truncate">
                {nextProgram ? nextName : "예상되는 다음 프로그램이 없습니다."}
              </div>
            </button>
          </div>

          {scanError && (
            <div className="mt-1 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {scanError}
            </div>
          )}

          {scanHistory.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center justify-between">
                <span>최근 스캔 히스토리</span>
                <span className="text-[10px] text-gray-400">
                  최신 → 오래된 순
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {scanHistory.map((h, idx) => (
                  <div
                    key={`${h.at}-${idx}`}
                    className="flex flex-col items-center min-w-[40px]"
                  >
                    <div className="relative flex items-center justify-center">
                      <div
                        className={`w-2.5 h-2.5 rounded-full border shadow-sm ${
                          h.status === "ok"
                            ? "bg-emerald-500 border-emerald-600"
                            : "bg-red-500 border-red-600"
                        }`}
                      />
                      {idx === 0 && (
                        <div className="absolute -top-3 px-1 rounded-full bg-blue-600 text-[9px] text-white">
                          NOW
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[9px] text-gray-500">
                      {h.status === "ok" ? "OK" : "ERROR"}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-0.5">
                      {h.at}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
