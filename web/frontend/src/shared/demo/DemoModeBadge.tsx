// related files:
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/shared/demo/DemoConversionDialog.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// change-log:
// - 2026-10-04: 전환 대기 뱃지 툴팁·aria를 기공소 확인 대기로 구분.
// - 2026-10-04: 전환 요청 다이얼로그를 DemoConversionDialog(기공소 직접 지급 확인)로 교체. 전환 대기 라벨.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { DemoConversionDialog } from "./DemoConversionDialog";
import {
  DEMO_MODE_PENDING_BADGE_HINT,
  formatDemoModeBadgeAriaLabel,
  formatDemoModeBadgeLabel,
  resolveCreditLedgerDemoNoticeBody,
} from "./demoModeCopy";
import { useDemoMode } from "./useDemoMode";

type Props = {
  className?: string;
  /** 숨김(데모 아님) 시에도 레이아웃 자리 유지하지 않음 */
  onExited?: () => void;
};

export function DemoModeBadge({ className, onExited }: Props) {
  const { demoMode, daysRemaining, conversionPending, loading, refresh } =
    useDemoMode();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading || !demoMode) return null;

  const badgeLabel = conversionPending
    ? "전환 대기"
    : formatDemoModeBadgeLabel(daysRemaining);
  const ariaLabel = conversionPending
    ? "실사용 전환 대기"
    : formatDemoModeBadgeAriaLabel(daysRemaining);
  const noticeBody = conversionPending
    ? DEMO_MODE_PENDING_BADGE_HINT
    : resolveCreditLedgerDemoNoticeBody("practice");
  const clickHint = conversionPending
    ? "클릭하면 기공소 확인 상태를 볼 수 있습니다."
    : "클릭하면 실사용 전환을 확인할 수 있습니다.";

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
            aria-label={
              conversionPending
                ? `${ariaLabel} — 클릭하여 대기 상태 확인`
                : `${ariaLabel} — 클릭하여 실사용 전환`
            }
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
          <p className="mt-1.5 text-[11px] text-muted-foreground">{clickHint}</p>
        </TooltipContent>
      </Tooltip>

      <DemoConversionDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onRequested={() => {
          void refresh();
          onExited?.();
        }}
      />
    </>
  );
}
