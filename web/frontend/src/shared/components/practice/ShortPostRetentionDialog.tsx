// change-log:
// - 2026-10-24: 유지홈 버튼은 이 사진 모달로 고른다. 문구·사진·너비를 줄임.
// related files:
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/public/images/new-request/retention-post-none.jpg
// - web/frontend/public/images/new-request/retention-post-groove.jpg
import { useEffect, useRef, useState } from "react";
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
import {
  formatPostLengthMm,
  type ShortPostRetentionChoice,
} from "@/pages/requestor/new_request/utils/shortPostRetention";

const CHOICES: {
  value: ShortPostRetentionChoice;
  label: string;
  src: string;
  alt: string;
}[] = [
  {
    value: "none",
    label: "유지홈 없음",
    src: "/images/new-request/retention-post-none.jpg",
    alt: "유지홈 없는 포스트",
  },
  {
    value: "deep",
    label: "유지홈 있음",
    src: "/images/new-request/retention-post-groove.jpg",
    alt: "유지홈 있는 포스트",
  },
];

type ShortPostRetentionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postLengthMm?: number | null;
  value?: ShortPostRetentionChoice | null;
  onConfirm: (value: ShortPostRetentionChoice) => void;
};

/** 짧은 포스트일 때 유지홈 없음/있음을 참조 사진과 함께 고른다. */
export function ShortPostRetentionDialog({
  open,
  onOpenChange,
  postLengthMm = null,
  value = null,
  onConfirm,
}: ShortPostRetentionDialogProps) {
  const [draft, setDraft] = useState<ShortPostRetentionChoice | null>(value ?? "deep");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const confirmedRef = useRef(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        confirmedRef.current = false;
        setDraft(value ?? "deep");
      }
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    onConfirmRef.current(draftRef.current ?? value ?? "deep");
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[330] max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto p-4 sm:w-[520px] sm:max-w-[520px]"
        overlayClassName="z-[325]"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800">
            유지홈
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-700">
            {typeof postLengthMm === "number" && Number.isFinite(postLengthMm) ? (
              <>
                포스트 길이 {formatPostLengthMm(postLengthMm)}mm.
                <br />
              </>
            ) : null}
            유지홈을 선택해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map((choice) => {
            const selected = draft === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "rounded-lg border bg-white p-2 text-left transition-colors",
                  selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-slate-200 hover:border-slate-300",
                )}
                onClick={() => setDraft(choice.value)}
              >
                <img
                  src={choice.src}
                  alt={choice.alt}
                  className="h-36 w-full rounded-md border border-slate-200 bg-slate-50 object-contain sm:h-40"
                />
                <span className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                  {choice.label}
                  {selected ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      선택됨
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              confirmedRef.current = true;
              onConfirm(draft);
            }}
          >
            선택
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
