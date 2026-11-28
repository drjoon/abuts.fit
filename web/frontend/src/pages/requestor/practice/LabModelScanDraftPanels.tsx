// related files:
// - web/frontend/src/shared/practice/labModelScanDrafts.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-11-28: 모델스캔 임시저장·휴지통 목록.
import { BookmarkPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";
import { isPracticeTransferDraftStaleHighlight } from "@/shared/practice/practiceTransferDraft";
import {
  purgeLabModelScanDraft,
  restoreLabModelScanDraft,
  trashLabModelScanDraft,
  useLabModelScanDrafts,
  type LabModelScanDraft,
} from "@/shared/practice/labModelScanDrafts";

type Props = {
  userId: string;
  draftsOpen: boolean;
  trashOpen: boolean;
  onDraftsOpenChange: (open: boolean) => void;
  onTrashOpenChange: (open: boolean) => void;
  onContinue: (draft: LabModelScanDraft) => void;
};

const draftTitle = (draft: LabModelScanDraft) =>
  String(draft.patientName || "").trim() || "환자명 없음";

const draftMeta = (draft: LabModelScanDraft) => {
  const clinic = String(draft.clinicLabel || "").trim();
  const arrival = String(draft.arrivalYmd || "").trim();
  return [clinic, arrival ? `도착 ${arrival}` : ""].filter(Boolean).join(" · ");
};

export function LabModelScanDraftPanels({
  userId,
  draftsOpen,
  trashOpen,
  onDraftsOpenChange,
  onTrashOpenChange,
  onContinue,
}: Props) {
  const book = useLabModelScanDrafts(userId);

  return (
    <>
      <Dialog open={draftsOpen} onOpenChange={onDraftsOpenChange}>
        <DialogContent
          overlayClassName="z-[359]"
          className="z-[360] flex max-h-[min(80vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogHeader className="space-y-1 border-b px-4 py-3 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookmarkPlus className="h-4 w-4" />
              임시저장
            </DialogTitle>
            <DialogDescription className="sr-only">
              작성 중인 모델스캔 의뢰입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            {book.active.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                임시저장이 없습니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {book.active.map((draft) => (
                  <li
                    key={draft.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2",
                      isPracticeTransferDraftStaleHighlight(draft.updatedAt) &&
                        "border-amber-300 bg-amber-50/80",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onContinue(draft)}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {draftTitle(draft)}
                        {draft.isRemake ? " · 리메이크" : ""}
                      </p>
                      {draftMeta(draft) ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {draftMeta(draft)}
                        </p>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() => trashLabModelScanDraft(userId, draft.id)}
                    >
                      휴지통
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={trashOpen} onOpenChange={onTrashOpenChange}>
        <DialogContent
          overlayClassName="z-[359]"
          className="z-[360] flex max-h-[min(80vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogHeader className="space-y-1 border-b px-4 py-3 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4" />
              휴지통
            </DialogTitle>
            <DialogDescription className="sr-only">
              지운 모델스캔 임시저장입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            {book.trashed.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                휴지통이 비어 있습니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {book.trashed.map((draft) => (
                  <li
                    key={draft.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {draftTitle(draft)}
                      </p>
                      {draftMeta(draft) ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {draftMeta(draft)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() => {
                        restoreLabModelScanDraft(userId, draft.id);
                        onContinue(draft);
                      }}
                    >
                      복구
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() => purgeLabModelScanDraft(userId, draft.id)}
                    >
                      삭제
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
