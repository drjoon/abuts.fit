// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/shared/components/practice/LabReceiveWorkUploadDialog.tsx
// change-log:
// - 2026-09-02: 어벗·보철 동시 업로드 — STL 썸네일 좌(어벗)/우(보철) 드래그 배정.
import { useEffect, useMemo, useState, type DragEvent } from "react";
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
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import { cn } from "@/shared/ui/cn";

export type LabReceiveDualRoleAssignResult = {
  abutmentFiles: File[];
  prostheticFiles: File[];
};

type RoleZone = "unassigned" | "abutment" | "prosthetic";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  abutmentCapacity: number;
  prostheticCapacity: number;
  submitting?: boolean;
  onConfirm: (result: LabReceiveDualRoleAssignResult) => void | Promise<void>;
};

function fileKey(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function LabReceiveDualRoleAssignDialog({
  open,
  onOpenChange,
  files,
  abutmentCapacity,
  prostheticCapacity,
  submitting = false,
  onConfirm,
}: Props) {
  const [roleByIndex, setRoleByIndex] = useState<RoleZone[]>([]);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overZone, setOverZone] = useState<RoleZone | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setDragIndex(null);
    setOverZone(null);
    setRoleByIndex(files.map(() => "unassigned" as RoleZone));
  }, [open, files]);

  const counts = useMemo(() => {
    let abutment = 0;
    let prosthetic = 0;
    let unassigned = 0;
    for (const role of roleByIndex) {
      if (role === "abutment") abutment += 1;
      else if (role === "prosthetic") prosthetic += 1;
      else unassigned += 1;
    }
    return { abutment, prosthetic, unassigned };
  }, [roleByIndex]);

  const canConfirm =
    !submitting &&
    files.length > 0 &&
    counts.unassigned === 0 &&
    (counts.abutment > 0 || counts.prosthetic > 0) &&
    counts.abutment <= abutmentCapacity &&
    counts.prosthetic <= prostheticCapacity;

  const moveToZone = (fileIndex: number, zone: RoleZone) => {
    let nextError = "";
    setRoleByIndex((prev) => {
      const next = [...prev];
      const current = next[fileIndex];
      if (current === zone) return prev;

      let abutment = 0;
      let prosthetic = 0;
      for (let i = 0; i < next.length; i += 1) {
        if (i === fileIndex) continue;
        if (next[i] === "abutment") abutment += 1;
        if (next[i] === "prosthetic") prosthetic += 1;
      }
      if (zone === "abutment" && abutment >= abutmentCapacity) {
        nextError = `어벗은 최대 ${abutmentCapacity}개까지 지정할 수 있습니다.`;
        return prev;
      }
      if (zone === "prosthetic" && prosthetic >= prostheticCapacity) {
        nextError = `보철은 최대 ${prostheticCapacity}개까지 지정할 수 있습니다.`;
        return prev;
      }
      next[fileIndex] = zone;
      return next;
    });
    setError(nextError);
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

  const handleZoneDragOver = (event: DragEvent, zone: RoleZone) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverZone(zone);
  };

  const handleZoneDrop = (event: DragEvent, zone: RoleZone) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const index = Number.parseInt(raw, 10);
    setOverZone(null);
    setDragIndex(null);
    if (!Number.isFinite(index) || index < 0 || index >= files.length) return;
    moveToZone(index, zone);
  };

  const handleConfirm = () => {
    if (!canConfirm) {
      if (counts.unassigned > 0) {
        setError("모든 파일을 어벗 또는 보철에 지정해주세요.");
      }
      return;
    }
    const abutmentFiles: File[] = [];
    const prostheticFiles: File[] = [];
    for (let i = 0; i < files.length; i += 1) {
      if (roleByIndex[i] === "abutment") abutmentFiles.push(files[i]);
      else if (roleByIndex[i] === "prosthetic") prostheticFiles.push(files[i]);
    }
    void onConfirm({ abutmentFiles, prostheticFiles });
  };

  const renderTile = (file: File, index: number) => {
    const dragging = dragIndex === index;
    return (
      <button
        key={fileKey(file, index)}
        type="button"
        draggable={!submitting}
        disabled={submitting}
        onDragStart={(event) => handleDragStart(event, index)}
        onDragEnd={handleDragEnd}
        className={cn(
          "flex w-[7.5rem] shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left active:cursor-grabbing",
          dragging && "opacity-50",
          submitting && "cursor-not-allowed opacity-60",
        )}
      >
        <div className="aspect-square w-full bg-slate-100">
          <StlPreviewThumbnail file={file} className="h-full w-full" />
        </div>
        <span className="truncate px-1.5 py-1 text-[10px] text-slate-600">
          {file.name}
        </span>
      </button>
    );
  };

  const renderZone = (
    zone: RoleZone,
    title: string,
    hint: string,
    capacity: number | null,
  ) => {
    const items = files
      .map((file, index) => ({ file, index }))
      .filter(({ index }) => roleByIndex[index] === zone);
    const count =
      zone === "abutment"
        ? counts.abutment
        : zone === "prosthetic"
          ? counts.prosthetic
          : counts.unassigned;
    const over = overZone === zone;
    return (
      <div
        className={cn(
          "flex min-h-[10rem] flex-col rounded-xl border border-dashed bg-slate-50/80 p-3 transition-colors",
          over && "border-primary bg-primary/5",
          zone === "abutment" && "border-sky-200",
          zone === "prosthetic" && "border-violet-200",
        )}
        onDragOver={(event) => handleZoneDragOver(event, zone)}
        onDragLeave={() => setOverZone((prev) => (prev === zone ? null : prev))}
        onDrop={(event) => handleZoneDrop(event, zone)}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {capacity == null ? count : `${count}/${capacity}`}
          </span>
        </div>
        <div className="flex min-h-[6.5rem] flex-wrap content-start gap-2">
          {items.length === 0 ? (
            <p className="m-auto text-xs text-muted-foreground">
              여기로 드래그
            </p>
          ) : (
            items.map(({ file, index }) => renderTile(file, index))
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 pr-12">
          <DialogTitle className="text-base font-semibold tracking-tight">
            디자인 파일 지정
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {files.length}개
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            STL 썸네일을 드래그해 왼쪽은 어벗, 오른쪽은 보철(크라운·브리지)로
            지정하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {renderZone(
            "unassigned",
            "미지정",
            "아래에서 어벗 또는 보철로 옮기세요.",
            null,
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {renderZone(
              "abutment",
              "어벗",
              "커스텀 어벗 디자인 STL",
              abutmentCapacity,
            )}
            {renderZone(
              "prosthetic",
              "보철",
              "크라운·브리지 등",
              prostheticCapacity,
            )}
          </div>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : counts.unassigned > 0 ? (
            <p className="text-xs text-muted-foreground">
              남은 파일 {counts.unassigned}개를 모두 지정해야 합니다.
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                처리 중…
              </>
            ) : (
              "다음"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
