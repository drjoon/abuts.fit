// related files:
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// - web/frontend/src/features/requestSettings/DesignSoftwareSettingsDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
//
// history:
// - 2026-11-19: menu — 아노다이징도 유지홈처럼 간단 모달 On/Off. 팝오버 인라인·안내 문구 제거.
// - 2026-11-19: menu — 설정 아이콘 하나 + 팝오버(SW·유지홈·아노 아이콘·라벨).
// - 2026-10-24: 수신 채팅 SW·유지홈·아노는 아이콘만. 문구는 호버.
// - 2026-10-24: 수신 채팅에서 어벗츠 정품 버튼을 뺀다. SW·유지홈·아노는 그대로 둔다.
// - 2026-10-24: 수신 채팅 유지홈·아노다이징은 버튼 팝오버.
// - 2026-09-30: 채팅 작업 줄은 설정 아이콘 하나에 SW·아노를 넣고 맨 왼쪽에 둔다.
// - 2026-09-14: 모바일·좁은 폭 — 아이콘 우선(라벨은 sm+). 디자인SW·아노다이징 아이콘.
// - 2026-09-14: 버튼 라벨을 선택된 SW명으로 다시 표시(미설정 시 「디자인SW」).
// - 2026-09-03: 버튼 라벨을 저장된 SW명(ExoCAD) 대신 고정 「디자인SW」로.
import { useState } from "react";
import { Droplets, Monitor, Rows3, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import { anodizingPopoverNote } from "@/shared/anodizing/anodizingOptionCopy";
import { AnodizingSettingsDialog } from "@/shared/components/practice/AnodizingSettingsDialog";
import { CaseOptionPopoverButton } from "@/shared/components/practice/CaseOptionPopoverButton";
import { ShortPostRetentionDialog } from "@/shared/components/practice/ShortPostRetentionDialog";
import type { ShortPostRetentionChoice } from "@/pages/requestor/new_request/utils/shortPostRetention";

type RequestSettingsToolbarProps = {
  /** 선택된 디자인 SW. 비어 있으면 「디자인SW」 */
  designSoftwareLabel?: string | null;
  onOpenDesignSoftwareModal?: () => void;
  anodizingEnabled?: boolean;
  anodizingSaving?: boolean;
  onToggleAnodizing?: () => void;
  /** 채팅 작업 줄. 있으면 아노다이징은 팝오버로 고른다. */
  onAnodizingChange?: (enabled: boolean) => void;
  retentionGroove?: ShortPostRetentionChoice;
  onRetentionGrooveChange?: (value: ShortPostRetentionChoice) => void;
  className?: string;
  /** 아노다이징 토글 title (기본: 사업체/계정 기본값 안내) */
  anodizingTitle?: string;
  /** true면 항상 아이콘만(건수·상태 배지 제외). 모바일 헤더용 */
  iconOnly?: boolean;
  /** true면 라벨을 SW·아노로 축약(채팅 어벗 CTA 옆) */
  shortLabels?: boolean;
  /** 채팅 작업 줄 — 설정 아이콘 하나 + 팝오버(SW·유지홈·아노) */
  menu?: boolean;
};

/** 디자인 소프트웨어 · 아노다이징 기본값 버튼 (어벗생산의뢰 / 기공의뢰수신 공통) */
export function RequestSettingsToolbar({
  designSoftwareLabel,
  onOpenDesignSoftwareModal,
  anodizingEnabled = true,
  anodizingSaving = false,
  onToggleAnodizing,
  onAnodizingChange,
  retentionGroove = "none",
  onRetentionGrooveChange,
  className,
  iconOnly = false,
  shortLabels = false,
  menu = false,
}: RequestSettingsToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [anodizingOpen, setAnodizingOpen] = useState(false);
  const fullLabel = String(designSoftwareLabel || "").trim() || "디자인SW";
  const label = shortLabels && !menu ? "SW" : fullLabel;
  const anodizingFull = anodizingEnabled ? "아노다이징 On" : "아노다이징 Off";
  const retentionLabel =
    retentionGroove === "deep" ? "유지홈 있음" : "유지홈 없음";
  const compact = shortLabels && !menu;
  const iconButton = menu || (iconOnly && !compact);

  const setAnodizing = (enabled: boolean) => {
    if (onAnodizingChange) {
      onAnodizingChange(enabled);
      return;
    }
    if (enabled !== anodizingEnabled) onToggleAnodizing?.();
  };

  if (menu) {
    return (
      <div className={cn("shrink-0", className)} data-no-drag>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 shrink-0 px-0"
              aria-label="의뢰 설정"
              title="의뢰 설정"
              disabled={anodizingSaving}
            >
              <Settings className="h-3.5 w-3.5 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1.5" data-no-drag>
            <div className="flex flex-col gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-2 px-2"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenDesignSoftwareModal?.();
                }}
              >
                <Monitor className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{fullLabel}</span>
              </Button>
              {onRetentionGrooveChange ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start gap-2 px-2"
                  disabled={anodizingSaving}
                  onClick={() => {
                    setMenuOpen(false);
                    setRetentionOpen(true);
                  }}
                >
                  <Rows3
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      retentionGroove === "deep"
                        ? "text-slate-800"
                        : "opacity-40",
                    )}
                  />
                  <span className="min-w-0 truncate">{retentionLabel}</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-2 px-2"
                disabled={anodizingSaving}
                onClick={() => {
                  setMenuOpen(false);
                  setAnodizingOpen(true);
                }}
              >
                <Droplets
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    anodizingEnabled ? "text-sky-600" : "opacity-50",
                  )}
                />
                <span className="min-w-0 truncate">{anodizingFull}</span>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {onRetentionGrooveChange ? (
          <ShortPostRetentionDialog
            open={retentionOpen}
            onOpenChange={setRetentionOpen}
            value={retentionGroove === "deep" ? "deep" : "none"}
            onConfirm={(value) => {
              onRetentionGrooveChange(value);
              setRetentionOpen(false);
            }}
          />
        ) : null}
        <AnodizingSettingsDialog
          open={anodizingOpen}
          onOpenChange={setAnodizingOpen}
          value={anodizingEnabled !== false}
          saving={anodizingSaving}
          onConfirm={(enabled) => {
            setAnodizing(enabled);
            setAnodizingOpen(false);
          }}
        />
      </div>
    );
  }

  const controls = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "shrink-0 gap-1",
          compact
            ? "h-8 px-2 text-xs"
            : iconButton
              ? "h-8 w-8 px-0"
              : "h-9 w-9 px-0 gap-1.5 sm:w-auto sm:px-3",
        )}
        onClick={() => onOpenDesignSoftwareModal?.()}
        aria-label={fullLabel}
        title={fullLabel}
      >
        <Monitor
          className={cn(
            "shrink-0",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
        />
        <span
          className={cn(
            iconButton && !compact
              ? "sr-only"
              : compact
                ? undefined
                : "hidden sm:inline",
          )}
        >
          {label}
        </span>
      </Button>
      <CaseOptionPopoverButton
        className={cn(
          compact
            ? "h-8 px-2 text-xs"
            : iconButton
              ? "h-8 w-8 px-0"
              : "h-9 w-9 px-0 sm:w-auto sm:px-3",
          !anodizingEnabled && "text-muted-foreground",
        )}
        hideLabel={iconButton && !compact}
        labelClassName={iconButton || compact ? undefined : "hidden sm:inline"}
        icon={
          <Droplets
            className={cn(
              "shrink-0",
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
              anodizingEnabled ? "text-sky-600" : "opacity-50",
            )}
          />
        }
        label={anodizingFull}
        value={anodizingEnabled ? "on" : "off"}
        options={[
          { value: "on", label: "아노다이징 On" },
          { value: "off", label: "아노다이징 Off" },
        ]}
        disabled={anodizingSaving}
        optionNote={anodizingPopoverNote}
        onChange={(next) => setAnodizing(next === "on")}
      />
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center min-w-0",
        compact ? "gap-1" : "gap-1.5 sm:gap-2",
        className,
      )}
    >
      {controls}
    </div>
  );
}
