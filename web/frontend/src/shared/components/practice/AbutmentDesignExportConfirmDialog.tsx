// related: docs/intent/abutment-design-export-stl-credit.md
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AbutmentDesignExportQuote = {
  alreadyPaid?: boolean;
  exempt?: boolean;
  qty?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  refundable?: boolean;
};

export type AbutmentDesignExportConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: AbutmentDesignExportQuote | null;
  busy?: boolean;
  onConfirm: () => void;
};

function won(value: number): string {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

export function AbutmentDesignExportConfirmDialog({
  open,
  onOpenChange,
  quote,
  busy = false,
  onConfirm,
}: AbutmentDesignExportConfirmDialogProps) {
  const amount = Math.max(0, Math.round(Number(quote?.amount || 0)));
  const qty = Math.max(1, Math.floor(Number(quote?.qty || 1)));
  const unit = Math.max(0, Math.round(Number(quote?.unitPrice || 0)));
  const alreadyPaid = Boolean(quote?.alreadyPaid);
  const freePass = alreadyPaid || Boolean(quote?.exempt) || amount <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[520] gap-0 overflow-hidden p-0 w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-max sm:max-w-[min(100vw-2rem,36rem)] sm:rounded-2xl"
        overlayClassName="z-[515]"
      >
        <DialogHeader className="space-y-3 px-5 pb-1 pt-5 text-left sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong ring-1 ring-primary-muted/70">
              <Download className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
                외부 저장
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                구강 스캔과 커스텀어벗 STL을 받습니다.
                <br />
                어벗은 월드 좌표 그대로입니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4 sm:px-6">
          <dl className="space-y-2.5 text-sm">
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3">
              <dt className="font-medium text-slate-500">치아</dt>
              <dd className="tabular-nums text-slate-800">{qty}개</dd>
            </div>
            {!freePass ? (
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3">
                <dt className="font-medium text-slate-500">단가</dt>
                <dd className="tabular-nums text-slate-800">{won(unit)}</dd>
              </div>
            ) : null}
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3">
              <dt className="font-medium text-slate-500">차감</dt>
              <dd className="tabular-nums font-semibold text-slate-900">
                {freePass
                  ? alreadyPaid
                    ? "이미 결제됨"
                    : "0원"
                  : won(amount)}
              </dd>
            </div>
          </dl>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {freePass ? (
              <>
                추가 차감 없이 파일을 받습니다.
                <br />
                한 번 결제한 생산비는 어벗 생산 주문 취소해도 환불되지 않습니다.
              </>
            ) : (
              <>
                어벗츠 어벗 생산비를 크레딧에서 차감합니다.
                <br />
                한 번 차감하면 어벗 생산 주문 취소해도 크레딧이 환불되지 않습니다.
              </>
            )}
          </p>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:space-x-0 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            className="h-9 bg-primary-strong text-white hover:bg-primary-strong/90"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "처리 중…" : freePass ? "받기" : "차감 후 받기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
