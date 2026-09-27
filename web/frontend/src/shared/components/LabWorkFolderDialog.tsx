// change-log:
// - 2026-09-27: 기공소 작업 폴더 지정 — PC 폴더 고르기(헬퍼) 또는 경로 붙여넣기. 저장 시 헬퍼 확인 + 로컬 저장.
// related files:
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  detectLabHelperOs,
  pickLabWorkFolder,
  setLabWorkFolder,
} from "@/shared/files/labCadHelperClient";
import { FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type LabWorkFolderDialogReason = "missing" | "not_found" | "change";

type LabWorkFolderDialogProps = {
  open: boolean;
  reason: LabWorkFolderDialogReason;
  initialPath?: string;
  onSubmit: (path: string) => void;
  onCancel: () => void;
};

export function LabWorkFolderDialog({
  open,
  reason,
  initialPath = "",
  onSubmit,
  onCancel,
}: LabWorkFolderDialogProps) {
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState<"pick" | "save" | null>(null);
  const [error, setError] = useState("");
  const isMac = useMemo(() => detectLabHelperOs() === "mac", []);

  useEffect(() => {
    if (!open) return;
    setPath(initialPath);
    setError("");
    setBusy(null);
  }, [open, initialPath]);

  const handlePick = async () => {
    if (busy) return;
    setBusy("pick");
    setError("");
    try {
      const res = await pickLabWorkFolder(path || initialPath);
      if (res.ok && res.path) {
        onSubmit(res.path);
        return;
      }
      if (res.code !== "CANCELED") setError(res.message || "폴더를 고르지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    const next = path.trim().replace(/^"+|"+$/g, "");
    if (!next || busy) return;
    setBusy("save");
    setError("");
    try {
      const res = await setLabWorkFolder(next);
      if (res.ok && res.path) {
        onSubmit(res.path);
        return;
      }
      setError(res.message || "폴더를 저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const copy =
    reason === "not_found"
      ? {
          title: "작업 폴더를 찾을 수 없습니다",
          body: (
            <>
              폴더가 옮겨졌거나 공유 PC가 꺼져 있을 수 있습니다.
              <br />
              작업 폴더를 다시 골라 주세요.
            </>
          ),
        }
      : reason === "change"
        ? {
            title: "작업 폴더 변경",
            body: <>다음 저장부터 고른 폴더에 저장됩니다.</>,
          }
        : {
            title: "작업 폴더를 정해 주세요",
            body: (
              <>
                환자 케이스를 모아 두는 폴더를 한 번만 고르면 됩니다.
                <br />
                다운로드·작업열기 파일이 이 폴더에 저장됩니다.
              </>
            ),
          };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="z-[320] max-w-md gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">{copy.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {copy.body}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 text-sm">
          <Button
            type="button"
            className="w-full"
            disabled={Boolean(busy)}
            onClick={() => void handlePick()}
          >
            {busy === "pick" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="mr-1.5 h-4 w-4" />
            )}
            {busy === "pick" ? "PC에서 폴더를 고르는 중…" : "폴더 고르기"}
          </Button>

          <div className="space-y-1.5">
            <p className="text-[13px] text-muted-foreground">
              또는 탐색기 주소를 붙여넣기
            </p>
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSave();
              }}
              placeholder={isMac ? "예: /Users/이름/CAM-in" : "예: \\\\DESKTOP-HAQNS44\\CAM-in"}
              disabled={Boolean(busy)}
              spellCheck={false}
              className="font-mono text-[13px]"
            />
            {error ? (
              <p className="text-[12px] leading-relaxed text-destructive">{error}</p>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                케이스마다 「날짜_환자명」 폴더가 생깁니다.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={Boolean(busy)}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!path.trim() || Boolean(busy)}
            onClick={() => void handleSave()}
          >
            {busy === "save" ? "확인 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
