// related files:
// - web/frontend/src/shared/practice/autoMatchBudget.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUTO_MATCH_BUDGET_KEYS,
  AUTO_MATCH_BUDGET_KEY_LABELS,
  ADMIN_LAB_FEE_BASE,
  bandFromAdminBase,
  resolveAutoMatchBudgetOrDefaults,
  type AutoMatchBudgetKey,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import { formatWon } from "@/shared/practice/practiceTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

type AutoMatchLabFeeBudgetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PracticeTransferAutoMatchBudget | null;
  onSave: (next: PracticeTransferAutoMatchBudget) => void | Promise<void>;
};

export function AutoMatchLabFeeBudgetDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: AutoMatchLabFeeBudgetDialogProps) {
  const [draft, setDraft] = useState<PracticeTransferAutoMatchBudget>(() =>
    resolveAutoMatchBudgetOrDefaults(value),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(resolveAutoMatchBudgetOrDefaults(value));
  }, [open, value]);

  const setBand = (key: AutoMatchBudgetKey, side: "min" | "max", raw: string) => {
    const n = Math.max(0, Math.ceil(Number(raw || 0)));
    setDraft((prev) => {
      const current = prev.items[key] || bandFromAdminBase(ADMIN_LAB_FEE_BASE[key]);
      const nextBand =
        side === "min"
          ? { min: Math.min(n, current.max), max: current.max }
          : { min: Math.min(current.min, n), max: Math.max(n, 1) };
      return {
        version: 2,
        items: { ...prev.items, [key]: nextBand },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(resolveAutoMatchBudgetOrDefaults(draft));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-3xl gap-5 overflow-y-auto p-0 sm:rounded-2xl">
        <div className="border-b border-slate-200/80 px-6 pb-4 pt-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
              자동매칭 기공비 설정
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              기공비 범위에 맞는 인증 기공소만 참여합니다.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 gap-3 px-6 sm:grid-cols-2">
          {AUTO_MATCH_BUDGET_KEYS.map((key) => {
            const band = draft.items[key] || bandFromAdminBase(ADMIN_LAB_FEE_BASE[key]);
            const base = ADMIN_LAB_FEE_BASE[key];
            return (
              <div
                key={key}
                className={cn(
                  "rounded-xl border border-slate-200/90 bg-slate-50/60 p-4",
                  "shadow-[0_1px_0_rgba(15,23,42,0.03)]",
                )}
              >
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {AUTO_MATCH_BUDGET_KEY_LABELS[key]}
                  </p>
                  <p className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    기준 {formatWon(base)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`auto-match-fee-min-${key}`}
                      className="text-[11px] font-medium text-slate-500"
                    >
                      최소
                    </Label>
                    <Input
                      id={`auto-match-fee-min-${key}`}
                      type="number"
                      min={0}
                      step={1000}
                      className="h-10 rounded-lg border-slate-200 bg-white tabular-nums shadow-none focus-visible:ring-slate-300"
                      value={band.min}
                      onChange={(event) => setBand(key, "min", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`auto-match-fee-max-${key}`}
                      className="text-[11px] font-medium text-slate-500"
                    >
                      최대
                    </Label>
                    <Input
                      id={`auto-match-fee-max-${key}`}
                      type="number"
                      min={0}
                      step={1000}
                      className="h-10 rounded-lg border-slate-200 bg-white tabular-nums shadow-none focus-visible:ring-slate-300"
                      value={band.max}
                      onChange={(event) => setBand(key, "max", event.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            className="h-10 min-w-[5.5rem] rounded-lg"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
