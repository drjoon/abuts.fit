// change-log:
// - 2026-09-27: mode — helper(Windows 연결 프로그램: 폴더 고르기 창·경로 붙여넣기) / browser(Chrome·Edge 폴더 핸들).
// - 2026-09-27: 헬퍼 없이 브라우저 폴더 고르기(Chrome·Edge). 저장한 폴더 권한 다시 허용.
// - 2026-09-27: 기공소 작업 폴더 지정 — PC 폴더 고르기(헬퍼) 또는 경로 붙여넣기. 저장 시 헬퍼 확인 + 로컬 저장.
// related files:
// - web/frontend/src/shared/files/labWorkFolder.ts
// - web/frontend/src/shared/files/labHelperClient.ts
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
  ensureLabWorkFolderPermission,
  pickLabWorkFolder,
  readLabWorkFolderHandle,
} from "@/shared/files/labWorkFolder";
import {
  pickLabHelperWorkFolder,
  readLabHelperWorkFolder,
  setLabHelperWorkFolder,
} from "@/shared/files/labHelperClient";
import type { LabWorkFolderMode, LabWorkFolderPick } from "@/shared/files/useS3FileDownload";
import { FolderOpen, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export type LabWorkFolderDialogReason = "missing" | "denied" | "not_found" | "change";

type LabWorkFolderDialogProps = {
  open: boolean;
  reason: LabWorkFolderDialogReason;
  mode: LabWorkFolderMode;
  onSubmit: (pick: LabWorkFolderPick) => void;
  onCancel: () => void;
};

export function LabWorkFolderDialog({
  open,
  reason,
  mode,
  onSubmit,
  onCancel,
}: LabWorkFolderDialogProps) {
  const [busy, setBusy] = useState<"pick" | "allow" | "save" | null>(null);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<FileSystemDirectoryHandle | null>(null);
  const [path, setPath] = useState("");
  const isHelper = mode === "helper";

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(null);
    setPath(isHelper ? readLabHelperWorkFolder() : "");
    if (isHelper) return;
    let alive = true;
    void readLabWorkFolderHandle().then((handle) => {
      if (alive) setCurrent(handle);
    });
    return () => {
      alive = false;
    };
  }, [open, isHelper]);

  const handlePick = async () => {
    if (busy) return;
    setBusy("pick");
    setError("");
    try {
      if (isHelper) {
        const res = await pickLabHelperWorkFolder(path);
        if (res.ok) onSubmit({ kind: "helper", path: res.path });
        else if (res.code !== "CANCELED") setError(res.message);
        return;
      }
      const handle = await pickLabWorkFolder();
      if (handle) onSubmit({ kind: "browser", handle });
    } catch (err) {
      setError(err instanceof Error ? err.message : "폴더를 고르지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleSavePath = async () => {
    const next = path.trim().replace(/^"+|"+$/g, "");
    if (!next || busy) return;
    setBusy("save");
    setError("");
    try {
      const res = await setLabHelperWorkFolder(next);
      if (res.ok) onSubmit({ kind: "helper", path: res.path });
      else setError(res.message);
    } finally {
      setBusy(null);
    }
  };

  const handleAllow = async () => {
    if (busy || !current) return;
    setBusy("allow");
    setError("");
    try {
      if (await ensureLabWorkFolderPermission(current)) {
        onSubmit({ kind: "browser", handle: current });
        return;
      }
      setError("허용하지 않았습니다. 폴더를 다시 골라 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const showAllow = !isHelper && reason === "denied" && Boolean(current);
  const currentLabel = isHelper ? readLabHelperWorkFolder() : current?.name || "";

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
      : reason === "denied"
        ? {
            title: "작업 폴더 저장을 허용해 주세요",
            body: (
              <>
                브라우저를 다시 열면 한 번 더 묻습니다.
                <br />
                「허용」을 누르면 이어서 저장합니다.
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
                  작업열기·다운로드 파일이 이 폴더에 저장됩니다.
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

        <div className="space-y-3 px-5 py-4 text-sm">
          {showAllow ? (
            <Button
              type="button"
              className="w-full"
              disabled={Boolean(busy)}
              onClick={() => void handleAllow()}
            >
              {busy === "allow" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="mr-1.5 h-4 w-4" />
              )}
              「{current?.name}」 폴더 계속 쓰기
            </Button>
          ) : null}
          <Button
            type="button"
            variant={showAllow ? "outline" : "default"}
            className="w-full"
            disabled={Boolean(busy)}
            onClick={() => void handlePick()}
          >
            {busy === "pick" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="mr-1.5 h-4 w-4" />
            )}
            {busy === "pick"
              ? "폴더를 고르는 중…"
              : showAllow
                ? "다른 폴더 고르기"
                : "작업 폴더 고르기"}
          </Button>

          {isHelper ? (
            <div className="space-y-1.5">
              <p className="text-[13px] text-muted-foreground">또는 탐색기 주소를 붙여넣기</p>
              <div className="flex gap-2">
                <Input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSavePath();
                  }}
                  placeholder="예: \\DESKTOP-HAQNS44\CAM-in"
                  disabled={Boolean(busy)}
                  spellCheck={false}
                  className="font-mono text-[13px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!path.trim() || Boolean(busy)}
                  onClick={() => void handleSavePath()}
                >
                  {busy === "save" ? "확인 중…" : "저장"}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-[12px] leading-relaxed text-destructive">{error}</p>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {currentLabel && reason === "change" ? (
                <>
                  지금 작업 폴더: {currentLabel}
                  <br />
                </>
              ) : null}
              케이스마다 「날짜_치과명-환자명-치아번호」 폴더가 생깁니다.
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={Boolean(busy)}
            onClick={onCancel}
          >
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
