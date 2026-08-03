// change-log:
// - 2026-08-03: 재제작 시작 스테이지 타입 목록에서 '의뢰' 화면 라벨을 '준비'로 교체(표시 레벨).
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type RemakeQuickStartStage = "준비" | "CAM" | "가공" | "세척.패킹";

type RemakeStartQuickModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRequestId?: string;
  submitting?: boolean;
  onSelectStage: (stage: RemakeQuickStartStage) => Promise<void> | void;
  stages?: RemakeQuickStartStage[];
};

const DEFAULT_STAGES: RemakeQuickStartStage[] = [
  "준비",
  "CAM",
  "가공",
  "세척.패킹",
];

export const RemakeStartQuickModal = ({
  open,
  onOpenChange,
  sourceRequestId,
  submitting = false,
  onSelectStage,
  stages = DEFAULT_STAGES,
}: RemakeStartQuickModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>재제작 시작 공정 선택</DialogTitle>
          <DialogDescription>
            {sourceRequestId
              ? `의뢰 ${sourceRequestId} 복사본을 어느 공정부터 시작할지 선택해주세요.`
              : "복사 시작 공정을 선택해주세요."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 py-2 md:grid-cols-4">
          {stages.map((stage) => (
            <Button
              key={stage}
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => void onSelectStage(stage)}
            >
              {submitting ? "처리 중..." : stage}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RemakeStartQuickModal;
