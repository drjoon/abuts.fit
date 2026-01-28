import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  Minus,
  Plus,
} from "lucide-react";

export interface PlaylistJobItem {
  id: string;
  name: string;
  qty: number;
  paused?: boolean;
}

interface CncPlaylistDrawerProps {
  open: boolean;
  title: string;
  jobs: PlaylistJobItem[];
  readOnly?: boolean;
  onClose: () => void;
  onOpenCode: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onReorder: (nextOrder: string[]) => void;
  onChangeQty: (jobId: string, qty: number) => void;
}

export const CncPlaylistDrawer: React.FC<CncPlaylistDrawerProps> = ({
  open,
  title,
  jobs,
  readOnly,
  onClose,
  onOpenCode,
  onDelete,
  onReorder,
  onChangeQty,
}) => {
  const [localJobs, setLocalJobs] = useState<PlaylistJobItem[]>(jobs);
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

  const order = useMemo(() => localJobs.map((j) => j.id), [localJobs]);

  const move = (from: number, to: number) => {
    if (readOnly) return;
    if (from === to) return;
    if (from < 0 || to < 0) return;
    if (from >= localJobs.length || to >= localJobs.length) return;

    const next = localJobs.slice();
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    setLocalJobs(next);
    onReorder(next.map((j) => j.id));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-[0_30px_70px_rgba(15,23,42,0.38)] border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50/70 via-white/40 to-violet-50/70" />
          <div className="relative min-w-0">
            <div className="text-[11px] font-semibold text-slate-500">
              재생목록
            </div>
            <div className="text-lg font-extrabold text-slate-900 truncate">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-white shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
          {readOnly && (
            <div className="mb-3 app-surface app-surface--panel border-2 border-amber-500 bg-white px-4 py-3 text-xs text-amber-800">
              브리지 서버가 오프라인이라 예약목록을 DB에서 조회했습니다. 현재는
              읽기 전용입니다.
            </div>
          )}
          {localJobs.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              대기 중인 프로그램이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {localJobs.map((job, idx) => {
                const qty = Math.max(1, Number(job.qty || 1));
                return (
                  <div
                    key={job.id}
                    className="app-surface app-surface--panel flex items-center gap-3 px-3 py-3"
                    draggable={!readOnly}
                    onDragStart={() => {
                      if (readOnly) return;
                      dragIdRef.current = job.id;
                    }}
                    onDragOver={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      const dragId = dragIdRef.current;
                      dragIdRef.current = null;
                      if (!dragId || dragId === job.id) return;
                      const from = localJobs.findIndex((j) => j.id === dragId);
                      const to = localJobs.findIndex((j) => j.id === job.id);
                      move(from, to);
                    }}
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="w-7 text-center text-[11px] font-extrabold text-slate-400">
                        {idx + 1}
                      </div>
                      <GripVertical className="h-4 w-4" />
                    </div>

                    <button
                      type="button"
                      className="flex-1 min-w-0 text-left"
                      onClick={() => onOpenCode(job.id)}
                      title={job.name}
                    >
                      <div className="truncate font-extrabold text-slate-900 text-sm">
                        {idx === 0 ? "Next ▶ " : ""}
                        {job.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {job.paused ? "일시정지" : "대기"}
                      </div>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          if (readOnly) return;
                          const nextQty = Math.max(1, qty - 1);
                          setLocalJobs((prev) =>
                            prev.map((j) =>
                              j.id === job.id ? { ...j, qty: nextQty } : j,
                            ),
                          );
                          onChangeQty(job.id, nextQty);
                        }}
                        disabled={!!readOnly}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={qty}
                        disabled={!!readOnly}
                        onChange={(e) => {
                          const v = Math.max(
                            1,
                            Number(e.target.value || 1) || 1,
                          );
                          setLocalJobs((prev) =>
                            prev.map((j) =>
                              j.id === job.id ? { ...j, qty: v } : j,
                            ),
                          );
                          onChangeQty(job.id, v);
                        }}
                        className="w-12 h-9 rounded-xl border border-slate-200 bg-white text-center text-sm font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={() => {
                          if (readOnly) return;
                          const nextQty = qty + 1;
                          setLocalJobs((prev) =>
                            prev.map((j) =>
                              j.id === job.id ? { ...j, qty: nextQty } : j,
                            ),
                          );
                          onChangeQty(job.id, nextQty);
                        }}
                        disabled={!!readOnly}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={() => move(idx, idx - 1)}
                        disabled={idx === 0 || !!readOnly}
                        title="위로"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        onClick={() => move(idx, idx + 1)}
                        disabled={idx === localJobs.length - 1 || !!readOnly}
                        title="아래로"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        onClick={() => {
                          if (readOnly) return;
                          setLocalJobs((prev) =>
                            prev.filter((j) => j.id !== job.id),
                          );
                          onDelete(job.id);
                        }}
                        disabled={!!readOnly}
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/60">
          <div>{readOnly ? "읽기 전용" : "드래그로 순서 변경 가능"}</div>
          <div>총 {order.length}개</div>
        </div>
      </div>
    </div>
  );
};
