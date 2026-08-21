// related files:
// - web/backend/controllers/admin/admin.abutsLabFeeSchedule.controller.js
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
//
// 어벗츠 기공수가(플랫폼 카탈로그). 항목 On/Off·이름 관리. 평균 재계산 없음.
// 기공소 신규 항목은 Off·검토 대기로 들어오며, On하면 적용·대기 해제.
// change-log:
// - 2026-08-21: 항목 추가(빈 이름 초안)가 자동저장 응답에 지워지지 않게 로컬 초안을 보존.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
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

const sortCatalogItems = (list: LabFeeItem[]) => {
  const pending = list.filter((item) => item.pendingReview === true);
  const rest = list.filter((item) => item.pendingReview !== true);
  return [...pending, ...rest];
};

/** 이름 없는 추가 초안. 서버 normalize는 빈 이름을 버리므로 응답 병합 시 보존. */
const isDraftFeeItem = (item: LabFeeItem) => !String(item.name || "").trim();

const mergeServerItemsWithLocalDrafts = (
  serverItems: LabFeeItem[],
  localItems: LabFeeItem[],
) => {
  const drafts = localItems.filter(isDraftFeeItem);
  if (!drafts.length) return serverItems;
  const serverIds = new Set(serverItems.map((item) => item.id));
  return sortCatalogItems([
    ...serverItems,
    ...drafts.filter((draft) => !serverIds.has(draft.id)),
  ]);
};

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
  // 편집 중엔 문자열 초안만 두고 blur 때 확정(키마다 commit하면 카드 리마운트로 포커스가 끊김).
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const display = draft !== null ? draft : String(toWon(value));

  const commitDraft = () => {
    const raw = draftRef.current;
    if (raw === null) return;
    onChange(toWon(Number(raw.replace(/\D/g, "") || 0)));
    draftRef.current = null;
    setDraft(null);
  };

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
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          disabled={disabled}
          onFocus={(e) => {
            const next = toWon(value) === 0 ? "" : String(toWon(value));
            draftRef.current = next;
            setDraft(next);
            e.target.select();
          }}
          onBlur={() => commitDraft()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            draftRef.current = digits;
            setDraft(digits);
          }}
          className="h-11 rounded-xl border-slate-200 bg-slate-50/70 px-3 pr-8 text-right text-base font-semibold tabular-nums tracking-tight disabled:cursor-not-allowed disabled:bg-slate-50"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

type Props = {
  onPendingCountChange?: (count: number) => void;
};

export const AdminAbutsLabFeeScheduleTab = ({
  onPendingCountChange,
}: Props = {}) => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LabFeeItem[]>([]);
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const pendingCount = useMemo(
    () => items.filter((item) => item.pendingReview === true).length,
    [items],
  );

  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [pendingCount, onPendingCountChange]);

  const patchItem = (id: string, patch: Partial<LabFeeItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.enabled === true) {
          next.pendingReview = false;
          delete next.proposedByLabName;
          delete next.proposedByLabAnchorId;
          delete next.proposedAt;
        }
        return next;
      }),
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
    const sorted = sortCatalogItems(next);
    setItems(sorted);
    savedSnapshotRef.current = snapshotItems(sorted);
    hydratedRef.current = true;
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    hydratedRef.current = false;
    try {
      const res = await request<{
        data?: { items?: LabFeeItem[]; pendingCount?: number };
        message?: string;
      }>({
        path: "/api/admin/settings/abuts-lab-fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "기본 기공수가 조회 실패",
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

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["abuts-lab-fee:pending-items"],
    deferWhenEditing: false,
    onMatch: () => {
      void load();
    },
  });

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
            items: nextItems.map((item) => ({
              ...item,
              remake: 0,
              pendingReview:
                item.enabled === false && item.pendingReview === true
                  ? true
                  : undefined,
            })),
          },
        });
        if (!res.ok) {
          toast({
            title: "기본 기공수가 저장 실패",
            description: res.data?.message || "다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        const serverItems = Array.isArray(res.data?.data?.items)
          ? sortCatalogItems(
              normalizeLabFeeItems({ items: res.data.data.items }),
            )
          : nextItems.filter((item) => !isDraftFeeItem(item));
        const localItems = itemsRef.current;
        const merged = mergeServerItemsWithLocalDrafts(serverItems, localItems);
        if (snapshotItems(localItems) === snapshotItems(nextItems)) {
          setItems(merged);
          savedSnapshotRef.current = snapshotItems(merged);
        } else {
          // 저장 중 추가 편집이 있으면 로컬 유지. 스냅샷만 서버+현재 초안 기준으로 맞춤.
          savedSnapshotRef.current = snapshotItems(
            mergeServerItemsWithLocalDrafts(serverItems, localItems),
          );
        }
        return true;
      } catch {
        toast({
          title: "기본 기공수가 저장 실패",
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
          기본 기공수가
          {pendingCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              검토 {pendingCount}
            </span>
          ) : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          신규 가입 기공소의 기본값입니다. 기존 기공소 설정은 덮어쓰지 않습니다.
          기공소 신규 항목은 Off로 들어오니 검증 후 On으로 적용하세요.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const isProvided = item.enabled !== false;
            const isPending = item.pendingReview === true;
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
                  isPending &&
                    "border-amber-300/90 bg-amber-50/50 ring-1 ring-amber-200/80",
                  isProvided
                    ? "hover:border-primary-muted/80 hover:shadow-md"
                    : !isPending && "opacity-60",
                )}
              >
                {isPending ? (
                  <div className="rounded-lg bg-amber-100/80 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                    신규 제안
                    {item.proposedByLabName
                      ? ` · ${item.proposedByLabName}`
                      : ""}
                    {" · 검증 후 On으로 적용"}
                  </div>
                ) : null}
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
                    disabled={!isProvided && !isPending}
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
                        disabled={!isProvided && !isPending}
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
                        disabled={!isProvided && !isPending}
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
                  disabled={!isProvided && !isPending}
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
