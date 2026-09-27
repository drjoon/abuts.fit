// change-log:
// - 2026-09-27: 헬퍼 v2 — OS별 설치본(Windows/Mac), helper_outdated(새 버전 설치), exe_not_found는 재설치 없이 「다시 열기」.
//   브라우저 로컬 네트워크 허용 안내.
// - 2026-09-27: busyStatus — 연결 확인·파일 준비 중 화면.
// - 2026-09-24: 연결 확인 버튼에 5→1초 카운트다운 표시.
// - 2026-09-24: 기공소「열기」최초 1회 설치 안내 — zip 받기·더블클릭·연결 확인.
// related files:
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - web/frontend/public/downloads/lab-cad-helper/
// - bg/lab-cad-helper/install.ps1
// - bg/lab-cad-helper/mac/Abuts연결_설치.command
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import {
  detectLabHelperOs,
  ensureLabCadHelperReady,
  labCadHelperInstallerFor,
  wakeLabCadHelperViaProtocol,
  type LabCadHelperSetupReason,
} from "@/shared/files/labCadHelperClient";
import { useEffect, useMemo, useRef, useState } from "react";

const CHECK_TIMEOUT_SEC = 5;

export type LabCadHelperSetupVariant = LabCadHelperSetupReason;

/** 열기가 바로 끝나지 않을 때 설치 안내 대신 보여주는 진행 상태 */
export type LabCadOpenBusyStatus = "connecting" | "preparing";

type LabCadHelperSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 연결 확인 성공 시(열기 재시도) */
  onConnected: () => void;
  variant?: LabCadHelperSetupVariant;
  /** exe 미발견 안내에 표시할 SW 이름 */
  designSoftwareLabel?: string;
  /** 연결 확인·파일 준비. 있으면 설치 단계 대신 진행 문구만 보여 준다. */
  busyStatus?: LabCadOpenBusyStatus | null;
};

export function LabCadHelperSetupDialog({
  open,
  onOpenChange,
  onConnected,
  variant = "helper_missing",
  designSoftwareLabel = "",
  busyStatus = null,
}: LabCadHelperSetupDialogProps) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const swLabel = String(designSoftwareLabel || "").trim() || "디자인 프로그램";
  const isExeMissing = variant === "exe_not_found";
  const isOutdated = variant === "helper_outdated";
  const installer = useMemo(() => labCadHelperInstallerFor(detectLabHelperOs()), []);

  const clearCountdown = () => {
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownSec(null);
  };

  useEffect(() => {
    if (!open) {
      clearCountdown();
      setChecking(false);
    }
    return () => clearCountdown();
  }, [open]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = installer.href;
    a.download = installer.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleRetryOpen = () => {
    onOpenChange(false);
    onConnected();
  };

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    setCountdownSec(CHECK_TIMEOUT_SEC);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdownSec((prev) => {
        if (prev == null || prev <= 1) {
          if (countdownTimerRef.current != null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          return prev != null && prev <= 1 ? 0 : prev;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      wakeLabCadHelperViaProtocol();
      const ready = await ensureLabCadHelperReady({
        skipWake: true,
        timeoutMs: CHECK_TIMEOUT_SEC * 1000,
      });
      if (ready.status === "ready") {
        clearCountdown();
        onOpenChange(false);
        onConnected();
        return;
      }
      toast({
        title:
          ready.status === "need_update"
            ? "아직 예전 버전입니다"
            : "아직 연결되지 않았습니다",
        description: `zip을 열고 「${installer.runFileLabel}」를 실행했는지 확인해 주세요.`,
        variant: "destructive",
      });
    } finally {
      clearCountdown();
      setChecking(false);
    }
  };

  const busyCopy =
    busyStatus === "preparing"
      ? {
          title: "파일 준비 중",
          body: (
            <>
              파일을 받아 작업 폴더에 저장하고 있습니다.
              <br />
              잠시만 기다려 주세요.
            </>
          ),
        }
      : {
          title: "연결 확인 중",
          body: (
            <>
              PC 연결 프로그램을 확인하고 있습니다.
              <br />
              잠시만 기다려 주세요.
            </>
          ),
        };

  const title = isExeMissing
    ? `${swLabel}을(를) 찾지 못했습니다`
    : isOutdated
      ? "연결 프로그램 업데이트"
      : "처음 한 번만 설치";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busyStatus) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="z-[320] max-w-sm gap-0 p-0 sm:rounded-lg"
        hideClose={Boolean(busyStatus)}
        onPointerDownOutside={(event) => {
          if (busyStatus) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busyStatus) event.preventDefault();
        }}
      >
        {busyStatus ? (
          <div className="flex items-start gap-3 px-5 py-5">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {busyCopy.title}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {busyCopy.body}
              </p>
            </div>
          </div>
        ) : null}
        {busyStatus ? null : (
          <>
            <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {isExeMissing ? (
                  <>
                    파일은 작업 폴더에 저장했습니다.
                    <br />
                    PC에서 {swLabel}을(를) 켠 뒤 「다시 열기」를 눌러 주세요.
                  </>
                ) : isOutdated ? (
                  <>
                    작업 폴더 저장을 쓰려면 새 버전이 필요합니다.
                    <br />
                    한 번만 다시 설치해 주세요.
                  </>
                ) : (
                  <>이후에는 「작업열기」만 누르면 됩니다.</>
                )}
              </DialogDescription>
            </DialogHeader>

            {isExeMissing ? (
              <div className="px-5 py-4">
                <Button type="button" className="w-full" onClick={handleRetryOpen}>
                  다시 열기
                </Button>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-4 text-sm">
                <div className="space-y-2">
                  <p className="font-medium">1. 받기</p>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={checking}
                    onClick={handleDownload}
                  >
                    설치 파일 받기
                  </Button>
                </div>
                <div className="space-y-1">
                  <p className="font-medium">2. 설치</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    받은 zip을 열고
                    <br />
                    <span className="text-foreground">{installer.runFileLabel}</span>
                    를 실행하세요.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">3. 확인</p>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={checking}
                    onClick={() => void handleCheck()}
                  >
                    {checking
                      ? `확인 중… ${countdownSec ?? CHECK_TIMEOUT_SEC}`
                      : "설치 완료 — 열기"}
                  </Button>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    브라우저가 로컬 네트워크 접근을 물으면
                    <br />
                    「허용」을 눌러 주세요.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="border-t px-5 py-3 sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={checking}
                onClick={() => onOpenChange(false)}
              >
                닫기
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
