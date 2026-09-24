// change-log:
// - 2026-09-24: variant=exe_not_found — 디자인 SW 실행 후 재설치 안내.
// - 2026-09-24: 연결 확인 버튼에 5→1초 카운트다운 표시.
// - 2026-09-24: 「설치 완료 — 열기」primary·연결 확인 5초.
// - 2026-09-24: 설치 안내 카피 축약 — 받기 → 더블클릭 → 확인.
// - 2026-09-24: 기공소「열기」최초 1회 설치 안내 — zip 받기·더블클릭·연결 확인.
// related files:
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - web/frontend/public/downloads/lab-cad-helper/
// - bg/lab-cad-helper/여기를_더블클릭_설치.cmd
import { Button } from "@/components/ui/button";
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
  ensureLabCadHelperReady,
  LAB_CAD_HELPER_ZIP_PATH,
  wakeLabCadHelperViaProtocol,
} from "@/shared/files/labCadHelperClient";
import { useEffect, useRef, useState } from "react";

const CHECK_TIMEOUT_SEC = 5;

export type LabCadHelperSetupVariant = "helper_missing" | "exe_not_found";

type LabCadHelperSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 연결 확인 성공 시(열기 재시도) */
  onConnected: () => void;
  variant?: LabCadHelperSetupVariant;
  /** exe 미발견 안내에 표시할 SW 이름 */
  designSoftwareLabel?: string;
};

export function LabCadHelperSetupDialog({
  open,
  onOpenChange,
  onConnected,
  variant = "helper_missing",
  designSoftwareLabel = "",
}: LabCadHelperSetupDialogProps) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const swLabel = String(designSoftwareLabel || "").trim() || "디자인 프로그램";
  const isExeMissing = variant === "exe_not_found";

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
    a.href = LAB_CAD_HELPER_ZIP_PATH;
    a.download = "AbutsCad연결_설치.zip";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      const status = await ensureLabCadHelperReady({
        skipWake: true,
        timeoutMs: CHECK_TIMEOUT_SEC * 1000,
      });
      if (status === "ready") {
        clearCountdown();
        onOpenChange(false);
        onConnected();
        return;
      }
      toast({
        title: "아직 연결되지 않았습니다",
        description: isExeMissing
          ? `${swLabel}을(를) 켠 뒤 「여기를_더블클릭_설치」를 다시 실행했는지 확인해 주세요.`
          : "zip을 열고 「여기를_더블클릭_설치」를 실행했는지 확인해 주세요.",
        variant: "destructive",
      });
    } finally {
      clearCountdown();
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[320] max-w-sm gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">
            {isExeMissing ? `${swLabel} 경로를 찾지 못했습니다` : "처음 한 번만 설치"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {isExeMissing ? (
              <>
                PC에서 {swLabel}을(를) 실행한 뒤,
                <br />
                아래 설치를 다시 진행해 주세요.
              </>
            ) : (
              <>이후에는 「열기」만 누르면 됩니다.</>
            )}
          </DialogDescription>
        </DialogHeader>

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
              {isExeMissing ? (
                <>
                  {swLabel}을(를) 켠 상태에서
                  <br />
                  <span className="text-foreground">여기를_더블클릭_설치</span>
                  를 다시 실행하세요.
                </>
              ) : (
                <>
                  받은 zip을 열고
                  <br />
                  <span className="text-foreground">여기를_더블클릭_설치</span>
                  를 실행하세요.
                </>
              )}
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
          </div>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
