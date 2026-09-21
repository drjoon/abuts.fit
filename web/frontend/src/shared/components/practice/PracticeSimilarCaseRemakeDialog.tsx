/**
 * 신규 기공의뢰 작성 중 — 동일 환자·치아 발견 시 리메이크 여부 확인.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/utils/practiceTransferSimilarCase.js
 * change-log:
 * - 2026-09-21: 무료 창=기공소 freeRemakeYears(카피·뱃지).
 * - 2026-09-21: z-[460] — 작성 모달(z-320, 투어 z-410) 뒤에서 바깥클릭으로 전송 버튼을 삼키던 문제.
 * - 2026-09-14: 신규 작성·전송 전 리메이크/신규 분기 모달.
 */
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toStatusBadgeLabel } from "@/shared/practice/practiceRecentTransferList";
import { formatFreeRemakeYearsLabel } from "@/shared/practice/labFeeSchedule";

export type PracticeSimilarCaseMatch = {
  _id: string;
  transferId: string;
  patientName: string;
  toothNumbers: string[];
  targetLabName: string;
  createdAt?: string | Date | null;
  orderYmd?: string;
  manufacturerStage?: string;
  freeRemakeYears?: number | null;
  withinRemakePricingWindow?: boolean;
};

export type PracticeSimilarCaseRemakeDialogProps = {
  open: boolean;
  matches: PracticeSimilarCaseMatch[];
  selectedId: string;
  onSelectId: (id: string) => void;
  busy?: boolean;
  onConfirmRemake: () => void;
  onConfirmNew: () => void;
  onCancel: () => void;
};

export function PracticeSimilarCaseRemakeDialog({
  open,
  matches,
  selectedId,
  onSelectId,
  busy = false,
  onConfirmRemake,
  onConfirmNew,
  onCancel,
}: PracticeSimilarCaseRemakeDialogProps) {
  const selected =
    matches.find((m) => m._id === selectedId) || matches[0] || null;
  const canRemake = Boolean(selected?._id);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        overlayClassName="z-[459]"
        className="z-[460] flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Repeat className="h-5 w-5 text-amber-600" />
            동일 환자·치아 의뢰가 있습니다
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            같은 환자·치아 의뢰입니다. 리메이크면 원의뢰에 연결되고 기공소에
            「리메이크」로 표시됩니다. 무료 여부는 해당 기공소의 무료 리메이크
            기간(년) 설정에 따릅니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              일치 의뢰 없음
            </p>
          ) : (
            matches.map((match) => {
              const active = match._id === (selected?._id || "");
              const teeth =
                Array.isArray(match.toothNumbers) && match.toothNumbers.length
                  ? match.toothNumbers.join(", ")
                  : "—";
              const yearsLabel = formatFreeRemakeYearsLabel(
                match.freeRemakeYears,
              );
              const feeHint =
                match.withinRemakePricingWindow === true
                  ? " · 리메이크비 무료 가능"
                  : match.freeRemakeYears == null
                    ? " · 리메이크비 정가(기간 미설정)"
                    : match.freeRemakeYears <= 0
                      ? " · 리메이크비 유료"
                      : " · 리메이크비 정가(무료 기간 초과)";
              return (
                <button
                  key={match._id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelectId(match._id)}
                  className={
                    active
                      ? "flex w-full flex-col gap-1 rounded-md border border-amber-400 bg-amber-50/90 px-3 py-2.5 text-left text-sm"
                      : "flex w-full flex-col gap-1 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                      {match.patientName || "—"}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {teeth}
                      </span>
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {toStatusBadgeLabel(match.manufacturerStage || "")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {match.orderYmd || "—"} ·{" "}
                    {match.targetLabName || "기공소"} ({yearsLabel})
                    {feeHint}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onConfirmNew}
          >
            신규로 처리
          </Button>
          <Button
            type="button"
            disabled={!canRemake || busy}
            onClick={onConfirmRemake}
          >
            리메이크로 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
