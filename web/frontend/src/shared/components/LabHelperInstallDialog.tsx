// change-log:
// - 2026-10-04: Mac 2단계 — 휴지통 안내 삭제, 「완료」만 → 「완료」를.
// - 2026-10-04: Mac 「설정 열기」— 프로토콜 링크 대신 ConfirmDialog(`MacPrivacySettingsOpenButton`).
// - 2026-10-03: 「잘 안 되면」 아코디언 제거. Mac은 3단계(완료 → 그래도 열기)만.
// - 2026-10-03: Mac 「열지 않음」→ 완료 → 시스템 설정 「그래도 열기」.
// - 2026-09-29: 열면 먼저 연결 확인 — 이미 떠 있으면 설치 파일을 다시 받지 않고 바로 이어간다.
//   Chrome 「로컬 네트워크 액세스」를 막았으면 허용 안내를 보인다.
// - 2026-09-28: 안내 단순화 — 3단계 한 줄씩, 누를 버튼은 칩으로. 예시 그림·부연 문단 제거. 다시 받기는 1단계 옆.
// - 2026-09-27: Mac 설치 — 단계별 안내(경고 창 「완료」 → 시스템 설정 「그래도 열기」 → 암호 → 설치), 예시 그림, 시스템 설정 바로 열기.
// - 2026-09-27: Mac 설치본(.app zip)·Gatekeeper 「그래도 열기」 안내.
// - 2026-09-27: Windows 연결 프로그램 설치 안내 — 열리면 설치 파일을 바로 받고, 실행해 「예」를 누르면
//   연결될 때까지 기다렸다가 자동으로 이어서 저장한다.
// related files:
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/MacPrivacySettingsOpenButton.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MacPrivacySettingsOpenButton } from "@/shared/components/MacPrivacySettingsOpenButton";
import {
  labHelperInstaller,
  labHelperOs,
  probeLabHelper,
  readLabHelperNetworkPermission,
  waitForLabHelper,
  type LabHelperInstaller,
} from "@/shared/files/labHelperClient";
import { cn } from "@/shared/ui/cn";
import { CheckCircle2, FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type LabHelperInstallDialogProps = {
  open: boolean;
  /** 연결되면 true, 닫으면 false */
  onResolved: (connected: boolean) => void;
};

function startInstallerDownload(installer: LabHelperInstaller) {
  const a = document.createElement("a");
  a.href = installer.href;
  a.download = installer.fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 화면에서 눌러야 할 버튼 이름 */
function Key({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded border bg-background px-1.5 py-px text-[12px] font-semibold text-foreground shadow-sm">
      {children}
    </span>
  );
}

function Step({ n, children, aside }: { n: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <li className="flex min-h-9 items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
      {aside}
    </li>
  );
}

export function LabHelperInstallDialog({ open, onResolved }: LabHelperInstallDialogProps) {
  const isMac = useMemo(() => labHelperOs() === "mac", []);
  const installer = useMemo(() => labHelperInstaller(isMac ? "mac" : "windows"), [isMac]);
  const [connected, setConnected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (!open) return;
    setConnected(false);
    setBlocked(false);
    const ac = new AbortController();
    let timer = 0;
    const done = () => {
      setConnected(true);
      timer = window.setTimeout(() => onResolvedRef.current(true), 600);
    };
    void (async () => {
      const already = await probeLabHelper();
      if (ac.signal.aborted) return;
      if (already) return done();
      if ((await readLabHelperNetworkPermission()) === "denied") setBlocked(true);
      else startInstallerDownload(installer);
      const health = await waitForLabHelper(ac.signal);
      if (health && !ac.signal.aborted) done();
    })();
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [open, installer]);

  const close = useCallback(() => onResolvedRef.current(false), []);

  const redownload = (
    <button
      type="button"
      className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={() => startInstallerDownload(installer)}
    >
      다시 받기
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="z-[320] max-w-sm gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-5 w-5 text-primary" />
            폴더 열기 프로그램 설치
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            처음 한 번만 하면 됩니다.
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <p className="mx-5 mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900">
            브라우저가 폴더 열기 프로그램 연결을 막고 있습니다.
            <br />
            주소창 왼쪽 아이콘 → <Key>로컬 네트워크 액세스</Key> 허용
            <br />
            이미 설치했다면 허용만 하면 이어집니다.
          </p>
        ) : null}

        <ol className="space-y-2 px-5 pb-4 text-sm">
          {isMac ? (
            <>
              <Step n={1} aside={redownload}>
                받은 zip을 풀고 <b>어벗츠 연결</b>을 실행합니다.
              </Step>
              <Step n={2}>
                「열지 않음」 창이 뜨면 <Key>완료</Key>를 누릅니다.
              </Step>
              <Step n={3}>
                <MacPrivacySettingsOpenButton />
                후 <Key>그래도 열기</Key>
              </Step>
            </>
          ) : (
            <>
              <Step n={1} aside={redownload}>
                받은 설치 파일 실행
              </Step>
              <Step n={2}>
                <Key>예</Key> 누르기
              </Step>
            </>
          )}
          <Step n={isMac ? 4 : 3}>
            브라우저가 물으면 <Key>허용</Key>
          </Step>
        </ol>

        <div
          className={cn(
            "flex items-center gap-2.5 border-t px-5 py-3 text-[13px]",
            connected ? "bg-emerald-50 text-emerald-800" : "bg-muted/50 text-muted-foreground",
          )}
        >
          {connected ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              연결됐습니다. 이어서 저장합니다.
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">설치되면 자동으로 이어집니다</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={close}>
                나중에
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
