// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/ui/cn";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  MAX_LAB_FEE_ITEMS,
  MAX_LAB_FEE_ITEM_TIERS,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
  type LabFeeItem,
  type LabFeeItemUnit,
  type LabFeeSchedule,
} from "@/shared/practice/labFeeSchedule";

const newItemId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createFeeItem = (partial?: Partial<LabFeeItem>): LabFeeItem =>
  normalizeLabFeeItem({
    id: newItemId(),
    name: "",
    unit: "perTooth",
    enabled: true,
    price: 0,
    remake: 0,
    tiers: [],
    ...partial,
  });

const toWon = (value: number) => Math.max(0, Math.round(Number(value) || 0));

function WonInput({
  id,
  label,
  value,
  disabled,
  remake = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  remake?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0">
      <Label
        htmlFor={id}
        className={cn(
          "mb-1 block text-center text-[11px] font-medium",
          remake ? "text-amber-800" : "text-slate-600",
        )}
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          min={0}
          step={1000}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(toWon(Number(e.target.value)))}
          className={cn(
            "h-10 rounded-xl px-2 pr-7 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50",
            remake && "border-amber-200/80",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
          원
        </span>
      </div>
    </div>
  );
}

export const LabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<LabFeeItem[]>([]);

  const patchItem = (id: string, patch: Partial<LabFeeItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: {
          items?: LabFeeItem[];
          schedule?: Partial<LabFeeSchedule>;
          remake?: Partial<LabFeeSchedule>;
          enabled?: Partial<Record<string, boolean>>;
        };
        message?: string;
      }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "기공비 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const payload = res.data?.data;
      if (Array.isArray(payload?.items)) {
        setItems(
          payload.items.length
            ? payload.items.map((row, index) => normalizeLabFeeItem(row, index))
            : [],
        );
      } else {
        setItems(
          normalizeLabFeeItems({
            ...(payload?.schedule || {}),
            remake: payload?.remake,
            enabled: payload?.enabled,
          }),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await request<{ message?: string; data?: { items?: LabFeeItem[] } }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "PUT",
        token,
        jsonBody: { items },
      });
      if (!res.ok) {
        toast({
          title: "기공비 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      if (Array.isArray(res.data?.data?.items)) {
        setItems(res.data.data.items.map((row, index) => normalizeLabFeeItem(row, index)));
      }
      toast({ title: "기공비를 저장했습니다." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-5 w-5 text-primary-strong" />
          기공비 수가
        </CardTitle>
        <p className="pt-1 text-xs text-muted-foreground">
          항목 이름은 의뢰서 보철 형태와 같아야 청구됩니다. 단위는 치아 1개당, 치아 n개당, 1세트당 중에서 고릅니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const isProvided = item.enabled !== false;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-opacity",
                  !isProvided && "opacity-55",
                )}
              >
                <div className="mb-3 flex min-w-0 items-start gap-2">
                  <Checkbox
                    id={`fee-enabled-${item.id}`}
                    checked={isProvided}
                    onCheckedChange={(checked) =>
                      patchItem(item.id, { enabled: checked === true })
                    }
                    className="mt-2.5"
                    aria-label={`${item.name || "항목"} 제공`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={item.name}
                      placeholder="항목 이름 (예: 크라운)"
                      disabled={!isProvided}
                      onChange={(e) => patchItem(item.id, { name: e.target.value })}
                      className="h-10 rounded-xl"
                    />
                    <Select
                      value={item.unit}
                      disabled={!isProvided}
                      onValueChange={(value) => {
                        const unit = value as LabFeeItemUnit;
                        if (unit === "perNTeeth") {
                          patchItem(item.id, {
                            unit,
                            tiers:
                              item.tiers.length > 0
                                ? item.tiers
                                : [{ n: 3, price: item.price, remake: item.remake }],
                          });
                          return;
                        }
                        patchItem(item.id, {
                          unit,
                          price: item.price || item.tiers[0]?.price || 0,
                          remake: item.remake || item.tiers[0]?.remake || 0,
                          tiers: [],
                        });
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(LAB_FEE_ITEM_UNIT_LABELS) as LabFeeItemUnit[]).map(
                          (unit) => (
                            <SelectItem key={unit} value={unit}>
                              {LAB_FEE_ITEM_UNIT_LABELS[unit]}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-9 w-9 shrink-0 text-slate-400 hover:text-destructive"
                    onClick={() => setItems((prev) => prev.filter((row) => row.id !== item.id))}
                    aria-label="항목 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {item.unit === "perNTeeth" ? (
                  <div className="space-y-2">
                    {item.tiers.map((tier, tierIndex) => (
                      <div key={`${item.id}-tier-${tierIndex}`} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-[4.5rem] shrink-0">
                            <Input
                              type="number"
                              min={1}
                              max={32}
                              value={tier.n}
                              disabled={!isProvided}
                              onChange={(e) => {
                                const n = Math.max(
                                  1,
                                  Math.min(32, Math.round(Number(e.target.value) || 1)),
                                );
                                const tiers = item.tiers.map((row, index) =>
                                  index === tierIndex ? { ...row, n } : row,
                                );
                                patchItem(item.id, { tiers });
                              }}
                              className="h-8 rounded-lg px-1.5 pr-6 text-center text-xs tabular-nums"
                              aria-label="치아 수"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-muted-foreground">
                              치
                            </span>
                          </div>
                          <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                            이하
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!isProvided || item.tiers.length <= 1}
                            className="h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
                            onClick={() =>
                              patchItem(item.id, {
                                tiers: item.tiers.filter((_, index) => index !== tierIndex),
                              })
                            }
                            aria-label="구간 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <WonInput
                            id={`fee-${item.id}-${tierIndex}`}
                            label="원가"
                            value={tier.price}
                            disabled={!isProvided}
                            onChange={(price) => {
                              const tiers = item.tiers.map((row, index) =>
                                index === tierIndex ? { ...row, price } : row,
                              );
                              patchItem(item.id, { tiers });
                            }}
                          />
                          <WonInput
                            id={`fee-remake-${item.id}-${tierIndex}`}
                            label="리메이크"
                            remake
                            value={tier.remake}
                            disabled={!isProvided}
                            onChange={(remake) => {
                              const tiers = item.tiers.map((row, index) =>
                                index === tierIndex ? { ...row, remake } : row,
                              );
                              patchItem(item.id, { tiers });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {item.tiers.length < MAX_LAB_FEE_ITEM_TIERS ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!isProvided}
                        className="h-8 w-full rounded-lg text-xs"
                        onClick={() => {
                          const lastN = item.tiers[item.tiers.length - 1]?.n || 3;
                          patchItem(item.id, {
                            tiers: [
                              ...item.tiers,
                              { n: Math.min(32, lastN + 3), price: 0, remake: 0 },
                            ],
                          });
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        구간 추가
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <WonInput
                      id={`fee-${item.id}`}
                      label="원가"
                      value={item.price}
                      disabled={!isProvided}
                      onChange={(price) => patchItem(item.id, { price })}
                    />
                    <WonInput
                      id={`fee-remake-${item.id}`}
                      label="리메이크"
                      remake
                      value={item.remake}
                      disabled={!isProvided}
                      onChange={(remake) => patchItem(item.id, { remake })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={items.length >= MAX_LAB_FEE_ITEMS}
          className="h-10 w-full rounded-xl"
          onClick={() => setItems((prev) => [...prev, createFeeItem()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          항목 추가
        </Button>

        <Separator className="bg-slate-200/70" />

        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="h-10 gap-1.5 rounded-xl px-5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
