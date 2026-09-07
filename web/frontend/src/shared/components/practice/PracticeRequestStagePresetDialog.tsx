// related files:
// - web/frontend/src/shared/practice/requestStagePresets.ts
// - web/frontend/src/shared/components/practice/PracticeRequestStageInlineEditor.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/components/PracticeTransferArrivalSettingsTab.tsx
// - 2026-09-07: 기공의뢰 단계 설정 모달(커스텀어벗 설정 모달 UX 참조).
// - 2026-09-07: 카드형 행 제거 → 인라인 편집기로 단순화(설정 탭용).

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
import {
  normalizeRequestStages,
  type PracticeRequestStage,
  type PracticeRequestStagePreset,
} from "@/shared/practice/requestStagePresets";
import { PracticeRequestStageInlineEditor } from "@/shared/components/practice/PracticeRequestStageInlineEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prosthesisType: string;
  stages: PracticeRequestStage[];
  onConfirm: (stages: PracticeRequestStage[]) => void;
  /** 계정 프리셋으로 저장 */
  onSavePreset?: (preset: PracticeRequestStagePreset) => void | Promise<void>;
  className?: string;
  overlayClassName?: string;
};

/** 설정 탭 등 — 컴팩트 인라인 편집 + 저장. */
export function PracticeRequestStagePresetDialog({
  open,
  onOpenChange,
  prosthesisType,
  stages: stagesProp,
  onConfirm,
  onSavePreset,
  className,
  overlayClassName,
}: Props) {
  const [draft, setDraft] = useState<PracticeRequestStage[]>(() =>
    normalizeRequestStages(stagesProp),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeRequestStages(stagesProp));
  }, [open, stagesProp, prosthesisType]);

  const typeLabel = String(prosthesisType || "").trim() || "보철";
  const normalizedDraft = normalizeRequestStages(draft);
  const canConfirm = normalizedDraft.length > 0;

  const handleSave = () => {
    if (!canConfirm) return;
    if (onSavePreset) {
      setSaving(true);
      void Promise.resolve(
        onSavePreset({
          prosthesisType: typeLabel,
          stages: normalizedDraft,
        }),
      )
        .then(() => {
          onConfirm(normalizedDraft);
          onOpenChange(false);
        })
        .catch(() => {})
        .finally(() => setSaving(false));
      return;
    }
    onConfirm(normalizedDraft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-hidden p-4 sm:max-w-[min(24rem,calc(100vw-1.5rem))]",
          className,
        )}
        overlayClassName={overlayClassName}
      >
        <DialogHeader className="shrink-0 space-y-1 text-left">
          <DialogTitle className="text-base">{typeLabel} 단계</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            이름과 주문→도착 일수. 재도착 시 다음 단계로 진행됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          <PracticeRequestStageInlineEditor
            mode="edit"
            stages={draft}
            onChange={setDraft}
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            disabled={!canConfirm || saving}
            onClick={handleSave}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
