// related files:
// - web/backend/controllers/admin/admin.abutsLabFeeSchedule.controller.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/AutoMatchLabFeeBudgetDialog.tsx
//
// 어벗츠 기공수가(플랫폼 카탈로그). 자동매칭 기공비 범위 모달 항목 SSOT.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { cn } from "@/shared/ui/cn";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  MAX_LAB_FEE_ITEMS,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
  type LabFeeItem,
  type LabFeeItemUnit,
} from "@/shared/practice/labFeeSchedule";

const UNIT_OPTIONS = Object.keys(LAB_FEE_ITEM_UNIT_LABELS) as LabFeeItemUnit[];
const AUTO_SAVE_DELAY_MS = 700;

const snapshotItems = (next: LabFeeItem[]) => JSON.stringify(next);

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
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0">
      <Label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-medium text-slate-500"
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
          className="h-11 rounded-xl border-slate-200 bg-slate-50/70 px-3 pr-8 text-right text-base font-semibold tabular-nums tracking-tight disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

export const AdminAbutsLabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LabFeeItem[]>([]);
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const patchItem = (id: string, patch: Partial<LabFeeItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const patchTier = (
    item: LabFeeItem,
    patch: Partial<{ n: number; price: number }>,
  ) => {
    const current = item.tiers[0] || { n: 3, price: item.price, remake: 0 };
    const next = { ...current, ...patch, remake: 0 };
    patchItem(item.id, {
      price: next.price,
      remake: 0,
      tiers: [next],
    });
  };

  const applyLoadedItems = (next: LabFeeItem[]) => {
    setItems(next);
    savedSnapshotRef.current = snapshotItems(next);
    hydratedRef.current = true;
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    hydratedRef.current = false;
    try {
      const res = await request<{
        data?: { items?: LabFeeItem[] };
        message?: string;
      }>({
        path: "/api/admin/settings/abuts-lab-fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "어벗츠 수가 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const payload = res.data?.data;
      applyLoadedItems(
        Array.isArray(payload?.items) && payload.items.length
          ? normalizeLabFeeItems({ items: payload.items })
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (nextItems: LabFeeItem[]) => {
      if (!token) return false;
      try {
        const res = await request<{
          message?: string;
          data?: { items?: LabFeeItem[] };
        }>({
          path: "/api/admin/settings/abuts-lab-fee-schedule",
          method: "PUT",
          token,
          jsonBody: {
            items: nextItems.map((item) => ({ ...item, remake: 0 })),
          },
        });
        if (!res.ok) {
          toast({
            title: "어벗츠 수가 저장 실패",
            description: res.data?.message || "다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        const serverItems = Array.isArray(res.data?.data?.items)
          ? normalizeLabFeeItems({ items: res.data.data.items })
          : nextItems;
        savedSnapshotRef.current = snapshotItems(serverItems);
        if (snapshotItems(itemsRef.current) === snapshotItems(nextItems)) {
          setItems(serverItems);
          savedSnapshotRef.current = snapshotItems(serverItems);
        }
        return true;
      } catch {
        toast({
          title: "어벗츠 수가 저장 실패",
          description: "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast],
  );

  useEffect(() => {
    if (!hydratedRef.current || !token || loading) return;
    const snapshot = snapshotItems(items);
    if (snapshot === savedSnapshotRef.current) return;

    const timer = window.setTimeout(() => {
      const payload = itemsRef.current;
      if (snapshotItems(payload) === savedSnapshotRef.current) return;
      void persist(payload);
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [items, token, loading, persist]);

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-4">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
            <Banknote className="h-4 w-4 text-primary-strong" />
          </span>
          어벗츠 수가
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          항목을 추가하면 자동매칭 기공비 범위 설정에도 바로 반영됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const isProvided = item.enabled !== false;
            const tier = item.tiers[0] || {
              n: 3,
              price: item.price,
              remake: 0,
            };
            return (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm transition-all",
                  isProvided
                    ? "hover:border-primary-muted/80 hover:shadow-md"
                    : "opacity-60",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Switch
                    id={`abuts-fee-enabled-${item.id}`}
                    checked={isProvided}
                    onCheckedChange={(checked) =>
                      patchItem(item.id, { enabled: checked === true })
                    }
                    className="mt-2"
                    aria-label={`${item.name || "항목"} 사용`}
                  />
                  <Input
                    value={item.name}
                    placeholder="항목 이름 (예: 크라운)"
                    disabled={!isProvided}
                    onChange={(e) =>
                      patchItem(item.id, { name: e.target.value })
                    }
                    className="h-10 rounded-xl border-slate-200 bg-white text-[15px] font-semibold tracking-tight"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-9 w-9 shrink-0 text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter((row) => row.id !== item.id),
                      )
                    }
                    aria-label="항목 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/80 p-1">
                  {UNIT_OPTIONS.map((unit) => {
                    const selected = item.unit === unit;
                    return (
                      <button
                        key={unit}
                        type="button"
                        disabled={!isProvided}
                        onClick={() => {
                          if (unit === "perNTeeth") {
                            patchItem(item.id, {
                              unit,
                              tiers:
                                item.tiers.length > 0
                                  ? [item.tiers[0]]
                                  : [
                                      {
                                        n: 3,
                                        price: item.price,
                                        remake: 0,
                                      },
                                    ],
                            });
                            return;
                          }
                          patchItem(item.id, {
                            unit,
                            price: item.price || item.tiers[0]?.price || 0,
                            remake: 0,
                            tiers: [],
                          });
                        }}
                        className={cn(
                          "h-8 rounded-lg px-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed",
                          selected
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {LAB_FEE_ITEM_UNIT_LABELS[unit]}
                      </button>
                    );
                  })}
                </div>

                {item.unit === "perNTeeth" ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2">
                    <div className="relative w-[4.75rem] shrink-0">
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
                          patchTier(item, { n });
                        }}
                        className="h-9 rounded-lg border-slate-200 bg-white px-2 pr-6 text-center text-sm font-semibold tabular-nums"
                        aria-label="치아 수"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-400">
                        치
                      </span>
                    </div>
                    <span className="text-[13px] font-medium text-slate-600">
                      이하
                    </span>
                  </div>
                ) : null}

                <WonInput
                  id={`abuts-fee-${item.id}`}
                  label="기준 수가"
                  value={item.unit === "perNTeeth" ? tier.price : item.price}
                  disabled={!isProvided}
                  onChange={(price) =>
                    item.unit === "perNTeeth"
                      ? patchTier(item, { price })
                      : patchItem(item.id, { price, remake: 0 })
                  }
                />
              </div>
            );
          })}

          {items.length < MAX_LAB_FEE_ITEMS ? (
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, createFeeItem()])}
              className="flex min-h-[11.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-4 py-6 text-sm font-medium text-slate-500 transition-colors hover:border-primary-muted hover:bg-primary-soft/30 hover:text-primary-strong"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                <Plus className="h-4 w-4" />
              </span>
              항목 추가
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
