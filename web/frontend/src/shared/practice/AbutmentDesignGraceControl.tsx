import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

function graceLabel(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 디자인 확정 후 제조사 준비 전 남은 시간. 끝나면 취소가 닫힌다. */
export function AbutmentDesignGraceControl({
  deadlineAt,
  busy = false,
  onCancel,
  className,
}: {
  deadlineAt: string | null;
  busy?: boolean;
  onCancel?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineAt) return;
    const end = new Date(deadlineAt).getTime();
    if (!Number.isFinite(end) || end <= Date.now()) return;
    const id = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= end) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  const end = deadlineAt ? new Date(deadlineAt).getTime() : Number.NaN;
  if (!deadlineAt || !Number.isFinite(end)) return null;
  const open = end > now;
  const label = open ? `취소 ${graceLabel(end - now)}` : "제조 준비 반영 중";

  if (onCancel && open) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            className={cn("h-8 gap-1.5 px-2.5 text-xs font-semibold tabular-nums", className)}
            onClick={onCancel}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            <span>{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[520] max-w-xs text-xs">
          디자인 확정을 취소합니다.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className={cn("px-2 text-xs font-semibold tabular-nums text-foreground", className)}>
      {label}
    </span>
  );
}
