// 기공소 AI 보철 — 내보낼 데이터 선택. 보철·스캔을 고르고 CAM 좌표 여부를 정한다.

import { useEffect, useState } from "react";
import { Download, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/ui/cn";

export type DesignExportRestoration = {
  id: string;
  label: string;
  fileName: string;
  teeth: string[];
  /** 내보낼 수 없으면 이유. */
  blocked: string | null;
};

export type DesignExportScan = {
  role: "upper" | "lower" | "bite";
  label: string;
  fileName: string;
};

/** 처리 중인 버튼. 브리지 합치기는 누른 뒤에만 한다. */
export type DesignExportBusy = "download" | "attach" | null;

export type DesignExportSelection = {
  restorations: DesignExportRestoration[];
  scans: DesignExportScan[];
  camCoordinates: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restorations: DesignExportRestoration[];
  scans: DesignExportScan[];
  busy: DesignExportBusy;
  onDownload: (selection: DesignExportSelection) => void;
  /** 없으면 채팅 첨부 버튼을 두지 않는다. */
  onAttach?: ((selection: DesignExportSelection) => void) | null;
};

export function DesignExportDialog({
  open,
  onOpenChange,
  restorations,
  scans,
  busy,
  onDownload,
  onAttach,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [camCoordinates, setCamCoordinates] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPicked(
      new Set(restorations.filter((row) => !row.blocked).map((row) => row.id)),
    );
  }, [open, restorations]);

  const rows = [
    ...restorations.map((row) => ({ id: row.id, label: row.label, blocked: row.blocked })),
    ...scans.map((row) => ({ id: `scan:${row.role}`, label: row.label, blocked: null })),
  ];
  const selectable = rows.filter((row) => !row.blocked);
  const allPicked = selectable.length > 0 && selectable.every((row) => picked.has(row.id));
  const somePicked = selectable.some((row) => picked.has(row.id));
  const selection = (): DesignExportSelection => ({
    restorations: restorations.filter((row) => !row.blocked && picked.has(row.id)),
    scans: scans.filter((row) => picked.has(`scan:${row.role}`)),
    camCoordinates,
  });
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[500] gap-4 sm:max-w-2xl"
        overlayClassName="z-[500]"
      >
        <DialogHeader>
          <DialogTitle>데이터 선택</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
          <div className="space-y-1">
            <label className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
              <Checkbox
                checked={allPicked ? true : somePicked ? "indeterminate" : false}
                disabled={selectable.length === 0}
                onCheckedChange={(checked) =>
                  setPicked(checked === true ? new Set(selectable.map((row) => row.id)) : new Set())
                }
              />
              전체 선택
            </label>
            {rows.map((row) => (
              <label
                key={row.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  picked.has(row.id) && "bg-muted",
                  row.blocked && "opacity-60",
                )}
              >
                <Checkbox
                  checked={picked.has(row.id)}
                  disabled={Boolean(row.blocked)}
                  onCheckedChange={(checked) => toggle(row.id, checked === true)}
                />
                <span className="font-medium">{row.label}</span>
                {row.blocked ? (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {row.blocked}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">내보내기 설정</p>
            <div className="rounded-md bg-muted px-3 py-2">
              <label className="flex items-center justify-between gap-3 text-xs font-medium">
                CAM 좌표 유지
                <Switch
                  checked={camCoordinates}
                  onCheckedChange={setCamCoordinates}
                  aria-label="CAM 좌표 유지"
                />
              </label>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {camCoordinates ? (
                  <>
                    스캔 파일 좌표 그대로 냅니다.
                    <br />
                    CAM에서 스캔과 겹쳐 놓입니다.
                  </>
                ) : (
                  <>
                    보철 중심을 원점으로 옮겨 mm로 냅니다.
                    <br />
                    스캔도 같은 원점을 씁니다.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-xs font-medium">
              파일 형식
              <span className="text-muted-foreground">STL (바이너리)</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {onAttach ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1"
              disabled={busy !== null || !somePicked}
              onClick={() => onAttach(selection())}
            >
              {busy === "attach" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              {busy === "attach" ? "처리 중…" : "채팅 첨부"}
            </Button>
          ) : null}
          <Button
            type="button"
            className="gap-1"
            disabled={busy !== null || !somePicked}
            onClick={() => onDownload(selection())}
          >
            {busy === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy === "download" ? "처리 중…" : "다운로드"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
