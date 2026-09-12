// related files:
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/features/support/components/ConfirmDialog.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
import { useState } from "react";
import { AlertTriangle, ArrowRightLeft } from "lucide-react";
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
  DEMO_MODE_EXIT_WARNING,
  formatDemoModeBadgeAriaLabel,
  formatDemoModeBadgeLabel,
  resolveCreditLedgerDemoNoticeBody,
  resolveDemoModeExitBody,
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
  const ariaLabel = formatDemoModeBadgeAriaLabel(daysRemaining);
  const noticeBody = resolveCreditLedgerDemoNoticeBody(kind);
  const exitBody = resolveDemoModeExitBody(kind);

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
            aria-label={`${ariaLabel} — 클릭하여 실사용 전환`}
          >
            <Badge
              variant="outline"
              className="cursor-pointer border-amber-500/70 bg-amber-50 px-2 py-1 text-xs font-semibold tabular-nums text-amber-800 hover:bg-amber-100"
            >
              {badgeLabel}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-left">
          <p className="text-xs font-medium text-foreground">{ariaLabel}</p>
          <p className="mt-1 text-xs leading-relaxed">{noticeBody}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            클릭하면 실사용 전환을 확인할 수 있습니다.
          </p>
        </TooltipContent>
      </Tooltip>

      <ConfirmDialog
        open={confirmOpen}
        title={DEMO_MODE_EXIT_TITLE}
        panelClassName="max-w-sm"
        description={
          <div className="space-y-3">
            <div className="flex gap-3 rounded-xl border border-slate-200/90 bg-slate-50 px-3.5 py-3.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
                <ArrowRightLeft className="h-4 w-4" aria-hidden />
              </div>
              <p className="min-w-0 text-sm leading-relaxed text-slate-700">
                {exitBody}
              </p>
            </div>
            <div className="flex gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50 px-3.5 py-3">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden
              />
              <p className="min-w-0 text-sm leading-relaxed text-amber-950/85">
                {DEMO_MODE_EXIT_WARNING}
              </p>
            </div>
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
              "전환 입금 대기로 설정되었습니다. 충전 탭에서 입금해 주세요.",
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
