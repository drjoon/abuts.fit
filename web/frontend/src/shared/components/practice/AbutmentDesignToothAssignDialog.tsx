// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/AbutmentDesignConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/LabReceiveDualRoleAssignDialog.tsx
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// change-log:
// - 2026-09-12: 치아 열 items-start·상단 패딩 — 번호 잘림·하단 허공 제거.
// - 2026-09-12: 모달 폭 확대 — 치아 열 최소 8개 한 줄.
// - 2026-09-12: 한 화면 압축 — 빈 드롭칸 제거·썸네일 축소·미배정 스트립.
// - 2026-09-12: 드롭다운 제거 — 치아번호 나열 + STL 썸네일 드래그 매칭·연결선.
// - 2026-09-12: 카드 — 치아(위) ↔ STL 프리뷰(아래) 세로 연결선 레이아웃.
// - 2026-09-12: 다중 STL — 3D 확인 전 파일명↔치아 매핑 요약·수정.
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import { cn } from "@/shared/ui/cn";

export type AbutmentDesignToothAssignPending = {
  requestId: string;
  tooth: string;
};

export type AbutmentDesignToothAssignRow = {
  file: File;
  /** 파일명/AI로 추정한 치아(없으면 빈 문자열) */
  suggestedTooth: string;
  /** 매칭된 pending requestId(없으면 빈 문자열) */
  suggestedRequestId: string;
};

export type AbutmentDesignToothAssignResult = {
  file: File;
  requestId: string;
  tooth: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: AbutmentDesignToothAssignRow[];
  pendingMetas: AbutmentDesignToothAssignPending[];
  submitting?: boolean;
  onConfirm: (assignments: AbutmentDesignToothAssignResult[]) => void | Promise<void>;
  onCancel?: () => void;
};

const UNASSIGNED_ZONE = "__unassigned__";
/** 8열 × 5rem + gap ≈ 46rem — 모달 max-w와 맞춤 */
const THUMB_W = "w-20"; // 5rem

function toothLabel(tooth: string) {
  const t = String(tooth || "").trim();
  return t || "—";
}

function fileKey(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function AbutmentDesignToothAssignDialog({
  open,
  onOpenChange,
  rows,
  pendingMetas,
  submitting = false,
  onConfirm,
  onCancel,
}: Props) {
  const [requestIdByIndex, setRequestIdByIndex] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDragIndex(null);
    setOverZone(null);
    const used = new Set<string>();
    setRequestIdByIndex(
      rows.map((row) => {
        const suggested = String(row.suggestedRequestId || "").trim();
        if (
          suggested &&
          !used.has(suggested) &&
          pendingMetas.some((m) => m.requestId === suggested)
        ) {
          used.add(suggested);
          return suggested;
        }
        const byTooth = String(row.suggestedTooth || "").trim();
        if (byTooth) {
          const match = pendingMetas.find(
            (m) =>
              !used.has(m.requestId) &&
              String(m.tooth || "").trim() === byTooth,
          );
          if (match) {
            used.add(match.requestId);
            return match.requestId;
          }
        }
        return "";
      }),
    );
  }, [open, rows, pendingMetas]);

  const toothByRequestId = useMemo(() => {
    const map = new Map<string, string>();
    for (const meta of pendingMetas) {
      map.set(meta.requestId, String(meta.tooth || "").trim());
    }
    return map;
  }, [pendingMetas]);

  const fileIndexByRequestId = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < requestIdByIndex.length; i += 1) {
      const id = String(requestIdByIndex[i] || "").trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, i);
    }
    return map;
  }, [requestIdByIndex]);

  const unassignedIndexes = useMemo(() => {
    return rows
      .map((_, index) => index)
      .filter((index) => !String(requestIdByIndex[index] || "").trim());
  }, [rows, requestIdByIndex]);

  const canConfirm = useMemo(() => {
    if (submitting || rows.length === 0) return false;
    if (requestIdByIndex.length !== rows.length) return false;
    if (requestIdByIndex.some((id) => !String(id || "").trim())) return false;
    const used = new Set<string>();
    for (const id of requestIdByIndex) {
      const key = String(id || "").trim();
      if (used.has(key)) return false;
      used.add(key);
    }
    return true;
  }, [submitting, rows.length, requestIdByIndex]);

  const assignFileToZone = (fileIndex: number, zone: string) => {
    if (submitting) return;
    if (fileIndex < 0 || fileIndex >= rows.length) return;

    setRequestIdByIndex((prev) => {
      const next = [...prev];
      if (zone === UNASSIGNED_ZONE) {
        next[fileIndex] = "";
        return next;
      }
      if (!pendingMetas.some((m) => m.requestId === zone)) return prev;

      const previousOccupant = next.findIndex(
        (id, i) => i !== fileIndex && String(id || "").trim() === zone,
      );
      const fromTooth = String(next[fileIndex] || "").trim();
      next[fileIndex] = zone;
      if (previousOccupant >= 0) {
        next[previousOccupant] = fromTooth;
      }
      return next;
    });
  };

  const handleDragStart = (event: DragEvent, index: number) => {
    if (submitting) return;
    setDragIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverZone(null);
  };

  const handleZoneDragOver = (event: DragEvent, zone: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverZone(zone);
  };

  const handleZoneDrop = (event: DragEvent, zone: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const index = Number.parseInt(raw, 10);
    setOverZone(null);
    setDragIndex(null);
    if (!Number.isFinite(index) || index < 0 || index >= rows.length) return;
    assignFileToZone(index, zone);
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
    if (!next) onCancel?.();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const assignments: AbutmentDesignToothAssignResult[] = rows.map(
      (row, index) => {
        const requestId = String(requestIdByIndex[index] || "").trim();
        const tooth = toothByRequestId.get(requestId) || "";
        return { file: row.file, requestId, tooth };
      },
    );
    void onConfirm(assignments);
  };

  const renderThumb = (index: number) => {
    const row = rows[index];
    if (!row) return null;
    const dragging = dragIndex === index;
    const suggested = String(row.suggestedTooth || "").trim();
    const assignedId = String(requestIdByIndex[index] || "").trim();
    const assignedTooth = assignedId
      ? toothByRequestId.get(assignedId) || ""
      : "";
    const mismatch =
      Boolean(suggested) &&
      Boolean(assignedTooth) &&
      assignedTooth !== suggested;

    return (
      <button
        key={fileKey(row.file, index)}
        type="button"
        draggable={!submitting}
        disabled={submitting}
        onDragStart={(event) => handleDragStart(event, index)}
        onDragEnd={handleDragEnd}
        className={cn(
          "flex shrink-0 cursor-grab flex-col overflow-hidden rounded-md border bg-white text-left active:cursor-grabbing",
          THUMB_W,
          mismatch ? "border-amber-300" : "border-slate-200",
          dragging && "opacity-50",
          submitting && "cursor-not-allowed opacity-60",
        )}
      >
        <div className="aspect-square w-full bg-slate-100">
          <StlPreviewThumbnail file={row.file} className="h-full w-full" />
        </div>
        <span
          className="truncate px-1 py-0.5 text-[9px] leading-tight text-slate-600"
          title={row.file.name}
        >
          {row.file.name}
        </span>
        {suggested ? (
          <span
            className={cn(
              "truncate px-1 pb-0.5 text-[9px] leading-tight",
              mismatch ? "text-amber-700" : "text-muted-foreground",
            )}
          >
            추정 {toothLabel(suggested)}
            {mismatch ? " · 다름" : ""}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[min(96vw,56rem)] gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,56rem)] sm:rounded-xl sm:p-0">
        <DialogHeader className="shrink-0 space-y-0.5 border-b border-slate-100 px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">
            파일 ↔ 치아 확인
          </DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            STL을 치아 번호 위로 드래그해 맞춰 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-3">
          {/* 치아 행: 최소 8열 한 줄 (넘치면 가로 스크롤). items-start로 높이 stretch·하단 허공 방지. */}
          <div className="flex flex-nowrap items-start justify-center gap-2 overflow-x-auto px-0.5 pt-1 pb-1">
            {pendingMetas.map((meta) => {
              const tooth = toothLabel(meta.tooth);
              const assignedIndex = fileIndexByRequestId.get(meta.requestId);
              const filled = assignedIndex != null;
              const over = overZone === meta.requestId;
              const suggestedMismatch =
                filled &&
                Boolean(
                  String(rows[assignedIndex]?.suggestedTooth || "").trim(),
                ) &&
                String(rows[assignedIndex]?.suggestedTooth || "").trim() !==
                  String(meta.tooth || "").trim();

              return (
                <div
                  key={meta.requestId}
                  className={cn(
                    "flex w-20 shrink-0 flex-col items-center rounded-lg px-1 pb-1.5 pt-2 transition-colors",
                    over
                      ? "bg-primary/10 ring-2 ring-primary/40"
                      : suggestedMismatch
                        ? "bg-amber-50/80 ring-1 ring-amber-300"
                        : filled
                          ? "bg-slate-50 ring-1 ring-slate-200"
                          : "bg-transparent",
                  )}
                  onDragOver={(event) =>
                    handleZoneDragOver(event, meta.requestId)
                  }
                  onDragLeave={() =>
                    setOverZone((prev) =>
                      prev === meta.requestId ? null : prev,
                    )
                  }
                  onDrop={(event) => handleZoneDrop(event, meta.requestId)}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      filled
                        ? "bg-slate-900 text-white"
                        : over
                          ? "bg-primary text-primary-foreground"
                          : "bg-slate-200 text-slate-700",
                    )}
                  >
                    {tooth}
                  </div>

                  {filled ? (
                    <>
                      <div
                        className="flex flex-col items-center py-0.5"
                        aria-hidden
                      >
                        <div className="h-2.5 w-px bg-slate-400" />
                        <div className="h-1 w-1 rounded-full bg-slate-500" />
                        <div className="h-2.5 w-px bg-slate-400" />
                      </div>
                      {renderThumb(assignedIndex)}
                    </>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      드롭
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 미배정 — 있을 때만, 한 줄 스트립 */}
          {unassignedIndexes.length > 0 ? (
            <div
              className={cn(
                "rounded-lg border border-dashed px-2 py-2 transition-colors",
                overZone === UNASSIGNED_ZONE
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 bg-slate-50/70",
              )}
              onDragOver={(event) => handleZoneDragOver(event, UNASSIGNED_ZONE)}
              onDragLeave={() =>
                setOverZone((prev) =>
                  prev === UNASSIGNED_ZONE ? null : prev,
                )
              }
              onDrop={(event) => handleZoneDrop(event, UNASSIGNED_ZONE)}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-medium text-slate-700">
                  미배정 STL
                </p>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {unassignedIndexes.length}개 · 위로 드래그
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {unassignedIndexes.map((index) => renderThumb(index))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-4 py-2.5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
            {submitting ? "처리 중..." : "확인 후 다음"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
