// related files:
// - web/frontend/src/shared/practice/autoMatchBudget.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// change-log:
// - 2026-08-16: 최소 %·최대 %만 설정(인증 기공소 수가 평균 대비). 기본 80%~120%.
// - 2026-08-16: 문구 단축·추가 요청 제거·5% 스피너. 할증/평가 모달 스타일.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  DEFAULT_MAX_PCT,
  DEFAULT_MIN_PCT,
  resolveAutoMatchBudgetOrDefaults,
  resolveAutoMatchBudgetPctOrDefaults,
  type AbutsLabFeeCatalogItem,
  type AutoMatchBudgetPct,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import { cn } from "@/shared/ui/cn";

type AutoMatchLabFeeBudgetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PracticeTransferAutoMatchBudget | null;
  catalog?: AbutsLabFeeCatalogItem[] | null;
  onSave: (next: PracticeTransferAutoMatchBudget) => void | Promise<void>;
};

const PCT_STEP = 5;
const PCT_MAX = 500;

const snapPct = (raw: number, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(PCT_MAX, Math.max(0, Math.round(n / PCT_STEP) * PCT_STEP));
};

const PctStepper = ({
  id,
  value,
  ariaLabel,
  onChange,
}: {
  id: string;
  value: number;
  ariaLabel: string;
  onChange: (next: number) => void;
}) => (
  <div className="relative">
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={PCT_MAX}
      step={PCT_STEP}
      aria-label={ariaLabel}
      className={cn(
        "h-11 rounded-lg border-slate-200 bg-white pr-9 text-base tabular-nums shadow-none focus-visible:ring-slate-300",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      )}
      value={value}
      onChange={(event) => onChange(snapPct(Number(event.target.value), value))}
    />
    <div className="absolute inset-y-1 right-1 flex w-7 flex-col overflow-hidden rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        tabIndex={-1}
        className="flex h-1/2 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        aria-label={`${ariaLabel} 5% 증가`}
        onClick={() => onChange(snapPct(value + PCT_STEP, value))}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="flex h-1/2 items-center justify-center border-t border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        aria-label={`${ariaLabel} 5% 감소`}
        onClick={() => onChange(snapPct(value - PCT_STEP, value))}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

export function AutoMatchLabFeeBudgetDialog({
  open,
  onOpenChange,
  value,
  catalog,
  onSave,
}: AutoMatchLabFeeBudgetDialogProps) {
  const [draft, setDraft] = useState<AutoMatchBudgetPct>(() =>
    resolveAutoMatchBudgetPctOrDefaults(value),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = resolveAutoMatchBudgetPctOrDefaults(value);
    setDraft({
      minPct: snapPct(next.minPct, DEFAULT_MIN_PCT),
      maxPct: snapPct(next.maxPct, DEFAULT_MAX_PCT),
    });
  }, [open, value]);

  const setMinPct = (raw: number) => {
    setDraft((prev) => {
      const minPct = snapPct(raw, prev.minPct);
      return { minPct, maxPct: Math.max(minPct, prev.maxPct) };
    });
  };

  const setMaxPct = (raw: number) => {
    setDraft((prev) => {
      const maxPct = Math.max(PCT_STEP, snapPct(raw, prev.maxPct));
      return { minPct: Math.min(prev.minPct, maxPct), maxPct };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = resolveAutoMatchBudgetOrDefaults(
        {
          version: 3,
          minPct: draft.minPct,
          maxPct: draft.maxPct,
        },
        catalog,
      );
      await onSave(next);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-md gap-5 overflow-y-auto p-0 sm:rounded-2xl">
        <div className="border-b border-slate-200/80 px-6 pb-4 pt-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
              기공비 범위
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              평균 수가 대비 %. 범위 안 기공소만 매칭됩니다.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-2 gap-3 px-6">
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-match-fee-min-pct"
              className="text-[11px] font-medium text-slate-500"
            >
              최소 %
            </Label>
            <PctStepper
              id="auto-match-fee-min-pct"
              value={draft.minPct}
              ariaLabel="최소 %"
              onChange={setMinPct}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-match-fee-max-pct"
              className="text-[11px] font-medium text-slate-500"
            >
              최대 %
            </Label>
            <PctStepper
              id="auto-match-fee-max-pct"
              value={draft.maxPct}
              ariaLabel="최대 %"
              onChange={setMaxPct}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-[5.5rem] rounded-lg"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
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
