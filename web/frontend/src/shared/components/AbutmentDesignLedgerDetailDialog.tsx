// related files:
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/manufacturer/payments/ManufacturerDailyLedgerDetailDialog.tsx
// change-log:
// - 2026-08-19: 크레딧 기공의뢰-어벗디자인으로 행 클릭 상세(의뢰/배송, 제조사 정산 모달 UX).
import { ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { cn } from "@/shared/ui/cn";

export type AbutmentDesignLedgerDetailItem = {
  kind: "request" | "shipping";
  amount: number;
  requestId?: string;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
};

export type AbutmentDesignLedgerDetail = {
  title: string;
  recipientName: string;
  mailboxAddress?: string;
  amount: number;
  requestAmount: number;
  requestCount: number;
  shippingAmount: number;
  shippingCount: number;
  items: AbutmentDesignLedgerDetailItem[];
};

const formatSignedWon = (amount: number) => {
  const n = Math.round(Number(amount || 0));
  const abs = Math.abs(n).toLocaleString("ko-KR");
  if (n < 0) return `-${abs}원`;
  if (n > 0) return `+${abs}원`;
  return `0원`;
};

function SectionList({
  items,
}: {
  items: AbutmentDesignLedgerDetailItem[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item, index) => {
        const meta = [item.clinicName, item.patientName, item.tooth]
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .join(" / ");
        return (
          <li
            key={`${item.kind}:${item.requestId || index}`}
            className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-800">
                {item.kind === "shipping" ? (
                  <span>배송비</span>
                ) : item.requestId ? (
                  <span className="font-mono text-[11px] text-slate-800">
                    {item.requestId}
                  </span>
                ) : (
                  <span>의뢰</span>
                )}
              </p>
              {meta ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {meta}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-right tabular-nums font-medium text-slate-800">
              {formatWonWithUnit(Math.abs(item.amount))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function AbutmentDesignLedgerDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: AbutmentDesignLedgerDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const requestItems = (detail?.items || []).filter(
    (item) => item.kind === "request",
  );
  const shippingItems = (detail?.items || []).filter(
    (item) => item.kind === "shipping",
  );
  const hasAny = requestItems.length > 0 || shippingItems.length > 0;

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(92vw,40rem)] overflow-y-auto rounded-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
            {detail?.title || "기공의뢰-어벗디자인으로"}
          </DialogTitle>
        </DialogHeader>
        {detail ? (
          <div className="space-y-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              합계{" "}
              <span className="font-semibold text-slate-900">
                {formatSignedWon(detail.amount)}
              </span>
            </p>

            {!hasAny ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                세부 내역이 없습니다.
              </p>
            ) : (
              <>
                {requestItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 px-0.5">
                      <p className="text-sm font-semibold text-slate-900">
                        의뢰
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatWonWithUnit(Math.abs(detail.requestAmount))} (
                        {detail.requestCount}건)
                      </p>
                    </div>
                    <Collapsible
                      defaultOpen
                      className="overflow-hidden rounded-xl border border-slate-200/80"
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 bg-slate-50/80 px-3 py-2 text-left transition-colors hover:bg-slate-100/80 [&[data-state=open]>svg]:rotate-180 [&[data-state=open]]:border-b [&[data-state=open]]:border-slate-100"
                        >
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {detail.recipientName || "수신자 미확인"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {detail.mailboxAddress
                                ? `우편함 ${detail.mailboxAddress}`
                                : "박스 대기"}
                              {detail.requestCount > 0
                                ? ` · 의뢰 ${detail.requestCount}건`
                                : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                            {formatWonWithUnit(Math.abs(detail.requestAmount))}
                          </p>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SectionList items={requestItems} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : null}

                {shippingItems.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 px-0.5">
                      <p className="text-sm font-semibold text-slate-900">
                        배송
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatWonWithUnit(Math.abs(detail.shippingAmount))} (
                        {detail.shippingCount}박스)
                      </p>
                    </div>
                    <Collapsible
                      defaultOpen
                      className="overflow-hidden rounded-xl border border-slate-200/80"
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 bg-slate-50/80 px-3 py-2 text-left transition-colors hover:bg-slate-100/80 [&[data-state=open]>svg]:rotate-180 [&[data-state=open]]:border-b [&[data-state=open]]:border-slate-100"
                        >
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {detail.recipientName || "수신자 미확인"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {detail.mailboxAddress
                                ? `우편함 ${detail.mailboxAddress}`
                                : "박스 대기"}
                              {detail.shippingCount > 0
                                ? ` · 배송 ${detail.shippingCount}박스`
                                : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                            {formatWonWithUnit(Math.abs(detail.shippingAmount))}
                          </p>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SectionList items={shippingItems} />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
