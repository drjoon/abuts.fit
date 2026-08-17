// change-log:
// - 2026-08-17: 어벗사업 탭 — 건당 고정 배분·부가세·특별주문가·배송 룰.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronsUpDown, Plus, Search, Truck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { DepartmentRoster } from "./DepartmentRoster";
import { FieldHelp, SectionHeader } from "./shareUi";

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
    setAbutmentHasSalesman,
    addSpecialShare,
    updateSpecialShare,
    removeSpecialShare,
  } = useBusinessAreaShare();
  const { previewSellPrice, hasSalesman, departments, specialShares } = state.abutment;
  const allocation = useMemo(
    () =>
      allocateAbutmentCase({
        sellPrice: previewSellPrice,
        hasSalesman,
        departments,
      }),
    [departments, hasSalesman, previewSellPrice],
  );
  const amountById = useMemo(
    () => new Map(allocation.rows.map((row) => [row.id, row.supply])),
    [allocation.rows],
  );

  const shippingCustomer = Number(credit?.shippingFee ?? 3500);
  const shippingMfr = Number(credit?.manufacturerShippingUnitPrice ?? 3500);
  const shippingVat = vatOn(shippingMfr, credit?.affiliateVatRate ?? AFFILIATE_VAT_RATE);
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
    <div className="space-y-5">
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={Wallet}
            title="커스텀어벗 생산 매출"
            description="건당 제조사 9,000원 · 개발운영사 1,000원 · 영업자(영업자BA) 3,000원은 공급가이며, 지급 시 부가세를 별도로 붙입니다. 판매가의 나머지는 어벗츠 몫입니다."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <Label htmlFor="abutSellPrice" className="text-sm font-medium text-slate-800">
                  미리보기 판매가
                </Label>
                <FieldHelp text="의뢰자 판매가(멤버십/일반/특별주문가)입니다. 고정 건당 금액을 뺀 나머지가 어벗츠 몫이 됩니다." />
              </div>
              <div className="relative">
                <Input
                  id="abutSellPrice"
                  type="number"
                  min="0"
                  step="500"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums"
                  value={previewSellPrice}
                  onChange={(event) =>
                    setAbutmentPreviewSellPrice(Number(event.target.value))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  원
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div>
                <div className="text-sm font-medium text-slate-800">영업자BA 있음</div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  없으면 영업자 건당 몫을 어벗츠가 가져갑니다.
                </p>
              </div>
              <Switch
                checked={hasSalesman}
                onCheckedChange={setAbutmentHasSalesman}
                aria-label="영업자BA 있음"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {allocation.rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 ring-1 ring-slate-200/70"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-700">{row.name}</div>
                  {row.skippedToAbuts ? (
                    <div className="text-[11px] text-muted-foreground">
                      영업자 없음 → 어벗츠
                    </div>
                  ) : row.vat > 0 ? (
                    <div className="text-[11px] text-muted-foreground">
                      공급가 {formatWon(row.supply)} + VAT {formatWon(row.vat)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">면세</div>
                  )}
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatWon(row.total)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-3 p-5 sm:p-6">
          <SectionHeader
            icon={Truck}
            title="배송비"
            description="생산 건당 분배와 분리합니다. 제조사 하청 배송 공급가에 부가세를 붙이고, 고객 배송비에서 제조사 공급가를 뺀 잔여는 어벗츠(면세)입니다."
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">고객 배송비 (박스당)</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatWon(shippingCustomer)}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">제조사 배송 지급</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatWon(shippingMfr + shippingVat)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatWon(shippingMfr)} + VAT {formatWon(shippingVat)}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">어벗츠 배송 잔여</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatWon(shippingAbuts)}
              </div>
              <div className="text-[11px] text-muted-foreground">면세</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DepartmentRoster
        area="abutment"
        allowedShareKinds={["perCase", "remainder"]}
        departmentAmount={(dept) => amountById.get(dept.id) || 0}
        emptyHint="제조사·개발운영사·영업자·어벗츠를 넣고 건당 배분액을 정하세요."
      />

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={Search}
            title="특별주문가 배분"
            description="특별주문가가 책정된 의뢰자 주문은 기본 건당 금액 대신 주체별 배분액을 따로 정합니다. 제조사·개발운영사·영업자는 부가세 별도입니다."
            trailing={
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
                {specialShares.length}곳
              </span>
            }
          />

          {specialShares.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">지정된 의뢰자가 없습니다</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                특별 공급가가 있는 의뢰자를 검색해 주체별 배분액을 넣으세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {specialShares.map((item) => {
                const mfr = payoutWithVat(item.manufacturer, true);
                const devops = payoutWithVat(item.devops, true);
                const salesman = payoutWithVat(item.salesman, true);
                return (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {item.requestorName}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                          공급가 합계{" "}
                          {formatWon(
                            item.manufacturer + item.devops + item.salesman + item.abuts,
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl text-slate-400"
                        aria-label={`${item.requestorName} 삭제`}
                        onClick={() => removeSpecialShare(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["manufacturer", "제조사", mfr],
                          ["devops", "개발운영사", devops],
                          ["salesman", "영업자", salesman],
                          ["abuts", "어벗츠", payoutWithVat(item.abuts, false)],
                        ] as const
                      ).map(([key, label, payout]) => (
                        <div key={key}>
                          <Label
                            htmlFor={`special-${key}-${item.id}`}
                            className="mb-1 block text-[11px] font-medium text-slate-500"
                          >
                            {label} 공급가
                          </Label>
                          <div className="relative">
                            <Input
                              id={`special-${key}-${item.id}`}
                              type="number"
                              min="0"
                              step="100"
                              className="h-9 rounded-xl border-slate-200 bg-slate-50/60 pr-8 text-right text-sm font-semibold tabular-nums"
                              value={item[key]}
                              onChange={(event) =>
                                updateSpecialShare(item.id, {
                                  [key]: Number(event.target.value),
                                })
                              }
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                              원
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {key === "abuts"
                              ? "면세"
                              : `+VAT ${formatWon(payout.vat)} → ${formatWon(payout.total)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
                className="h-10 w-full justify-between rounded-xl border-slate-200 sm:max-w-md"
              >
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  의뢰자 검색 후 추가…
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
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
        </CardContent>
      </Card>
    </div>
  );
}
