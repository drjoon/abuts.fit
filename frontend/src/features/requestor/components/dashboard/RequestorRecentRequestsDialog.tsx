import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";

type RequestorRecentRequestsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  requests: any[];
  onSelectForEdit: (req: any) => void;
  onCancelRequest: (id: string) => void;
};

export const RequestorRecentRequestsDialog = ({
  open,
  onOpenChange,
  isLoading,
  requests,
  onSelectForEdit,
  onCancelRequest,
}: RequestorRecentRequestsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden ">
        <DialogHeader>
          <DialogTitle>최근 의뢰 전체 보기</DialogTitle>
        </DialogHeader>
        <div className="mt-3 border rounded-lg bg-muted/30 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {isLoading ? (
            <div className="p-4 text-md text-muted-foreground">
              의뢰 목록을 불러오는 중입니다...
            </div>
          ) : !requests.length ? (
            <div className="p-4 text-md text-muted-foreground">
              표시할 의뢰가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {requests.map((req: any) => {
                const mongoId = req._id;
                const displayId = req.requestId || req._id;

                return (
                  <FunctionalItemCard
                    key={displayId}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-background/80 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                    onUpdate={() => {
                      if (!mongoId) return;
                      onSelectForEdit(req);
                    }}
                    onRemove={
                      mongoId ? () => onCancelRequest(mongoId) : undefined
                    }
                    confirmTitle="이 의뢰를 취소하시겠습니까?"
                    confirmDescription={
                      <div className="text-md">
                        <div className="font-medium mb-1 truncate">
                          {req.title || displayId}
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                          {req.patientName && (
                            <span>환자 {req.patientName}</span>
                          )}
                          {req.toothNumber && (
                            <span>• 치아번호 {req.toothNumber}</span>
                          )}
                        </div>
                      </div>
                    }
                    confirmLabel="의뢰 취소"
                    cancelLabel="닫기"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-md font-medium truncate">
                        {req.title || displayId}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                        {req.patientName && <span>환자 {req.patientName}</span>}
                        {req.toothNumber && (
                          <span>• 치아번호 {req.toothNumber}</span>
                        )}
                        {req.createdAt && (
                          <span>
                            - 접수일{" "}
                            {new Date(req.createdAt).toISOString().slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <div className="text-xs font-medium">
                        {req.status || "상태 미정"}
                      </div>
                      <div className="text-[11px] text-muted-foreground max-w-[160px] truncate">
                        {req.manufacturer?.organization ||
                          req.manufacturer?.name ||
                          "제조사 미정"}
                      </div>
                    </div>
                  </FunctionalItemCard>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
