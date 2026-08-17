// related files:
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/backend/utils/manufacturerLedgerDisplay.js
// change-log:
// - 2026-08-17: 수취자 건별 세부는 Collapsible, 초기 닫힘.
// - 2026-08-17: 상세는 의뢰/배송을 별 섹션으로 나눈다. 유형 라벨은 생략.
// - 2026-08-17: 제조사 일별 정산 행 클릭 시 수취자(우편함)별 생산·발송 상세.
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
  amount: number;
  requestAmount: number;
  requestCount: number;
  shippingAmount: number;
  shippingCount: number;
  mailboxGroups: ManufacturerLedgerMailboxGroup[];
};

type LedgerSectionKind = "request" | "shipping";

const creditKindLabel = (kind?: string | null) => {
  const raw = String(kind || "");
  if (raw === "PAID") return "미지급";
  if (raw.startsWith("FREE")) return "지급 0";
  return "";
};

const itemKindPrefix = (
  item: ManufacturerLedgerMailboxItem,
  section: LedgerSectionKind,
) => {
  if (section === "shipping") {
    if (item.kind === "shipping") return "배송비";
    return "발송";
  }
  return item.requestId ? "" : "의뢰";
};

const groupsForSection = (
  groups: ManufacturerLedgerMailboxGroup[],
  section: LedgerSectionKind,
) =>
  groups
    .map((group) => {
      const items =
        section === "request"
          ? group.items.filter((item) => item.kind === "production")
          : group.items.filter(
              (item) =>
                item.kind === "shipping" || item.kind === "shipment_item",
            );
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

function MailboxGroupList({
  ymd,
  groups,
  section,
}: {
  ymd: string;
  groups: ManufacturerLedgerMailboxGroup[];
  section: LedgerSectionKind;
}) {
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const subtotal =
          section === "request"
            ? Number(group.productionAmount || 0)
            : Number(group.shippingAmount || 0);
        return (
          <Collapsible
            key={`${ymd}:${section}:${group.key}`}
            defaultOpen={false}
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
                    {group.recipientName || "수취자 미확인"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {group.mailboxAddress
                      ? `우편함 ${group.mailboxAddress}`
                      : "우편함 미배정"}
                    {section === "shipping" && group.shippingCount > 0
                      ? ` · 발송 ${group.shippingCount}건`
                      : section === "request" && group.productionCount > 0
                        ? ` · 의뢰 ${group.productionCount}건`
                        : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold tabular-nums text-slate-800">
                  {formatWonWithUnit(subtotal)}
                </p>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item, index) => {
                  const meta = [item.clinicName, item.patientName, item.tooth]
                    .map((v) => String(v || "").trim())
                    .filter(Boolean)
                    .join(" / ");
                  const prefix = itemKindPrefix(item, section);
                  return (
                    <li
                      key={`${section}:${group.key}:${item.kind}:${item.requestMongoId || index}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {prefix ? <span>{prefix}</span> : null}
                          {item.requestId ? (
                            <span
                              className={cn(
                                "font-mono text-[11px]",
                                prefix
                                  ? "ml-1.5 text-slate-500"
                                  : "text-slate-800",
                              )}
                            >
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
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

export function ManufacturerDailyLedgerDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: ManufacturerDailyLedgerDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const requestGroups = detail
    ? groupsForSection(detail.mailboxGroups, "request")
    : [];
  const shippingGroups = detail
    ? groupsForSection(detail.mailboxGroups, "shipping")
    : [];
  const hasAnyGroup = requestGroups.length > 0 || shippingGroups.length > 0;

  return (
    <Dialog open={Boolean(detail)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(92vw,40rem)] overflow-y-auto rounded-2xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
            {formatKstYmdToKo(detail?.ymd)}
          </DialogTitle>
        </DialogHeader>
        {detail ? (
          <div className="space-y-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              합계{" "}
              <span className="font-semibold text-slate-900">
                {formatWonWithUnit(detail.amount)}
              </span>
            </p>

            {!hasAnyGroup ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                수취자 상세가 없습니다.
              </p>
            ) : (
              <>
                {requestGroups.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 px-0.5">
                      <p className="text-sm font-semibold text-slate-900">
                        의뢰
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatWonWithUnit(detail.requestAmount)} (
                        {detail.requestCount}건)
                      </p>
                    </div>
                    <MailboxGroupList
                      ymd={detail.ymd}
                      groups={requestGroups}
                      section="request"
                    />
                  </div>
                ) : null}

                {shippingGroups.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2 px-0.5">
                      <p className="text-sm font-semibold text-slate-900">
                        배송
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatWonWithUnit(detail.shippingAmount)} (
                        {detail.shippingCount}건)
                      </p>
                    </div>
                    <MailboxGroupList
                      ymd={detail.ymd}
                      groups={shippingGroups}
                      section="shipping"
                    />
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
