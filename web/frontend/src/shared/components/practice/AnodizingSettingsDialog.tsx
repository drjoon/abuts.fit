// change-log:
// - 2026-11-19: 바깥 클릭·오버레이로 닫힌다.
// - 2026-11-19: 설정 메뉴 — 아노다이징 On/Off를 간단 모달로 고른다.
// related files:
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// - web/frontend/src/shared/components/practice/ShortPostRetentionDialog.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";

const CHOICES = [
  { value: true as const, label: "아노다이징 On" },
  { value: false as const, label: "아노다이징 Off" },
];

type AnodizingSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: boolean;
  saving?: boolean;
  onConfirm: (enabled: boolean) => void;
};

/** 기공소 기본값 — 아노다이징 On/Off 간단 선택 */
export function AnodizingSettingsDialog({
  open,
  onOpenChange,
  value = true,
  saving = false,
  onConfirm,
}: AnodizingSettingsDialogProps) {
  const [draft, setDraft] = useState(value !== false);

  useEffect(() => {
    if (open) setDraft(value !== false);
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[330] gap-4 sm:max-w-sm"
        overlayClassName="z-[325]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800">
            아노다이징
          </DialogTitle>
          <DialogDescription className="sr-only">
            아노다이징 On 또는 Off를 선택합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {CHOICES.map((choice) => {
            const selected = draft === choice.value;
            return (
              <Button
                key={choice.label}
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                className={cn(
                  "h-9 justify-start px-3",
                  selected && "bg-slate-100 font-medium",
                )}
                onClick={() => setDraft(choice.value)}
              >
                {choice.label}
                {selected ? (
                  <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    선택됨
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => onConfirm(draft)}
          >
            {saving ? "저장 중..." : "선택"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
