// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/business/requestorCapabilities.ts
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

export type PracticeTransferRoleMode = "send" | "receive";

type Props = {
  mode: PracticeTransferRoleMode;
  onChange: (mode: PracticeTransferRoleMode) => void;
  canSend: boolean;
  canReceive: boolean;
  className?: string;
};

const ENABLE_HINT =
  "비활성화를 활성화하려면 설정-사업자에서 설정 변경.";

/**
 * 기공의뢰서 발신(치과·기공실) / 수신(기공소) 전환.
 * 가능한 유형만 활성화하고, 불가한 쪽은 disabled.
 */
export const PracticeTransferRoleTabs = ({
  mode,
  onChange,
  canSend,
  canReceive,
  className,
}: Props) => {
  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5",
          className,
        )}
        role="tablist"
        aria-label="기공의뢰서 유형"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn("inline-flex", !canSend && "cursor-not-allowed")}
            >
              <Button
                type="button"
                role="tab"
                size="sm"
                aria-selected={mode === "send"}
                disabled={!canSend}
                variant={mode === "send" ? "default" : "ghost"}
                className={cn(
                  "h-9 px-3 text-xs",
                  mode !== "send" && "text-slate-600",
                  !canSend && "pointer-events-none",
                )}
                onClick={() => {
                  if (canSend) onChange("send");
                }}
              >
                발신(치과)
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-center">
            <p>발신(작성)</p>
            {!canSend ? <p className="mt-1 text-xs opacity-90">{ENABLE_HINT}</p> : null}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn("inline-flex", !canReceive && "cursor-not-allowed")}
            >
              <Button
                type="button"
                role="tab"
                size="sm"
                aria-selected={mode === "receive"}
                disabled={!canReceive}
                variant={mode === "receive" ? "default" : "ghost"}
                className={cn(
                  "h-9 px-3 text-xs",
                  mode !== "receive" && "text-slate-600",
                  !canReceive && "pointer-events-none",
                )}
                onClick={() => {
                  if (canReceive) onChange("receive");
                }}
              >
                수신(기공소)
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-center">
            <p>수신(내역)</p>
            {!canReceive ? (
              <p className="mt-1 text-xs opacity-90">{ENABLE_HINT}</p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
