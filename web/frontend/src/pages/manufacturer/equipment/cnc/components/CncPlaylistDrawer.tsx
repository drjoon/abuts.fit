// change-log:
// - 2026-08-08: CncModalShell 적용. 예약 관리 톤·compact 라벨로 정리.
// - 2026-08-07: 재생목록 행에 의뢰자명(businessName) 표시. 구조화 필드 우선.
// - 2026-08-06: NC 첨부 시 NC 뱃지·최대직경 표시.
// related files:
// - web/frontend/src/features/manufacturer/cnc/components/CncModalShell.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningRequestLabel.tsx
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GripVertical,
  ArrowLeft,
  ArrowRight,
  Trash,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { CncModalShell } from "@/features/manufacturer/cnc/components/CncModalShell";

export interface PlaylistJobItem {
  id: string;
  name: string;
  qty: number;
  paused?: boolean;
  bridgePath?: string;
  s3Key?: string;
  s3Bucket?: string;
  requestId?: string;
  requestMongoId?: string | null;
  rollbackCount?: number;
  // 아노다이징 OFF(아노 X) 여부. 워크시트 가공 정책 뱃지 표시용.
  anodizingEnabled?: boolean;
  // 배송 방식(신속/묶음). 재생목록 뱃지 표시용.
  shippingMode?: "normal" | "express" | null;
  // NC 첨부 여부·최대직경. 워크시트 카드와 동일한 뱃지/치수 표시용.
  hasNc?: boolean;
  maxDiameter?: number | null;
  programNo?: number | null;
  source?: string;
  businessName?: string;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  lotPart?: string;
  lotShortCode?: string;
  ridSuffix?: string;
}

interface CncPlaylistDrawerProps {
  open: boolean;
  title: string;
  jobs: PlaylistJobItem[];
  readOnly?: boolean;
  readOnlyMessage?: string;
  headerExtras?: React.ReactNode;
  deleteVariant?: "worksheet" | "cnc";
  onClose: () => void;
  onOpenCode: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onApproveFromRollback?: (requestMongoId: string) => void;
  onReorder: (nextOrder: string[]) => void;
  onChangeQty: (jobId: string, qty: number) => void;
}

const chipSm =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold";

export const CncPlaylistDrawer: React.FC<CncPlaylistDrawerProps> = ({
  open,
  title,
  jobs,
  readOnly,
  readOnlyMessage,
  headerExtras,
  deleteVariant = "worksheet",
  onClose,
  onOpenCode,
  onDelete,
  onApproveFromRollback,
  onReorder,
  onChangeQty: _onChangeQty,
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

  return (
    <CncModalShell
      open={open}
      title="예약 관리"
      subtitle={`${title} · 대기 큐 · 순서 · 되돌리기`}
      size="lg"
      onClose={onClose}
      titleId="cnc-playlist-title"
      headerActions={headerExtras}
      bodyClassName="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5"
      footer={
        <>
          <span className="text-xs text-slate-500">
            {readOnly ? "읽기 전용" : "드래그로 순서 변경"}
          </span>
          <span className="text-xs font-medium text-slate-600">
            총 {order.length}개
          </span>
        </>
      }
    >
      {readOnly ? (
        <div className="mb-3 rounded-xl border border-accent-muted bg-accent-soft px-3.5 py-2.5 text-xs text-accent-strong">
          {readOnlyMessage ||
            "브리지 서버가 오프라인이라 예약목록을 DB에서 조회했습니다. 현재는 읽기 전용입니다."}
        </div>
      ) : null}

      {localJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="text-sm font-semibold text-slate-800">
            대기 중인 프로그램이 없습니다
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {localJobs.map((job, idx) => {
            const parts = String(job.name || "")
              .trim()
              .split(/\s+/)
              .filter(Boolean);
            const structured =
              Boolean(job.businessName) ||
              Boolean(job.clinicName) ||
              Boolean(job.patientName) ||
              Boolean(job.tooth);
            const clinic =
              String(job.clinicName || "").trim() ||
              (!structured ? parts[0] || "" : "");
            const patient =
              String(job.patientName || "").trim() ||
              (!structured ? parts[1] || "" : "");
            const tooth =
              String(job.tooth || "").trim() ||
              (!structured ? parts[2] || "" : "");
            const badge = structured
              ? String(job.lotShortCode || "").trim()
              : parts.length > 1
                ? parts[parts.length - 2]
                : "";
            const labelParts = [
              String(job.businessName || "").trim(),
              clinic,
              patient,
              tooth,
            ].filter(Boolean);
            const rollbackCount = Number(job.rollbackCount || 0);
            const canApproveFromRollback =
              !readOnly && rollbackCount > 0 && !!job.requestMongoId;
            const hasNc =
              job.hasNc === true ||
              Boolean(String(job.s3Key || "").trim()) ||
              Boolean(String(job.bridgePath || "").trim());

            return (
              <div
                key={job.id}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2"
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
                <div className="flex shrink-0 items-center gap-1 pt-0.5 text-slate-400">
                  <span className="w-5 text-center text-[11px] font-semibold text-slate-400">
                    {idx + 1}
                  </span>
                  <GripVertical className="h-4 w-4" />
                </div>

                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpenCode(job.id)}
                  title={job.name}
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                    {idx === 0 ? (
                      <span
                        className={`${chipSm} border-slate-300 bg-slate-100 text-slate-700`}
                      >
                        Next
                      </span>
                    ) : null}
                    {labelParts.map((part, partIdx) => (
                      <React.Fragment key={`${partIdx}-${part}`}>
                        {partIdx > 0 ? (
                          <span className="text-slate-400">/</span>
                        ) : null}
                        <span className="truncate" title={part}>
                          {part}
                        </span>
                      </React.Fragment>
                    ))}
                    {badge ? (
                      <span className="inline-flex items-center rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {badge}
                      </span>
                    ) : null}
                    {job.anodizingEnabled === false ? (
                      <span
                        className={`${chipSm} border-destructive-muted bg-destructive-soft text-destructive`}
                      >
                        아노 X
                      </span>
                    ) : null}
                    {hasNc ? (
                      <span
                        className={`${chipSm} border-primary-muted bg-primary-soft text-primary-strong`}
                      >
                        NC
                      </span>
                    ) : null}
                    {job.shippingMode === "express" ||
                    job.shippingMode === "normal" ? (
                      <ShippingModeBadge mode={job.shippingMode} size="sm" />
                    ) : null}
                    {job.paused ? (
                      <span
                        className={`${chipSm} border-accent-muted bg-accent-soft text-accent-strong`}
                      >
                        일시정지
                      </span>
                    ) : null}
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {canApproveFromRollback ? (
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        if (!job.requestMongoId) return;
                        onApproveFromRollback?.(job.requestMongoId);
                      }}
                      title="재가공 없이 승인"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => {
                      if (readOnly) return;
                      setLocalJobs((prev) =>
                        prev.filter((j) => j.id !== job.id),
                      );
                      onDelete(job.id);
                    }}
                    disabled={!!readOnly}
                    title={
                      deleteVariant === "cnc" ? "삭제" : "준비로 되돌리기"
                    }
                  >
                    {deleteVariant === "cnc" ? (
                      <Trash className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowLeft className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0 || !!readOnly}
                    title="위로"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === localJobs.length - 1 || !!readOnly}
                    title="아래로"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CncModalShell>
  );
};
