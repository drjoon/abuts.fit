// related files:
// - web/frontend/src/shared/components/practice/RetentionGrooveField.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/AbutmentDesignConfirmDialog.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RetentionGrooveGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 어벗생산의뢰 페이지 스타일 클래스 호환 */
  contentClassName?: string;
};

/** 유지구/유지홈 비교 안내 (어벗생산의뢰·기공의뢰수신 공통) */
export function RetentionGrooveGuideDialog({
  open,
  onOpenChange,
  contentClassName,
}: RetentionGrooveGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          contentClassName ||
          "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-6 sm:w-[1120px] sm:max-w-[1120px]"
        }
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-800">
            유지구/유지홈 안내
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-slate-700">
            유지구를 주실 경우 각진 모서리가 있으면 생산이 불가능하니 둥글게 처리해주세요.
            혹은 유지구를 제거하고 유지홈 옵션을 선택해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/Retention_Groove_good.jpeg"
                alt="유지구 생산 가능 예시"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                직경 2mm 이상의 둥근 유지구 <br />
                (생산 가능, 적합 좋음)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/Retention_Groove_ng.png"
                alt="유지구 생산 불가능 예시"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                직경 작거나 각진 유지구 <br />
                (생산 불가능)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/retention-groove-none.jpeg"
                alt="유지홈 없음 기본"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                유지홈 없음 <br />
                (기본)
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <img
                src="/images/new-request/retention-groove-exist.jpeg"
                alt="유지홈 있음 유지력 증강"
                className="h-44 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-center"
              />
              <span className="mt-2 block text-center text-base font-semibold text-slate-700">
                유지홈 있음 <br />
                (유지력 증가)
              </span>
            </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
