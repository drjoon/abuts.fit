import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChargeOrder } from "../adminCredit.types";

type AdminCreditApprovalDialogsProps = {
  approveModalOpen: boolean;
  setApproveModalOpen: (open: boolean) => void;
  rejectModalOpen: boolean;
  setRejectModalOpen: (open: boolean) => void;
  selectedOrder: ChargeOrder | null;
  rejectNote: string;
  setRejectNote: (value: string) => void;
  processingApproval: boolean;
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
};

export function AdminCreditApprovalDialogs({
  approveModalOpen,
  setApproveModalOpen,
  rejectModalOpen,
  setRejectModalOpen,
  selectedOrder,
  rejectNote,
  setRejectNote,
  processingApproval,
  onApprove,
  onReject,
}: AdminCreditApprovalDialogsProps) {
  return (
    <>
      <Dialog open={approveModalOpen} onOpenChange={setApproveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 승인</DialogTitle>
            <DialogDescription>
              승인 시 조직 크레딧 적립이 유지됩니다. 승인자는 작성자가 될 수
              없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="font-mono">코드: {selectedOrder?.depositCode || "-"}</div>
            <div>금액: {selectedOrder?.amountTotal.toLocaleString()}원</div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveModalOpen(false)}
              disabled={processingApproval}
            >
              취소
            </Button>
            <Button onClick={onApprove} disabled={!selectedOrder || processingApproval}>
              {processingApproval ? "처리 중..." : "승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>충전 주문 거절</DialogTitle>
            <DialogDescription>거절 사유를 남겨주세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-mono">코드: {selectedOrder?.depositCode || "-"}</div>
            <div className="text-sm">금액: {selectedOrder?.amountTotal.toLocaleString()}원</div>
            <div className="space-y-2">
              <Label htmlFor="reject-note">거절 사유</Label>
              <Input
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="사유 입력"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              disabled={processingApproval}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={!selectedOrder || processingApproval}
            >
              {processingApproval ? "처리 중..." : "거절"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
