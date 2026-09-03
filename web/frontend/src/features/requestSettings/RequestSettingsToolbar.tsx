// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
//
// history:
// - 2026-09-03: 버튼 라벨을 저장된 SW명(ExoCAD) 대신 고정 「디자인SW」로.
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

type RequestSettingsToolbarProps = {
  onOpenDesignSoftwareModal?: () => void;
  anodizingEnabled?: boolean;
  anodizingSaving?: boolean;
  onToggleAnodizing?: () => void;
  className?: string;
  /** 아노다이징 토글 title (기본: 사업체/계정 기본값 안내) */
  anodizingTitle?: string;
};

/** 디자인 소프트웨어 · 아노다이징 기본값 버튼 (어벗생산의뢰 / 기공의뢰수신 공통) */
export function RequestSettingsToolbar({
  onOpenDesignSoftwareModal,
  anodizingEnabled = true,
  anodizingSaving = false,
  onToggleAnodizing,
  className,
  anodizingTitle = "기공소 기본값으로 저장되며, 이후 제조 주문 메타데이터에 반영됩니다",
}: RequestSettingsToolbarProps) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onOpenDesignSoftwareModal?.()}
      >
        디자인SW
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={anodizingSaving}
        onClick={() => onToggleAnodizing?.()}
        title={anodizingTitle}
      >
        {anodizingEnabled ? "아노다이징 ON" : "아노다이징 OFF"}
      </Button>
    </div>
  );
}
