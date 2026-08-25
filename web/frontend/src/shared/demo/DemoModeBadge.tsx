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
import { cn } from "@/shared/ui/cn";
import { toast } from "sonner";
import {
  CREDIT_LEDGER_DEMO_NOTICE_BODY,
  DEMO_MODE_BADGE_LABEL,
  DEMO_MODE_EXIT_CONFIRM_LABEL,
  DEMO_MODE_EXIT_DESCRIPTION_LINES,
  DEMO_MODE_EXIT_TITLE,
} from "./demoModeCopy";
import { useDemoMode } from "./useDemoMode";

type Props = {
  className?: string;
  /** 숨김(데모 아님) 시에도 레이아웃 자리 유지하지 않음 */
  onExited?: () => void;
};

export function DemoModeBadge({ className, onExited }: Props) {
  const { demoMode, loading, exiting, exitDemoMode } = useDemoMode();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (loading || !demoMode) return null;

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
            aria-label="데모 모드 — 클릭하여 실사용 전환"
          >
            <Badge
              variant="outline"
              className="cursor-pointer border-amber-500/70 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              {DEMO_MODE_BADGE_LABEL}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-left">
          <p className="text-xs leading-relaxed">{CREDIT_LEDGER_DEMO_NOTICE_BODY}</p>
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
            {DEMO_MODE_EXIT_DESCRIPTION_LINES.map((line) => (
              <p key={line} className="whitespace-nowrap">
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
            toast.success("실사용으로 전환되었습니다.");
            onExited?.();
          } else {
            toast.error("실사용 전환에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          }
        }}
      />
    </>
  );
}
