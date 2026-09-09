// related files:
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/features/support/components/ConfirmDialog.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { cn } from "@/shared/ui/cn";
import { toast } from "sonner";
import {
  DEMO_MODE_EXIT_CONFIRM_LABEL,
  DEMO_MODE_EXIT_TITLE,
  formatDemoModeBadgeLabel,
  resolveCreditLedgerDemoNoticeBody,
  resolveDemoModeExitDescriptionLines,
} from "./demoModeCopy";
import { useDemoMode } from "./useDemoMode";

type Props = {
  className?: string;
  /** 숨김(데모 아님) 시에도 레이아웃 자리 유지하지 않음 */
  onExited?: () => void;
};

export function DemoModeBadge({ className, onExited }: Props) {
  const { demoMode, daysRemaining, loading, exiting, exitDemoMode } =
    useDemoMode();
  const { kind } = useRequestorBusinessAccess();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading || !demoMode) return null;

  const badgeLabel = formatDemoModeBadgeLabel(daysRemaining);
  const noticeBody = resolveCreditLedgerDemoNoticeBody(kind);
  const exitLines = resolveDemoModeExitDescriptionLines(kind);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full",
              className,
            )}
            onClick={() => setConfirmOpen(true)}
            aria-label={`${badgeLabel} — 클릭하여 실사용 전환`}
          >
            <Badge
              variant="outline"
              className="cursor-pointer border-amber-500/70 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              {badgeLabel}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-left">
          <p className="text-xs leading-relaxed">{noticeBody}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            클릭하면 실사용 전환을 확인할 수 있습니다.
          </p>
        </TooltipContent>
      </Tooltip>

      <ConfirmDialog
        open={confirmOpen}
        title={DEMO_MODE_EXIT_TITLE}
        panelClassName="max-w-xl"
        description={
          <div className="space-y-1.5 leading-relaxed">
            {exitLines.map((line) => (
              <p key={line || "blank"} className="whitespace-nowrap">
                {line}
              </p>
            ))}
          </div>
        }
        confirmLabel={DEMO_MODE_EXIT_CONFIRM_LABEL}
        cancelLabel="취소"
        confirmTone="primary"
        busy={exiting}
        onCancel={() => {
          if (!exiting) setConfirmOpen(false);
        }}
        onConfirm={async () => {
          const ok = await exitDemoMode();
          if (ok) {
            setConfirmOpen(false);
            toast.success(
              "전환 입금 대기로 설정되었습니다. 충전 탭에서 최소 금액을 입금해 주세요.",
            );
            onExited?.();
          } else {
            toast.error("전환 대기 설정에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          }
        }}
      />
    </>
  );
}
