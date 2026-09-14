// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
//
// history:
// - 2026-09-14: 모바일·좁은 폭 — 아이콘 우선(라벨은 sm+). 디자인SW·아노다이징 아이콘.
// - 2026-09-14: 버튼 라벨을 선택된 SW명으로 다시 표시(미설정 시 「디자인SW」).
// - 2026-09-03: 버튼 라벨을 저장된 SW명(ExoCAD) 대신 고정 「디자인SW」로.
import { Droplets, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";

type RequestSettingsToolbarProps = {
  /** 선택된 디자인 SW. 비어 있으면 「디자인SW」 */
  designSoftwareLabel?: string | null;
  onOpenDesignSoftwareModal?: () => void;
  anodizingEnabled?: boolean;
  anodizingSaving?: boolean;
  onToggleAnodizing?: () => void;
  className?: string;
  /** 아노다이징 토글 title (기본: 사업체/계정 기본값 안내) */
  anodizingTitle?: string;
  /** true면 항상 아이콘만(건수·상태 배지 제외). 모바일 헤더용 */
  iconOnly?: boolean;
};

/** 디자인 소프트웨어 · 아노다이징 기본값 버튼 (어벗생산의뢰 / 기공의뢰수신 공통) */
export function RequestSettingsToolbar({
  designSoftwareLabel,
  onOpenDesignSoftwareModal,
  anodizingEnabled = true,
  anodizingSaving = false,
  onToggleAnodizing,
  className,
  anodizingTitle = "기공소 기본값으로 저장되며, 이후 제조 주문 메타데이터에 반영됩니다",
  iconOnly = false,
}: RequestSettingsToolbarProps) {
  const label = String(designSoftwareLabel || "").trim() || "디자인SW";
  const anodizingLabel = anodizingEnabled ? "아노다이징 ON" : "아노다이징 OFF";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 shrink-0 gap-1.5",
          iconOnly
            ? "w-9 px-0"
            : "w-9 px-0 sm:w-auto sm:px-3",
        )}
        onClick={() => onOpenDesignSoftwareModal?.()}
        aria-label={label}
        title="디자인 소프트웨어 설정"
      >
        <Monitor className="h-4 w-4 shrink-0" />
        <span className={cn(iconOnly ? "sr-only" : "hidden sm:inline")}>
          {label}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 shrink-0 gap-1.5",
          iconOnly
            ? "w-9 px-0"
            : "w-9 px-0 sm:w-auto sm:px-3",
          !anodizingEnabled && "text-muted-foreground",
        )}
        disabled={anodizingSaving}
        onClick={() => onToggleAnodizing?.()}
        aria-label={anodizingLabel}
        title={anodizingTitle}
      >
        <Droplets
          className={cn(
            "h-4 w-4 shrink-0",
            anodizingEnabled ? "text-sky-600" : "opacity-50",
          )}
        />
        <span className={cn(iconOnly ? "sr-only" : "hidden sm:inline")}>
          {anodizingLabel}
        </span>
      </Button>
    </div>
  );
}
