// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/AbutmentDesignConfirmDialog.tsx
// change-log:
// - 2026-09-12: 다중 STL — 3D 확인 전 파일명↔치아 매핑 요약·수정.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const EMPTY_VALUE = "__none__";

function toothLabel(tooth: string) {
  const t = String(tooth || "").trim();
  return t || "—";
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

  useEffect(() => {
    if (!open) return;
    setRequestIdByIndex(
      rows.map((row) => {
        const suggested = String(row.suggestedRequestId || "").trim();
        if (suggested && pendingMetas.some((m) => m.requestId === suggested)) {
          return suggested;
        }
        const byTooth = String(row.suggestedTooth || "").trim();
        if (byTooth) {
          const match = pendingMetas.find(
            (m) => String(m.tooth || "").trim() === byTooth,
          );
          if (match) return match.requestId;
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

  const duplicateRequestIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of requestIdByIndex) {
      const key = String(id || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const dups = new Set<string>();
    for (const [id, count] of counts) {
      if (count > 1) dups.add(id);
    }
    return dups;
  }, [requestIdByIndex]);

  const unmatchedSuggested = useMemo(() => {
    return rows.map((row, index) => {
      const suggested = String(row.suggestedTooth || "").trim();
      if (!suggested) return false;
      const assignedId = String(requestIdByIndex[index] || "").trim();
      const assignedTooth = toothByRequestId.get(assignedId) || "";
      return assignedTooth !== suggested;
    });
  }, [rows, requestIdByIndex, toothByRequestId]);

  const canConfirm = useMemo(() => {
    if (submitting || rows.length === 0) return false;
    if (requestIdByIndex.length !== rows.length) return false;
    if (requestIdByIndex.some((id) => !String(id || "").trim())) return false;
    if (duplicateRequestIds.size > 0) return false;
    return true;
  }, [submitting, rows.length, requestIdByIndex, duplicateRequestIds]);

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">
            파일 ↔ 치아 확인
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            각 STL이 어떤 치아 어벗인지 확인한 뒤 다음으로 진행하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto px-5 py-4">
          {rows.map((row, index) => {
            const assignedId = String(requestIdByIndex[index] || "").trim();
            const isDup = assignedId && duplicateRequestIds.has(assignedId);
            const suggestedMismatch = unmatchedSuggested[index];
            const suggested = String(row.suggestedTooth || "").trim();
            return (
              <div
                key={`${row.file.name}:${row.file.size}:${row.file.lastModified}:${index}`}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  isDup
                    ? "border-destructive/50 bg-destructive/5"
                    : suggestedMismatch
                      ? "border-amber-300 bg-amber-50/60"
                      : "border-slate-200 bg-white",
                )}
              >
                <div className="mb-2 min-w-0">
                  <p
                    className="truncate text-sm font-medium text-slate-900"
                    title={row.file.name}
                  >
                    {row.file.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {suggested
                      ? `파일명 추정 치아: ${toothLabel(suggested)}`
                      : "파일명에서 치아를 읽지 못함"}
                    {suggestedMismatch && assignedId
                      ? " · 선택과 다름"
                      : null}
                    {isDup ? " · 치아 중복" : null}
                  </p>
                </div>
                <Select
                  value={assignedId || EMPTY_VALUE}
                  disabled={submitting}
                  onValueChange={(value) => {
                    const next =
                      value === EMPTY_VALUE ? "" : String(value || "").trim();
                    setRequestIdByIndex((prev) => {
                      const copy = [...prev];
                      copy[index] = next;
                      return copy;
                    });
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="치아 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>치아 선택</SelectItem>
                    {pendingMetas.map((meta) => {
                      const tooth = toothLabel(meta.tooth);
                      const takenElsewhere =
                        String(requestIdByIndex[index] || "").trim() !==
                          meta.requestId &&
                        requestIdByIndex.some(
                          (id, i) =>
                            i !== index &&
                            String(id || "").trim() === meta.requestId,
                        );
                      return (
                        <SelectItem
                          key={meta.requestId}
                          value={meta.requestId}
                          disabled={takenElsewhere}
                        >
                          {tooth}
                          {takenElsewhere ? " (다른 파일)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {submitting ? "처리 중..." : "확인 후 다음"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
