/**
 * 어벗츠기공소 수신함 — 원청(직접 수행) · 협력 · 하청 표시/숨김.
 * 기본은 모두 표시. 클릭하면 해당 구분만 캘린더·목록에서 뺀다.
 */
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

export type LabReceiveRoleFilterKey = "prime" | "cooperation" | "subcontract";

export const LAB_RECEIVE_ROLE_FILTERS: ReadonlyArray<{
  key: LabReceiveRoleFilterKey;
  label: string;
  hint: string;
}> = [
  {
    key: "prime",
    label: "원청",
    hint: "어벗츠기공소가 직접 수행하는 의뢰입니다.",
  },
  {
    key: "cooperation",
    label: "협력",
    hint: "치과가 지정한 협력 기공소가 수행하는 의뢰입니다.",
  },
  {
    key: "subcontract",
    label: "하청",
    hint: "하청으로 넘긴 의뢰입니다.",
  },
];

export function labReceiveRoleOfTransfer(transfer: {
  assigneeKind?: string | null;
}): LabReceiveRoleFilterKey {
  const kind = String(transfer.assigneeKind || "").trim();
  if (kind === "cooperation") return "cooperation";
  if (kind === "subcontract") return "subcontract";
  return "prime";
}

type LabReceiveRoleFilterButtonsProps = {
  visible: Record<LabReceiveRoleFilterKey, boolean>;
  counts: Record<LabReceiveRoleFilterKey, number>;
  onToggle: (key: LabReceiveRoleFilterKey) => void;
  compact?: boolean;
};

export function LabReceiveRoleFilterButtons({
  visible,
  counts,
  onToggle,
  compact = false,
}: LabReceiveRoleFilterButtonsProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label="원청·협력·하청 표시"
    >
      {LAB_RECEIVE_ROLE_FILTERS.map((item) => {
        const shown = visible[item.key] !== false;
        const count = Math.max(0, Number(counts[item.key] || 0));
        const action = shown ? "숨기기" : "표시하기";
        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-full"
                aria-pressed={shown}
                aria-label={`${item.label} ${count}건 ${action}`}
                onClick={() => onToggle(item.key)}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer whitespace-nowrap",
                    compact ? "h-8 gap-1 px-2 text-xs" : "h-8 px-2.5 text-xs",
                    shown
                      ? "border-foreground/25 bg-foreground/5 text-foreground"
                      : "border-dashed text-muted-foreground opacity-60",
                  )}
                >
                  {item.label} {count}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {shown ? `${item.label} 숨기기` : `${item.label} 표시하기`}
              <br />
              {item.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
