// change-log:
// - 2026-10-04: Mac 「설정 열기」— x-apple 프로토콜(브라우저 확인창) 대신 ConfirmDialog 안내.
// related files:
// - web/frontend/src/shared/components/LabHelperInstallDialog.tsx
// - web/frontend/src/shared/components/LabHelperUpdateDialog.tsx
// - web/frontend/src/features/support/components/ConfirmDialog.tsx
import { useCallback, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";

type MacPrivacySettingsOpenButtonProps = {
  className?: string;
};

/** Mac Gatekeeper 「그래도 열기」경로 안내. 브라우저 프로토콜 확인창을 띄우지 않는다. */
export function MacPrivacySettingsOpenButton({
  className,
}: MacPrivacySettingsOpenButtonProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={className ?? "mr-1.5 h-7 px-2 align-middle text-xs"}
        onClick={() => setOpen(true)}
      >
        <Settings className="mr-1 h-3.5 w-3.5" />
        설정 열기
      </Button>
      <ConfirmDialog
        open={open}
        title="시스템 설정에서 「그래도 열기」"
        description={
          <>
            시스템 설정 → 개인정보 보호 및 보안으로 이동하세요.
            <br />
            맨 아래 「그래도 열기」→ 암호 → 「열기」를 누릅니다.
          </>
        }
        confirmLabel="확인"
        confirmTone="primary"
        showCancel={false}
        showCloseButton
        closeOnBackdrop
        onCancel={close}
        onConfirm={close}
      />
    </>
  );
}
