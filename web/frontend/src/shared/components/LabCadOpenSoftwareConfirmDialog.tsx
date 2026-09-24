// change-log:
// - 2026-09-24: 플랫폼 디자인 SW 설정 변경 시 열기 전 확인.
// related files:
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LabCadOpenSoftwareConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designSoftwareLabel: string;
  previousSoftwareLabel?: string;
  onConfirm: () => void;
  onChangeSettings: () => void;
};

export function LabCadOpenSoftwareConfirmDialog({
  open,
  onOpenChange,
  designSoftwareLabel,
  previousSoftwareLabel = "",
  onConfirm,
  onChangeSettings,
}: LabCadOpenSoftwareConfirmDialogProps) {
  const current = String(designSoftwareLabel || "").trim() || "디자인 프로그램";
  const prev = String(previousSoftwareLabel || "").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[320] max-w-sm gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base">열기 프로그램 확인</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {prev ? (
              <>
                설정이 {prev}에서 {current}(으)로 바뀌었습니다.
                <br />
                {current}으로 열까요?
              </>
            ) : (
              <>
                현재 설정은 {current}입니다.
                <br />
                이 프로그램으로 열까요?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 border-t px-5 py-4 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {current}으로 열기
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              onChangeSettings();
            }}
          >
            설정 변경
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
