/**
 * 신규 기공의뢰 작성 중 — 동일 환자·치아 발견 시 리메이크 여부 확인.
 * related files:
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/utils/practiceTransferSimilarCase.js
 * change-log:
 * - 2026-11-23: 원본 카드 — 환자·치아·원주문일·기공소·기공비 라벨 행.
 * - 2026-11-23: 안내 문구 단축 — 선택만 안내, 정책 한 줄·중복 설명 제거.
 * - 2026-10-07: 어벗츠로부터 리메이크=무료. 월 3건 카피 제거.
 * - 2026-10-07: (폐지) 무료=월 3건 잔여. freeRemakeYears 카피 제거(폐지).
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

export type PracticeSimilarCaseMatch = {
  _id: string;
  transferId: string;
  patientName: string;
  toothNumbers: string[];
  targetLabName: string;
  /** 원본 수행/지정 기공소 앵커 — 리메이크 시 기공소 전환용 */
  targetLabAnchorId?: string;
  createdAt?: string | Date | null;
  orderYmd?: string;
  manufacturerStage?: string;
  monthlyRemakeFreeRemaining?: number;
  monthlyRemakeUsed?: number;
  withinRemakePricingWindow?: boolean;
  /** @deprecated */
  freeRemakeYears?: number | null;
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
            이전 의뢰가 있습니다
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            리메이크하면 원의뢰에 연결됩니다.
            <br />
            신규면 새 의뢰로 보냅니다.
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
              const rows: Array<{ label: string; value: string }> = [
                {
                  label: "환자",
                  value: String(match.patientName || "").trim() || "—",
                },
                { label: "치아", value: teeth },
                {
                  label: "원주문일",
                  value: String(match.orderYmd || "").trim() || "—",
                },
                {
                  label: "기공소",
                  value: String(match.targetLabName || "").trim() || "—",
                },
                { label: "리메이크비", value: "무료" },
              ];
              return (
                <button
                  key={match._id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelectId(match._id)}
                  className={
                    active
                      ? "flex w-full flex-col gap-1.5 rounded-md border border-amber-400 bg-amber-50/90 px-3 py-2.5 text-left text-sm"
                      : "flex w-full flex-col gap-1.5 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                  }
                >
                  <div className="flex items-start gap-2">
                    <dl className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                      {rows.map((row) => (
                        <div key={row.label} className="contents">
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd className="min-w-0 truncate font-medium text-slate-900">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {toStatusBadgeLabel(match.manufacturerStage || "")}
                    </Badge>
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
