import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BulkShippingList,
  BulkShippingStagingList,
  type BulkShippingItem,
} from "./BulkShippingLists";

type RequestorBulkShippingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkData: {
    pre?: BulkShippingItem[];
    post?: BulkShippingItem[];
    waiting?: BulkShippingItem[];
  } | null;
  selected: Record<string, boolean>;
  setSelected: (next: Record<string, boolean>) => void;
  isSubmitting: boolean;
  onSubmit: (selectedIds: string[]) => void | Promise<void>;
};

export const RequestorBulkShippingDialog = ({
  open,
  onOpenChange,
  bulkData,
  selected,
  setSelected,
  isSubmitting,
  onSubmit,
}: RequestorBulkShippingDialogProps) => {
  const allItems: BulkShippingItem[] = bulkData
    ? [
        ...(bulkData.pre ?? []).map((item) => ({
          ...item,
          stage: "pre" as const,
        })),
        ...(bulkData.post ?? []).map((item) => ({
          ...item,
          stage: "post" as const,
        })),
        ...(bulkData.waiting ?? []),
      ]
    : [];

  const handleSubmitClick = () => {
    const selectedIds = Object.keys(selected).filter((id) => selected[id]);
    onSubmit(selectedIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>묶음 배송 신청</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4 text-md overflow-y-auto max-h-[70vh] pr-1">
          <div className="grid grid-cols-1 md:[grid-template-columns:1fr_1fr_auto_1fr] gap-6 items-stretch">
            <div className="border rounded-lg p-3 bg-muted/40 flex flex-col gap-2 h-[320px]">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-md font-semibold">가공전</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    const next: Record<string, boolean> = {
                      ...selected,
                    };
                    (bulkData?.pre ?? []).forEach((item: BulkShippingItem) => {
                      next[item.id] = true;
                    });
                    setSelected(next);
                  }}
                >
                  전체선택
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                <BulkShippingList
                  kind="pre"
                  items={bulkData?.pre ?? []}
                  selected={selected}
                  setSelected={setSelected}
                />
              </div>
            </div>

            <div className="border rounded-lg p-3 bg-background flex flex-col gap-2 h-[320px]">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-md font-semibold">가공후</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    const next: Record<string, boolean> = {
                      ...selected,
                    };
                    (bulkData?.post ?? []).forEach((item: BulkShippingItem) => {
                      next[item.id] = true;
                    });
                    setSelected(next);
                  }}
                >
                  전체선택
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                <BulkShippingList
                  kind="post"
                  items={bulkData?.post ?? []}
                  selected={selected}
                  setSelected={setSelected}
                />
              </div>
            </div>

            <div className="hidden md:flex justify-center">
              <div className="w-px h-full bg-slate-300" />
            </div>

            <div className="border rounded-lg p-3 bg-slate-50 flex flex-col gap-2 h-[320px] shadow-inner">
              <h3 className="text-md font-semibold mb-1">배송대기</h3>
              <div className="flex-1 overflow-y-auto pr-1">
                <BulkShippingStagingList
                  allItems={allItems}
                  selected={selected}
                  setSelected={setSelected}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-muted-foreground leading-relaxed text-xs md:text-md">
              직경이 큰 케이스(예: 10mm 이상)는 가공 주기가 길 수 있으므로,
              가공이 끝난 건 위주로 묶는 것을 권장드립니다.
            </div>

            <div className="flex justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelected({});
                  onOpenChange(false);
                }}
              >
                취소
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={isSubmitting}
                onClick={handleSubmitClick}
              >
                배송 신청
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
