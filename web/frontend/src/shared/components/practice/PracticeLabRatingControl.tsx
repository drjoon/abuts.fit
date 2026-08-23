// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/practiceLabRating.ts
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - 2026-08-14: 치과→기공소 rating·메모. 채팅 헤더.
// - 2026-08-16: 5점제. 안내 단순화. 별점은 기공소에 공개·치과정보는 비공개.
// - 2026-08-16: 평가 모달 기본 별점 3.
// - 2026-08-16: 1점 매칭 제외 안내 제거(1점도 참여·×0.8).
// - 2026-08-16: 치과·기공소 쌍당 1건·재평가 덮어쓰기 안내.
// - 2026-08-19: 자동매칭 제거. 안내는 별점·쌍당 1회·재평가만.
import { useEffect, useState, type MouseEvent } from "react";
import { Star } from "lucide-react";
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
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  DEFAULT_PRACTICE_LAB_RATING_STARS,
  PRACTICE_LAB_RATING_MAX,
  PRACTICE_LAB_RATING_MEMO_MAX,
  PRACTICE_LAB_RATING_MIN,
  normalizePracticeLabRatingMemo,
  normalizePracticeLabStars,
  type PracticeLabRatingPublic,
} from "@/shared/practice/practiceLabRating";
import { cn } from "@/shared/ui/cn";

const DIALOG_DESCRIPTION_LINES = [
  "실제 작업한 기공소에 반영됩니다. 치과당 1회, 재평가 시 덮어씁니다.",
  "별점은 기공소에 공개, 메모는 우리 치과만 볼 수 있습니다.",
] as const;

type PracticeLabRatingControlProps = {
  transferMongoId: string;
  rating?: PracticeLabRatingPublic | null;
  onChanged?: (next: PracticeLabRatingPublic) => void;
  className?: string;
  size?: "sm" | "xs";
  stopPropagation?: boolean;
};

function StarRow({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: "sm" | "md";
}) {
  const iconClass = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="별점">
      {Array.from({ length: PRACTICE_LAB_RATING_MAX }, (_, i) => {
        const stars = i + 1;
        const filled = stars <= value;
        return (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={value === stars}
            aria-label={`${stars}점`}
            className="rounded p-0.5 text-amber-500 transition-colors hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(stars)}
          >
            <Star
              className={cn(iconClass, filled ? "fill-current" : "fill-none")}
              strokeWidth={1.75}
            />
          </button>
        );
      })}
    </div>
  );
}

export function PracticeLabRatingControl({
  transferMongoId,
  rating = null,
  onChanged,
  className,
  size = "sm",
  stopPropagation = true,
}: PracticeLabRatingControlProps) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<PracticeLabRatingPublic | null>(rating);
  const [draftStars, setDraftStars] = useState(
    () =>
      normalizePracticeLabStars(rating?.stars) ??
      DEFAULT_PRACTICE_LAB_RATING_STARS,
  );
  const [draftMemo, setDraftMemo] = useState(
    () => normalizePracticeLabRatingMemo(rating?.memo),
  );

  useEffect(() => {
    setCurrent(rating);
  }, [rating]);

  useEffect(() => {
    if (!open) return;
    setDraftStars(
      normalizePracticeLabStars(current?.stars) ??
        DEFAULT_PRACTICE_LAB_RATING_STARS,
    );
    setDraftMemo(normalizePracticeLabRatingMemo(current?.memo));
  }, [open, current]);

  const transferId = String(transferMongoId || "").trim();
  if (!transferId) return null;

  const save = async () => {
    if (!token) return;
    const stars = normalizePracticeLabStars(draftStars);
    if (stars == null) {
      toast({
        title: "별점을 선택해주세요",
        description: `${PRACTICE_LAB_RATING_MIN}~${PRACTICE_LAB_RATING_MAX}점으로 평가할 수 있습니다.`,
        variant: "destructive",
      });
      return;
    }
    const wasUpdate = Boolean(current?.stars);
    setSaving(true);
    try {
      const res = await request<{
        data?: { labRating?: PracticeLabRatingPublic };
        message?: string;
      }>({
        path: `/api/practice/transfers/${encodeURIComponent(transferId)}/lab-rating`,
        method: "POST",
        token,
        jsonBody: {
          stars,
          memo: normalizePracticeLabRatingMemo(draftMemo),
        },
      });
      if (!res.ok) {
        toast({
          title: "기공소 평가 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const saved = res.data?.data?.labRating;
      if (saved && typeof saved === "object") {
        const next: PracticeLabRatingPublic = {
          stars: normalizePracticeLabStars(saved.stars) ?? stars,
          memo: normalizePracticeLabRatingMemo(saved.memo),
          ratingCount: 1,
          updatedAt: saved.updatedAt ? String(saved.updatedAt) : null,
        };
        setCurrent(next);
        onChanged?.(next);
      }
      setOpen(false);
      toast({
        title: wasUpdate ? "기공소 평가 업데이트" : "기공소 평가 저장",
        description: wasUpdate
          ? "이전 평가를 새 별점으로 바꿨습니다. 별점은 기공소에 공개됩니다."
          : "별점은 기공소에 공개됩니다. 치과·메모는 비공개입니다.",
        duration: 2500,
      });
    } finally {
      setSaving(false);
    }
  };

  const onTriggerPointerDown = (event: MouseEvent) => {
    if (stopPropagation) event.stopPropagation();
  };

  const buttonSizeClass =
    size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs";
  const active = Boolean(current?.stars);

  return (
    <>
      <span className="inline-flex" onPointerDown={onTriggerPointerDown}>
        <Button
          type="button"
          variant={active ? "default" : "outline"}
          size="sm"
          className={cn(buttonSizeClass, "gap-1", className)}
          aria-label={
            active ? `기공소 ${current?.stars}점` : "기공소 평가"
          }
          onClick={() => setOpen(true)}
        >
          <Star className="h-3.5 w-3.5 fill-current" />
          {active ? `${current?.stars}점` : "평가"}
        </Button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-md gap-5 overflow-y-auto p-0 sm:rounded-2xl"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200/80 px-6 pb-4 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                기공소 평가
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                {DIALOG_DESCRIPTION_LINES[0]}
                <br />
                {DIALOG_DESCRIPTION_LINES[1]}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6">
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-slate-500">
                별점
              </Label>
              <StarRow value={draftStars} onChange={setDraftStars} />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="practice-lab-rating-memo"
                className="text-[11px] font-medium text-slate-500"
              >
                메모
              </Label>
              <Textarea
                id="practice-lab-rating-memo"
                value={draftMemo}
                maxLength={PRACTICE_LAB_RATING_MEMO_MAX}
                placeholder="내부 메모 (선택)"
                className="min-h-[96px] resize-y rounded-lg border-slate-200 bg-white shadow-none focus-visible:ring-slate-300"
                onChange={(e) => setDraftMemo(e.target.value)}
              />
              <div className="text-right text-[11px] tabular-nums text-slate-400">
                {draftMemo.length}/{PRACTICE_LAB_RATING_MEMO_MAX}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 min-w-[5.5rem] rounded-lg"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              className="h-10 min-w-[5.5rem] rounded-lg"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
