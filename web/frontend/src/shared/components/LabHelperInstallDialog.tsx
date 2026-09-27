// change-log:
// - 2026-09-27: Mac 설치 — 단계별 안내(경고 창 「완료」 → 시스템 설정 「그래도 열기」 → 암호 → 설치), 예시 그림, 시스템 설정 바로 열기.
// - 2026-09-27: Mac 설치본(.app zip)·Gatekeeper 「그래도 열기」 안내.
// - 2026-09-27: Windows 연결 프로그램 설치 안내 — 열리면 설치 파일을 바로 받고, 실행해 「예」를 누르면
//   연결될 때까지 기다렸다가 자동으로 이어서 저장한다.
// related files:
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
import {
  labHelperInstaller,
  labHelperOs,
  waitForLabHelper,
  type LabHelperInstaller,
} from "@/shared/files/labHelperClient";
import { cn } from "@/shared/ui/cn";
import { CheckCircle2, Download, Loader2, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

/** macOS 13+ 「개인정보 보호 및 보안」. 브라우저가 「시스템 설정을 열까요?」를 한 번 묻는다. */
const MAC_PRIVACY_SETTINGS_URL = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

/** macOS 창을 흉내 낸 예시 그림. 누를 버튼만 강조한다. */
function MacMockWindow({
  title,
  body,
  buttons,
}: {
  title: string;
  body: string;
  buttons: Array<{ label: string; primary?: boolean; muted?: boolean }>;
}) {
  return (
    <div className="mt-2 rounded-lg border bg-background p-3 shadow-sm">
      <div className="mb-2 flex gap-1">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
      <p className="text-[12px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{body}</p>
      <div className="mt-2 flex justify-end gap-1.5">
        {buttons.map((b) => (
          <span
            key={b.label}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px]",
              b.primary
                ? "bg-primary font-semibold text-primary-foreground ring-2 ring-primary/40 ring-offset-1"
                : "border bg-muted/50 text-muted-foreground",
              b.muted && "line-through opacity-60",
            )}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MacInstallSteps({ fileName }: { fileName: string }) {
  return (
    <ol className="space-y-4">
      <li className="flex gap-2.5">
        <StepBadge n={1} />
        <div>
          <p className="font-medium">받은 파일을 열어 「어벗츠 연결」을 더블클릭하세요.</p>
          <p className="text-[12px] text-muted-foreground">
            다운로드 폴더의 <b>{fileName}</b>을 더블클릭하면 앱이 나옵니다.
            <br />
            Safari는 자동으로 풀어 줍니다.
          </p>
        </div>
      </li>
      <li className="flex gap-2.5">
        <StepBadge n={2} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">경고 창이 뜨면 「완료」를 누르세요.</p>
          <p className="text-[12px] text-muted-foreground">
            Apple 공증 전이라 처음 한 번 뜹니다.
            <br />
            「휴지통으로 이동」은 누르지 마세요.
          </p>
          <MacMockWindow
            title="'어벗츠 연결'을(를) 열 수 없음"
            body="Apple은 '어벗츠 연결'에 악성 코드가 없음을 확인할 수 없습니다."
            buttons={[{ label: "휴지통으로 이동", muted: true }, { label: "완료", primary: true }]}
          />
        </div>
      </li>
      <li className="flex gap-2.5">
        <StepBadge n={3} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">시스템 설정에서 「그래도 열기」를 누르세요.</p>
          <p className="text-[12px] text-muted-foreground">
            아래 버튼으로 「개인정보 보호 및 보안」을 연 뒤 맨 아래로 내리세요.
            <br />
            2번을 먼저 해야 이 버튼이 보입니다.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <a href={MAC_PRIVACY_SETTINGS_URL}>
              <Settings className="mr-1.5 h-4 w-4" />
              시스템 설정 열기
            </a>
          </Button>
          <MacMockWindow
            title="개인정보 보호 및 보안"
            body="'어벗츠 연결'이(가) 확인된 개발자가 아니므로 사용이 차단되었습니다."
            buttons={[{ label: "그래도 열기", primary: true }]}
          />
        </div>
      </li>
      <li className="flex gap-2.5">
        <StepBadge n={4} />
        <div>
          <p className="font-medium">Mac 암호(또는 Touch ID)를 넣고 「열기」 → 「설치」를 누르세요.</p>
          <p className="text-[12px] text-muted-foreground">
            설치가 끝나면 이 창이 저절로 이어서 저장합니다.
          </p>
        </div>
      </li>
      <li className="rounded-md bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
        macOS 14 이하: 앱을 Control 키와 함께 클릭 → 「열기」 → 「열기」를 누르면 됩니다.
      </li>
    </ol>
  );
}

export function LabHelperInstallDialog({ open, onResolved }: LabHelperInstallDialogProps) {
  const isMac = useMemo(() => labHelperOs() === "mac", []);
  const installer = useMemo(() => labHelperInstaller(isMac ? "mac" : "windows"), [isMac]);
  const [connected, setConnected] = useState(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (!open) return;
    setConnected(false);
    startInstallerDownload(installer);
    const ac = new AbortController();
    let timer = 0;
    void waitForLabHelper(ac.signal).then((health) => {
      if (!health || ac.signal.aborted) return;
      setConnected(true);
      timer = window.setTimeout(() => onResolvedRef.current(true), 600);
    });
    return () => {
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [open, installer]);

  const close = useCallback(() => onResolvedRef.current(false), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className={cn(
          "z-[320] gap-0 p-0 sm:rounded-lg",
          isMac ? "max-h-[90vh] max-w-lg overflow-y-auto" : "max-w-md",
        )}
      >
        <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">연결 프로그램을 설치해 주세요</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            처음 한 번만 설치하면 됩니다.
            <br />
            이후에는 파일을 작업 폴더에 풀어 두고 폴더를 바로 열어 줍니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed">
          {isMac ? (
            <MacInstallSteps fileName={installer.fileName} />
          ) : (
            <p>
              받은 <b>{installer.fileName}</b>을 실행하고 「예」를 누르세요.
              <br />
              「Windows의 PC 보호」 창이 뜨면 「추가 정보」 → 「실행」을 누르세요.
            </p>
          )}
          <p className="text-[12px] text-muted-foreground">
            설치 후에는 화면에 보이지 않게 켜져 있습니다.
            <br />
            브라우저가 로컬 네트워크 접근을 물으면 「허용」을 눌러 주세요.
          </p>
          <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-[13px]">
            {connected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                연결됐습니다. 이어서 저장합니다.
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                설치를 기다리는 중…
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => startInstallerDownload(installer)}>
            <Download className="mr-1.5 h-4 w-4" />
            설치 파일 다시 받기
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={close}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
