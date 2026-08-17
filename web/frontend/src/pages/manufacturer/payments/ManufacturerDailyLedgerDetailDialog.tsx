// related files:
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/backend/utils/manufacturerLedgerDisplay.js
// change-log:
// - 2026-08-17: 제조사 일별 정산 행 클릭 시 수취자(우편함)별 생산·발송 상세.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatWonWithUnit } from "@/shared/settlement/affiliateVat";
import { formatKstYmdToKo } from "@/shared/date/kst";
import { cn } from "@/shared/ui/cn";

export type ManufacturerLedgerMailboxItem = {
  kind: "production" | "shipping" | "shipment_item";
  amount: number;
  creditKind?: string | null;
  requestMongoId?: string;
  requestId?: string;
  patientName?: string;
  tooth?: string;
  clinicName?: string;
};

export type ManufacturerLedgerMailboxGroup = {
  key: string;
  mailboxAddress?: string;
  recipientName?: string;
  productionAmount: number;
  productionCount: number;
  shippingAmount: number;
  shippingCount: number;
  items: ManufacturerLedgerMailboxItem[];
};

export type ManufacturerDailyLedgerDetail = {
  ymd: string;
  displayLabel?: string;
  amount: number;
  requestAmount: number;
  requestCount: number;
  shippingAmount: number;
  shippingCount: number;
  mailboxGroups: ManufacturerLedgerMailboxGroup[];
};

const itemKindLabel = (kind: string) => {
  if (kind === "shipping") return "배송비";
  if (kind === "shipment_item") return "발송";
  return "생산";
};

const creditKindLabel = (kind?: string | null) => {
  const raw = String(kind || "");
  if (raw === "PAID") return "미지급";
  if (raw.startsWith("FREE")) return "지급 0";
  return "";
};

export function ManufacturerDailyLedgerDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: ManufacturerDailyLedgerDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(92vw,40rem)] overflow-y-auto rounded-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
            {detail?.displayLabel || "커스텀어벗 생산"} ·{" "}
            {formatKstYmdToKo(detail?.ymd)}
          </DialogTitle>
        </DialogHeader>
        {detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs leading-snug">
              <p>
                <span className="text-muted-foreground">의뢰</span>{" "}
                <span className="font-medium tabular-nums text-slate-900">
                  {formatWonWithUnit(detail.requestAmount)} ({detail.requestCount}건)
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">배송</span>{" "}
                <span className="font-medium tabular-nums text-slate-900">
                  {formatWonWithUnit(detail.shippingAmount)} ({detail.shippingCount}건)
                </span>
              </p>
              <p className="col-span-2">
                <span className="text-muted-foreground">합계</span>{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatWonWithUnit(detail.amount)}
                </span>
              </p>
            </div>

            {detail.mailboxGroups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                수취자 상세가 없습니다.
              </p>
            ) : (
              detail.mailboxGroups.map((group) => (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-xl border border-slate-200/80"
                >
                  <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {group.recipientName || "수취자 미확인"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {group.mailboxAddress
                          ? `우편함 ${group.mailboxAddress}`
                          : "우편함 미배정"}
                        {group.shippingCount > 0
                          ? ` · 발송 ${group.shippingCount}건`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                      {formatWonWithUnit(
                        Number(group.productionAmount || 0) +
                          Number(group.shippingAmount || 0),
                      )}
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.items.map((item, index) => {
                      const meta = [
                        item.clinicName,
                        item.patientName,
                        item.tooth,
                      ]
                        .map((v) => String(v || "").trim())
                        .filter(Boolean)
                        .join(" / ");
                      return (
                        <li
                          key={`${group.key}:${item.kind}:${item.requestMongoId || index}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">
                              {itemKindLabel(item.kind)}
                              {item.requestId ? (
                                <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                                  {item.requestId}
                                </span>
                              ) : null}
                            </p>
                            {meta ? (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {meta}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            {item.amount > 0 ? (
                              <p
                                className={cn(
                                  "tabular-nums font-medium",
                                  item.kind === "shipping"
                                    ? "text-slate-800"
                                    : "text-primary-strong",
                                )}
                              >
                                {formatWonWithUnit(item.amount)}
                              </p>
                            ) : null}
                            {creditKindLabel(item.creditKind) ? (
                              <p className="text-[10px] text-muted-foreground">
                                {creditKindLabel(item.creditKind)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
