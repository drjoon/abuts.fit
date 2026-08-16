// related files:
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - 2026-08-17: 할증 카드 제거. 2/3영업일·묶음/신속·3+2 권고 안내.
// - 2026-08-17: 신속처리 확인 모달 공유·문구 단순화·카드형 스타일.

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PRACTICE_RUSH_CONFIRM_DETAILS,
  PRACTICE_RUSH_CONFIRM_PERIOD_LABEL,
  PRACTICE_RUSH_CONFIRM_TITLE,
  PRACTICE_RUSH_COURIER_DISCLAIMER,
} from "@/shared/practice/practiceWorkPeriod";

export type PracticeRushConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function PracticeRushConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: PracticeRushConfirmDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-max sm:max-w-[min(100vw-2rem,36rem)] sm:rounded-2xl">
        <DialogHeader className="space-y-3 px-5 pb-1 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong ring-1 ring-primary-muted/70">
              <Zap className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
                {PRACTICE_RUSH_CONFIRM_TITLE}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {PRACTICE_RUSH_CONFIRM_PERIOD_LABEL}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4 sm:px-6">
          <dl className="space-y-2.5 text-sm">
            {PRACTICE_RUSH_CONFIRM_DETAILS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-x-3"
              >
                <dt className="font-medium text-slate-500">{row.label}</dt>
                <dd className="min-w-0 space-y-1 leading-snug text-slate-800">
                  {typeof row.value === "string" ? (
                    <p className="sm:whitespace-nowrap">{row.value}</p>
                  ) : (
                    row.value.map((line) => (
                      <p key={line} className="sm:whitespace-nowrap">
                        {line}
                      </p>
                    ))
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {PRACTICE_RUSH_COURIER_DISCLAIMER}
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:space-x-0 sm:px-6">
          <Button type="button" variant="outline" className="h-9" onClick={handleCancel}>
            취소
          </Button>
          <Button
            type="button"
            className="h-9 bg-primary-strong text-white hover:bg-primary-strong/90"
            onClick={onConfirm}
          >
            진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
