// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-08-23: 라벨·메모를 `치과 메모: …` 한 줄로 표시.
import { useEffect, useState, type MouseEvent } from "react";
import { HelpCircle, Pencil, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

export type CounterpartyMemoViewer = "practice" | "lab";

const PRIVACY_COPY: Record<
  CounterpartyMemoViewer,
  { tooltip: string; dialog: string; placeholder: string }
> = {
  practice: {
    tooltip: "우리 치과만 보는 메모입니다. 기공소에는 공개되지 않습니다.",
    dialog: "우리 치과 임직원만 볼 수 있습니다. 기공소·외부에 공개되지 않습니다.",
    placeholder: "품질, 납기, 주의사항 등",
  },
  lab: {
    tooltip: "우리 기공소만 보는 메모입니다. 치과에는 공개되지 않습니다.",
    dialog: "우리 기공소 구성원만 볼 수 있습니다. 치과·외부에 공개되지 않습니다.",
    placeholder: "의뢰 성향, 주의사항 등",
  },
};

type CounterpartyMemoStripProps = {
  viewer: CounterpartyMemoViewer;
  label: string;
  memo?: string | null;
  maxLength: number;
  onSave: (memo: string) => Promise<boolean>;
  className?: string;
  emptyHint?: string;
  stopPropagation?: boolean;
};

export function CounterpartyMemoStrip({
  viewer,
  label,
  memo = "",
  maxLength,
  onSave,
  className,
  emptyHint = "메모 없음",
  stopPropagation = true,
}: CounterpartyMemoStripProps) {
  const privacy = PRIVACY_COPY[viewer];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentMemo, setCurrentMemo] = useState(() => String(memo || "").trim());
  const [draftMemo, setDraftMemo] = useState(() => String(memo || "").trim());

  useEffect(() => {
    setCurrentMemo(String(memo || "").trim());
  }, [memo]);

  useEffect(() => {
    if (!open) return;
    setDraftMemo(currentMemo);
  }, [open, currentMemo]);

  const onTriggerPointerDown = (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
  };

  const save = async () => {
    const next = String(draftMemo || "").trim().slice(0, maxLength);
    setSaving(true);
    try {
      const ok = await onSave(next);
      if (!ok) return;
      setCurrentMemo(next);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const hasMemo = Boolean(currentMemo);

  return (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-1.5 sm:px-4",
          className,
        )}
        onPointerDown={onTriggerPointerDown}
      >
        <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <p
            className="min-w-0 truncate text-xs leading-snug"
            title={hasMemo ? currentMemo : undefined}
          >
            <span className="font-medium text-muted-foreground">{label}:</span>{" "}
            {hasMemo ? (
              <span className="text-foreground">{currentMemo}</span>
            ) : (
              <span className="text-muted-foreground">{emptyHint}</span>
            )}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${label} 안내`}
                onClick={(event) => event.stopPropagation()}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {privacy.tooltip}
            </TooltipContent>
          </Tooltip>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          {hasMemo ? "편집" : "작성"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onPointerDown={onTriggerPointerDown}>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{privacy.dialog}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="counterparty-memo">메모</Label>
            <Textarea
              id="counterparty-memo"
              value={draftMemo}
              maxLength={maxLength}
              rows={5}
              placeholder={privacy.placeholder}
              onChange={(event) => setDraftMemo(event.target.value)}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {draftMemo.length}/{maxLength}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
