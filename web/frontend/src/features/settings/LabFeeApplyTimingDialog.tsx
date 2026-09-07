// related files:
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/features/settings/LabPracticeSpecialSupplySection.tsx
// - web/frontend/src/shared/date/kst.ts
// - 2026-09-07: 기공비·특별공급가 수가 변경 시 즉시 / 특정일(KST)부터 적용.
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import {
  kstAddCivilDays,
  toKstYmd,
  formatKstYmdToKo,
} from "@/shared/date/kst";

export type LabFeeApplyTimingMode = "immediate" | "scheduled";

export type LabFeeApplyTimingResult = {
  applyMode: LabFeeApplyTimingMode;
  effectiveFromYmd?: string;
};

type LabFeeApplyTimingDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: (result: LabFeeApplyTimingResult) => void;
};

/** 내일(KST) YMD. */
export function labFeeApplyMinScheduledYmd(asOf: Date = new Date()): string {
  const today = toKstYmd(asOf) || "";
  return kstAddCivilDays(today, 1) || today;
}

/** `2026-03-15` → `3월 15일` */
export function formatLabFeeApplyYmdShort(ymd?: string | null): string {
  const raw = String(ymd || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return formatKstYmdToKo(ymd).replace(/\.$/, "");
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

export function LabFeeApplyTimingDialog({
  open,
  title = "적용 시기",
  description = "변경한 수가를 언제부터 적용할까요? 작업시작 시점 기준으로 반영됩니다.",
  confirming = false,
  onCancel,
  onConfirm,
}: LabFeeApplyTimingDialogProps) {
  const minYmd = useMemo(() => labFeeApplyMinScheduledYmd(), [open]);
  const [mode, setMode] = useState<LabFeeApplyTimingMode>("immediate");
  const [ymd, setYmd] = useState(minYmd);

  useEffect(() => {
    if (!open) return;
    setMode("immediate");
    setYmd(labFeeApplyMinScheduledYmd());
  }, [open]);

  const scheduledLabel = formatLabFeeApplyYmdShort(ymd);
  const canConfirm =
    mode === "immediate" ||
    (Boolean(ymd) && ymd >= minYmd && /^\d{4}-\d{2}-\d{2}$/.test(ymd));

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !confirming) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup
          value={mode}
          onValueChange={(value) =>
            setMode(value === "scheduled" ? "scheduled" : "immediate")
          }
          className="gap-3"
          disabled={confirming}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="immediate" id="lab-fee-apply-immediate" />
            <Label htmlFor="lab-fee-apply-immediate" className="font-normal">
              즉시 적용
            </Label>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="scheduled" id="lab-fee-apply-scheduled" />
              <Label htmlFor="lab-fee-apply-scheduled" className="font-normal">
                {mode === "scheduled" && ymd
                  ? `${scheduledLabel}부터`
                  : "특정일부터"}
              </Label>
            </div>
            {mode === "scheduled" ? (
              <Input
                type="date"
                min={minYmd}
                value={ymd}
                disabled={confirming}
                onChange={(e) => setYmd(e.target.value)}
                className="ml-6 max-w-[11rem]"
              />
            ) : null}
          </div>
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming} onClick={onCancel}>
            취소
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={!canConfirm || confirming}
            onClick={() => {
              if (mode === "scheduled") {
                onConfirm({
                  applyMode: "scheduled",
                  effectiveFromYmd: ymd,
                });
                return;
              }
              onConfirm({ applyMode: "immediate" });
            }}
          >
            {confirming ? "저장 중…" : "확인"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
