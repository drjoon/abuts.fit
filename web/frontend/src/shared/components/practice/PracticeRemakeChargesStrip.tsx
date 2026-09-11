// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/chatRemakeParts.ts
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts

import { useMemo, useState } from "react";
import { ChevronDown, Repeat } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { remakeChargeSourceLabel, compactRemakeSummaryLabel } from "@/features/chat/components/chatRemakeParts";
import type { PracticeTransferRemakeCharge } from "@/shared/practice/practiceTransferLabReceive";
import { cn } from "@/shared/ui/cn";

type PracticeRemakeChargesStripProps = {
  remakeCharges?: PracticeTransferRemakeCharge[] | null;
  className?: string;
};

const formatChargeAt = (raw?: string | null) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function PracticeRemakeChargesStrip({
  remakeCharges = null,
  className,
}: PracticeRemakeChargesStripProps) {
  const [open, setOpen] = useState(false);
  const history = useMemo(
    () => (Array.isArray(remakeCharges) ? remakeCharges : []),
    [remakeCharges],
  );

  const remakeAddedTotal = useMemo(
    () =>
      history.reduce((sum, row) => {
        const fee = Math.max(
          0,
          Math.round(
            Number(row?.billingDelta?.total ?? row?.billingDelta?.labFeeTotal ?? 0),
          ),
        );
        return sum + fee;
      }, 0),
    [history],
  );

  if (history.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-amber-200/80 bg-amber-50/70",
          className,
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-amber-950"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Repeat className="h-3.5 w-3.5 shrink-0 text-amber-700" />
              <span className="text-[12px] font-semibold">
                리메이크{" "}
                {remakeAddedTotal > 0
                  ? `+${remakeAddedTotal.toLocaleString("ko-KR")}원`
                  : ""}
                <span className="ml-1 font-normal text-amber-900/70">
                  · {history.length}건
                </span>
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-amber-800/70 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="space-y-1.5 border-t border-amber-200/70 px-3 py-2">
            {history.map((row, idx) => {
              const fee = Math.max(
                0,
                Math.round(
                  Number(
                    row?.billingDelta?.total ?? row?.billingDelta?.labFeeTotal ?? 0,
                  ),
                ),
              );
              const label =
                compactRemakeSummaryLabel(
                  String(row?.summaryLabel || "").trim(),
                ) ||
                (Array.isArray(row?.toothNumbers) && row.toothNumbers.length
                  ? row.toothNumbers.map((t) => `#${t}`).join(", ")
                  : "리메이크");
              return (
                <li
                  key={`${row?.chargeIndex ?? idx}-${label}-${row?.chargedAt || ""}`}
                  className="flex items-start justify-between gap-2 text-[11px] text-amber-950/90"
                >
                  <span className="min-w-0">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span className="rounded bg-amber-200/60 px-1 py-px text-[10px] font-medium text-amber-900">
                        {remakeChargeSourceLabel(row?.source)}
                      </span>
                      <span className="font-medium">{label}</span>
                    </span>
                    {formatChargeAt(row?.chargedAt) ? (
                      <span className="mt-0.5 block text-amber-900/60">
                        {formatChargeAt(row?.chargedAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold">
                    {fee > 0 ? `+${fee.toLocaleString("ko-KR")}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
