import React from "react";
import { X } from "lucide-react";

import type { Machine } from "@/pages/manufacturer/equipment/cnc/types";
import type { CncJobItem } from "@/pages/manufacturer/equipment/cnc/components/CncReservationModal";
import { CncFileCard } from "@/pages/manufacturer/equipment/cnc/components/CncFileCard";

interface CncReservationListModalProps {
  open: boolean;
  target: Machine | null;
  jobs: CncJobItem[];
  onClose: () => void;
  onOpenProgram: (job: CncJobItem) => void;
  onCancelJob: (job: CncJobItem) => void;
  onCancelAll?: (target: Machine) => void;
  onDownloadProgram?: (job: CncJobItem) => void;
}

export const CncReservationListModal: React.FC<
  CncReservationListModalProps
> = ({
  open,
  target,
  jobs,
  onClose,
  onOpenProgram,
  onCancelJob,
  onCancelAll,
  onDownloadProgram,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="app-surface app-surface--modal p-6 sm:p-8 w-full max-w-3xl transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 gap-4 border-b border-slate-100 pb-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-baseline gap-2">
              <span>생산 예약 목록</span>
              {target && (
                <span className="text-xs sm:text-sm text-slate-500 font-normal truncate">
                  <span className="font-semibold">{target.name}</span>
                </span>
              )}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-slate-100 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-slate-700 flex flex-col gap-3">
          {target && jobs.length > 0 ? (
            <div className="max-h-80 overflow-y-auto pr-1">
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-xs sm:text-[13px]">
                {jobs.slice(0, 30).map((job) => {
                  const fullLabel = job.name;
                  const displayLabel =
                    fullLabel.length > 20
                      ? `${fullLabel.slice(0, 17)}...`
                      : fullLabel;
                  return (
                    <div key={job.id} className="relative group">
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelJob(job);
                        }}
                      >
                        ×
                      </button>
                      <CncFileCard
                        onClick={() => {
                          onOpenProgram(job);
                        }}
                      >
                        <span
                          className="block font-medium truncate w-full text-[13px] sm:text-[14px]"
                          title={fullLabel}
                        >
                          {displayLabel}
                          {job.qty > 1 ? ` ×${job.qty}` : ""}
                        </span>
                        {onDownloadProgram && (
                          <div className="mt-2 flex justify-center gap-2 w-full">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void onDownloadProgram(job);
                              }}
                              className="inline-flex h-8 px-3 min-w-[80px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                            >
                              다운로드
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProgram(job);
                              }}
                              className="inline-flex h-8 px-3 min-w-[72px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                            >
                              코드
                            </button>
                          </div>
                        )}
                      </CncFileCard>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center">
              이 장비에 등록된 생산 예약이 없습니다.
            </div>
          )}

          {target && jobs.length > 0 && (
            <div className="pt-2 flex justify-end gap-2">
              {onCancelAll && (
                <button
                  type="button"
                  onClick={() => onCancelAll(target)}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  전체 삭제
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
