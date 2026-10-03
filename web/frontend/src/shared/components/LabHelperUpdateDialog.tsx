/**
 * 연결 프로그램 구버전 → 최신 설치 안내.
 * related files:
 * - web/frontend/src/shared/components/LabHelperInstallDialog.tsx
 * - web/frontend/src/shared/files/labHelperClient.ts
 * - web/frontend/src/shared/components/LabHelperUpdatePrompt.tsx
 * change-log:
 * - 2026-10-04: Mac 「설정 열기」— 프로토콜 링크 대신 ConfirmDialog(`MacPrivacySettingsOpenButton`).
 * - 2026-10-03: 아코디언·제목 아래 안내 문구 제거. Mac은 3단계(완료 → 그래도 열기)만.
 * - 2026-10-03: Mac Gatekeeper — 완료 후 시스템 설정 「그래도 열기」.
 * - 2026-10-03: zip/exe만 받지 말고 열어서 설치하라고 짧게 안내.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MacPrivacySettingsOpenButton } from "@/shared/components/MacPrivacySettingsOpenButton";
import {
  LAB_HELPER_CURRENT_VERSION,
  labHelperInstaller,
  labHelperOs,
  probeLabHelper,
  startLabHelperInstallerDownload,
  waitForLabHelperMinVersion,
} from "@/shared/files/labHelperClient";
import { cn } from "@/shared/ui/cn";

type LabHelperUpdateDialogProps = {
  open: boolean;
  onResolved: (updated: boolean) => void;
};

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded border bg-background px-1.5 py-px text-[12px] font-semibold text-foreground shadow-sm">
      {children}
    </span>
  );
}

function Step({ n, children, aside }: { n: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <li className="flex min-h-9 items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
      {aside}
    </li>
  );
}

export function LabHelperUpdateDialog({ open, onResolved }: LabHelperUpdateDialogProps) {
  const isMac = useMemo(() => labHelperOs() === "mac", []);
  const installer = useMemo(
    () => labHelperInstaller(isMac ? "mac" : "windows"),
    [isMac],
  );
  const [done, setDone] = useState(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (!open) return;
    setDone(false);
    const ac = new AbortController();
    let timer = 0;
    const finish = () => {
      setDone(true);
      timer = window.setTimeout(() => onResolvedRef.current(true), 700);
    };
    void (async () => {
      const health = await probeLabHelper();
      if (ac.signal.aborted) return;
      if (Number(health?.version || 0) >= LAB_HELPER_CURRENT_VERSION) {
        finish();
        return;
      }
      startLabHelperInstallerDownload(isMac ? "mac" : "windows");
      const next = await waitForLabHelperMinVersion(
        ac.signal,
        LAB_HELPER_CURRENT_VERSION,
      );
      if (next && !ac.signal.aborted) finish();
    })();
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [open, isMac]);

  const close = useCallback(() => onResolvedRef.current(false), []);

  const redownload = (
    <button
      type="button"
      className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={() => startLabHelperInstallerDownload(isMac ? "mac" : "windows")}
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
            <RefreshCw className="h-5 w-5 text-primary" />
            연결 프로그램 업데이트
          </DialogTitle>
        </DialogHeader>

        <div className="mx-5 mb-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          <Download className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {installer.fileName}
          </span>
          {redownload}
        </div>

        <ol className="space-y-2 px-5 pb-4 text-sm">
          {isMac ? (
            <>
              <Step n={1}>
                받은 zip을 풀고 <b>어벗츠 연결</b>을 실행합니다.
              </Step>
              <Step n={2}>
                「열지 않음」 창이 뜨면 <Key>완료</Key>만 누릅니다.
                <br />
                <span className="text-xs text-muted-foreground">
                  <Key>휴지통으로 이동</Key>은 누르지 마세요.
                </span>
              </Step>
              <Step n={3}>
                <MacPrivacySettingsOpenButton />
                후 <Key>그래도 열기</Key>
              </Step>
            </>
          ) : (
            <>
              <Step n={1}>받은 설치 파일 실행</Step>
              <Step n={2}>
                이미 설치돼 있으면 창 없이 바로 갱신됩니다
              </Step>
            </>
          )}
        </ol>

        <div
          className={cn(
            "flex items-center gap-2.5 border-t px-5 py-3 text-[13px]",
            done ? "bg-emerald-50 text-emerald-800" : "bg-muted/50 text-muted-foreground",
          )}
        >
          {done ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              업데이트됐습니다.
            </>
          ) : (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">설치되면 자동으로 닫힙니다</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={close}
              >
                나중에
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
