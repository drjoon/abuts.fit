// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// change-log:
// - 2026-08-16: 보철 — 콤팩트 리스트(큰 3D 프리뷰 제거)·치아/위치만 지정.
// - 2026-08-16: 기공의뢰수신 어벗·보철 — 프리뷰+치아 지정·백그라운드 업로드 진행률.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { toTempUploadFileKey } from "@/shared/hooks/useFilePreUpload";
import type { PreUploadFileProgress } from "@/shared/hooks/useFilePreUpload";
import type { PracticeTransferProstheticUploadSlot } from "@/shared/practice/practiceTransferLabReceive";

export type LabReceiveUploadSlotOption = {
  id: string;
  label: string;
  tooth: string;
};

export type LabReceiveWorkUploadAssignment = {
  file: File;
  slotId: string;
  tooth: string;
  label: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "abutment" | "prosthetic";
  files: File[];
  /** 선택 가능한 치아/슬롯 (남은 것만) */
  slots: LabReceiveUploadSlotOption[];
  /** 파일 인덱스별 초기 슬롯 id (파일명 파싱 등) */
  initialSlotIds?: Array<string | null | undefined>;
  uploadProgress?: Record<string, PreUploadFileProgress>;
  submitting?: boolean;
  splitMode?: boolean;
  onConfirm: (assignments: LabReceiveWorkUploadAssignment[]) => void | Promise<void>;
};

const progressLabel = (progress?: PreUploadFileProgress) => {
  if (!progress) return "대기";
  if (progress.status === "done") return "완료";
  if (progress.status === "error") return "실패";
  return `${Math.max(0, Math.min(100, progress.percent))}%`;
};

export function LabReceiveWorkUploadDialog({
  open,
  onOpenChange,
  mode,
  files,
  slots,
  initialSlotIds,
  uploadProgress,
  submitting = false,
  splitMode = false,
  onConfirm,
}: Props) {
  const [slotByFileIndex, setSlotByFileIndex] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    const next = files.map((_, idx) => {
      const suggested = String(initialSlotIds?.[idx] || "").trim();
      if (suggested && slots.some((slot) => slot.id === suggested)) {
        return suggested;
      }
      return "";
    });
    const used = new Set<string>();
    const assigned = next.map((id) => {
      if (id && !used.has(id)) {
        used.add(id);
        return id;
      }
      return "";
    });
    for (let i = 0; i < assigned.length; i += 1) {
      if (assigned[i]) continue;
      const free = slots.find((slot) => !used.has(slot.id));
      if (!free) break;
      assigned[i] = free.id;
      used.add(free.id);
    }
    setSlotByFileIndex(assigned);
  }, [open, files, slots, initialSlotIds]);

  const title = mode === "abutment" ? "어벗 업로드" : "보철 파일 지정";
  const subtitle =
    mode === "abutment"
      ? "각 파일의 치아번호를 지정하세요."
      : "각 파일을 치아(또는 브리지 스팬)에 맞추세요. 크라운·인레이는 치아당 1개, 브리지는 스팬당 1개입니다.";

  const slotMap = useMemo(() => {
    const map = new Map(slots.map((slot) => [slot.id, slot]));
    return map;
  }, [slots]);

  const handleSlotChange = (fileIndex: number, slotId: string) => {
    setError("");
    setSlotByFileIndex((prev) => {
      const next = [...prev];
      for (let i = 0; i < next.length; i += 1) {
        if (i !== fileIndex && next[i] === slotId) next[i] = "";
      }
      next[fileIndex] = slotId;
      return next;
    });
  };

  const handleConfirm = () => {
    if (submitting) return;
    const assignments: LabReceiveWorkUploadAssignment[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const slotId = String(slotByFileIndex[i] || "").trim();
      const slot = slotMap.get(slotId);
      if (!slot) {
        setError("모든 파일에 위치를 지정해주세요.");
        return;
      }
      assignments.push({
        file: files[i],
        slotId: slot.id,
        tooth: slot.tooth,
        label: slot.label,
      });
    }
    const unique = new Set(assignments.map((row) => row.slotId));
    if (unique.size !== assignments.length) {
      setError("같은 위치에 파일을 중복 지정할 수 없습니다.");
      return;
    }
    void onConfirm(assignments);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex w-[calc(100vw-1rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">
            {title}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {files.length}/{slots.length || files.length}
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {subtitle}
            {splitMode ? " 지금은 일부만 저장합니다." : null}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto px-4 py-3">
          {files.map((file, index) => {
            const key = toTempUploadFileKey(file);
            const progress = uploadProgress?.[key];
            const slotId = slotByFileIndex[index] || "";
            return (
              <li
                key={`${key}:${index}`}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {file.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] tabular-nums",
                      progress?.status === "done"
                        ? "text-emerald-600"
                        : progress?.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {progressLabel(progress)}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"
                  aria-hidden
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width]",
                      progress?.status === "error"
                        ? "bg-destructive"
                        : progress?.status === "done"
                          ? "bg-emerald-500"
                          : "bg-primary",
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(100, progress?.percent ?? 0))}%`,
                    }}
                  />
                </div>
                <div className="mt-2">
                  <Select
                    value={slotId || undefined}
                    onValueChange={(value) => handleSlotChange(index, value)}
                    disabled={submitting}
                  >
                    <SelectTrigger className="h-9 w-full bg-slate-50 text-sm">
                      <SelectValue placeholder="위치 선택 (예: 11 크라운)" />
                    </SelectTrigger>
                    <SelectContent>
                      {slots.map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p className="px-5 pb-2 text-xs text-destructive">{error}</p>
        ) : null}

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button type="button" disabled={submitting} onClick={handleConfirm}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                처리 중…
              </>
            ) : splitMode ? (
              "일부 저장"
            ) : (
              "업로드 & 작업완료"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function toLabReceiveSlotOptionsFromProsthetic(
  slots: PracticeTransferProstheticUploadSlot[],
): LabReceiveUploadSlotOption[] {
  return slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    tooth: slot.tooth,
  }));
}

/** 파일명 치아로 슬롯 자동 배정(중복·미매칭 없으면 성공) */
export function tryAutoAssignProstheticSlots(
  files: File[],
  slots: LabReceiveUploadSlotOption[],
  pendingTeethBySlotId: Map<string, string[]>,
  parseTooth: (filename: string) => string,
): LabReceiveWorkUploadAssignment[] | null {
  if (!files.length || files.length !== slots.length) return null;
  const used = new Set<string>();
  const assignments: LabReceiveWorkUploadAssignment[] = [];
  for (const file of files) {
    const tooth = String(parseTooth(file.name) || "").trim();
    if (!tooth) return null;
    const slot = slots.find((row) => {
      if (used.has(row.id)) return false;
      if (row.tooth === tooth) return true;
      const teeth = pendingTeethBySlotId.get(row.id) || [];
      return teeth.includes(tooth);
    });
    if (!slot) return null;
    used.add(slot.id);
    assignments.push({
      file,
      slotId: slot.id,
      tooth: slot.tooth,
      label: slot.label,
    });
  }
  return assignments.length === files.length ? assignments : null;
}
