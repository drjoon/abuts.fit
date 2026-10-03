// change-log:
// - 2026-10-04: 「설정 열기」클릭 가능 CTA — outline → primary(파란).
// - 2026-10-04: 헬퍼 v10+면 컨펌 없이 바로 시스템 설정. 없으면 ConfirmDialog 수동 안내(프로토콜 안 씀).
// related files:
// - web/frontend/src/shared/components/LabHelperInstallDialog.tsx
// - web/frontend/src/shared/components/LabHelperUpdateDialog.tsx
// - web/frontend/src/shared/files/labHelperClient.ts
// - web/frontend/src/features/support/components/ConfirmDialog.tsx
import { useCallback, useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { openLabHelperPrivacySettings } from "@/shared/files/labHelperClient";

type MacPrivacySettingsOpenButtonProps = {
  className?: string;
};

/** Mac Gatekeeper 「그래도 열기」. 헬퍼가 있으면 바로 열고, 없으면 수동 경로만 안내한다. */
export function MacPrivacySettingsOpenButton({
  className,
}: MacPrivacySettingsOpenButtonProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const closeGuide = useCallback(() => setGuideOpen(false), []);

  const onClick = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void openLabHelperPrivacySettings()
      .then((ok) => {
        if (!ok) setGuideOpen(true);
      })
      .finally(() => setBusy(false));
  }, [busy]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="default"
        className={className ?? "mr-1.5 h-7 px-2 align-middle text-xs"}
        disabled={busy}
        onClick={onClick}
      >
        <Settings className="mr-1 h-3.5 w-3.5" />
        설정 열기
      </Button>
      <ConfirmDialog
        open={guideOpen}
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
        onCancel={closeGuide}
        onConfirm={closeGuide}
      />
    </>
  );
}
