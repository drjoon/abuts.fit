// change-log:
// - 2026-08-17: 어벗사업 — 한 카드에 건당 분배·소개코드·특별주문가.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Hexagon, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { AFFILIATE_VAT_RATE } from "@/shared/settlement/affiliateVat";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  allocateAbutmentCase,
  createSpecialShare,
  formatWon,
  payoutWithVat,
  vatOn,
} from "./partnerShare";
import { ShareRoster } from "./DepartmentRoster";
import { SectionHeader } from "./shareUi";

type RequestorItem = {
  id: string;
  name: string;
};

export function AbutmentBusinessTab() {
  const { token } = useAuthStore();
  const { data: systemSettings } = useSystemSettings();
  const credit = systemSettings?.creditSettings;
  const {
    state,
    setAbutmentPreviewSellPrice,
    addSpecialShare,
    updateSpecialShare,
    removeSpecialShare,
  } = useBusinessAreaShare();
  const { previewSellPrice, departments, specialShares } = state.abutment;
  const allocation = useMemo(
    () =>
      allocateAbutmentCase({
        sellPrice: previewSellPrice,
        hasSalesman: true,
        departments,
      }),
    [departments, previewSellPrice],
  );
  const amountById = useMemo(
    () => new Map(allocation.rows.map((row) => [row.id, row.supply])),
    [allocation.rows],
  );

  const shippingCustomer = Number(credit?.shippingFee ?? 3500);
  const shippingMfr = Number(credit?.manufacturerShippingUnitPrice ?? 3500);
  const shippingVat = vatOn(
    shippingMfr,
    credit?.affiliateVatRate ?? AFFILIATE_VAT_RATE,
  );
  const shippingAbuts = Math.max(0, shippingCustomer - shippingMfr);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [requestors, setRequestors] = useState<RequestorItem[]>([]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: { items?: Array<{ id?: string; name?: string }> };
      }>({
        path: "/api/admin/settings/credits/requestors",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      setRequestors(
        (res.data?.data?.items || [])
          .filter((item) => item?.id)
          .map((item) => ({
            id: String(item.id),
            name: String(item.name || "").trim() || "이름 없음",
          })),
      );
    })();
  }, [token]);

  const selectedIds = useMemo(
    () => new Set(specialShares.map((item) => item.requestorAnchorId)),
    [specialShares],
  );
  const q = search.trim().toLowerCase();
  const availableRequestors = requestors.filter((item) => {
    if (selectedIds.has(item.id)) return false;
    if (!q) return true;
    return item.name.toLowerCase().includes(q);
  });

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <SectionHeader
          icon={Hexagon}
          title="어벗사업"
          description="판매가에서 건당 몫을 떼고 나머지는 어벗츠. 제조사·개발운영사·영업자는 +VAT."
          trailing={
            <div className="relative w-36">
              <Input
                id="abutSellPrice"
                type="number"
                min="0"
                step="500"
                className="h-8 rounded-lg border-slate-200 bg-slate-50/70 pr-7 text-right text-[13px] font-semibold tabular-nums"
                value={previewSellPrice}
                onChange={(event) =>
                  setAbutmentPreviewSellPrice(Number(event.target.value))
                }
                aria-label="미리보기 판매가"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                원
              </span>
            </div>
          }
        />

        <ShareRoster
          area="abutment"
          allowedShareKinds={["perCase", "remainder"]}
          departmentAmount={(dept) => amountById.get(dept.id) || 0}
          noteFor={(dept) => {
            if (dept.id === "abut-manufacturer") {
              return `박스당 배송 ${formatWon(shippingMfr)}+VAT ${formatWon(shippingVat)}는 제조사 지급.`;
            }
            if (dept.salesmanFallback) {
              return "의뢰서 소개코드(영업자BA)가 있으면 영업자, 없으면 어벗츠.";
            }
            if (dept.shareKind === "remainder") {
              return `배송 잔여 ${formatWon(shippingAbuts)}(고객 배송비 − 제조사 공급가)도 어벗츠.`;
            }
            return null;
          }}
        />

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-medium text-slate-800">특별주문가</div>
            <span className="text-[11px] text-muted-foreground">
              주체별 배분액을 따로 정합니다
            </span>
          </div>
          {specialShares.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-slate-800">
                  {item.requestorName}
                </span>
                <button
                  type="button"
                  onClick={() => removeSpecialShare(item.id)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
                  aria-label={`${item.requestorName} 삭제`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(
                  [
                    ["manufacturer", "제조사", true],
                    ["devops", "개발운영사", true],
                    ["salesman", "영업자", true],
                    ["abuts", "어벗츠", false],
                  ] as const
                ).map(([key, label, taxable]) => {
                  const payout = payoutWithVat(item[key], taxable);
                  return (
                    <div key={key}>
                      <Label
                        htmlFor={`special-${key}-${item.id}`}
                        className="mb-0.5 block text-[10px] text-slate-500"
                      >
                        {label}
                        {taxable ? " +VAT" : ""}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`special-${key}-${item.id}`}
                          type="number"
                          min="0"
                          step="100"
                          className="h-8 rounded-lg border-slate-200 bg-white pr-6 text-right text-[12px] font-semibold tabular-nums"
                          value={item[key]}
                          onChange={(event) =>
                            updateSpecialShare(item.id, {
                              [key]: Number(event.target.value),
                            })
                          }
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                          원
                        </span>
                      </div>
                      {taxable ? (
                        <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {formatWon(payout.total)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <Popover
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) setSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-slate-200 px-2.5 text-[12px]"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                의뢰자 추가
                <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[min(28rem,calc(100vw-2rem))] p-0"
              align="start"
            >
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="의뢰자명 검색"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                  <CommandGroup>
                    {availableRequestors.slice(0, 50).map((item) => (
                      <CommandItem
                        key={item.id}
                        value={`${item.name} ${item.id}`}
                        onSelect={() => {
                          addSpecialShare(
                            createSpecialShare({
                              requestorAnchorId: item.id,
                              requestorName: item.name,
                            }),
                          );
                          setPickerOpen(false);
                          setSearch("");
                        }}
                      >
                        {item.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  );
}
