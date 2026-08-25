// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/features/settings/LabFeeSetupPrompt.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - 2026-08-25: 치과 의뢰·기공비 정상 결제용 수가 설정 안내 문구.
// - 2026-08-14: 하단 저장 버튼 제거. 항목 변경은 디바운스 자동 저장. 마스터 스위치는 즉시 저장.
// - 2026-08-25: 수가·리메이크 1,000원 단위 스피너.
// - 2026-08-25: 기본 기공수가 신규(from=catalog·need)도 수락과 같이 카드 하이라이트.
// - 2026-08-19: 수락 클릭 시 `from=accept` 포워드 모달(LabFeeSetupPrompt).
// - 2026-08-19: `need` 쿼리 수가 카드를 맨 아래에서 깜빡이며 입력 안내.
// - 2026-08-21: 항목 추가(빈 이름 초안)가 자동저장 응답에 지워지지 않게 로컬 초안을 보존.
// - 2026-08-21: 라벨 원가→수가. WonInput은 blur 확정(입력 중 need 카드 리마운트로 포커스 끊김 방지).
// - 2026-08-24: need 강제 입력 시 커스텀어벗(지그포함/제외) 기본가 4만·3만 시드.
// - 2026-08-21: need 강제 입력은 맨 아래에서 작업(입력 후 위치 점프 혼동 방지).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { parseLabFeeNeedNames } from "@/features/settings/LabFeeSetupPrompt";
import { cn } from "@/shared/ui/cn";
import {
  LAB_FEE_ITEM_UNIT_LABELS,
  LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE,
  LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
  LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE,
  LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
  MAX_LAB_FEE_ITEMS,
  normalizeLabFeeItem,
  normalizeLabFeeItems,
  labFeeItemMatchesNeedName,
  type LabFeeItem,
  type LabFeeItemUnit,
  type LabFeeSchedule,
} from "@/shared/practice/labFeeSchedule";

const UNIT_OPTIONS = Object.keys(LAB_FEE_ITEM_UNIT_LABELS) as LabFeeItemUnit[];
const AUTO_SAVE_DELAY_MS = 700;
/** 수가·리메이크 스피너 증감 단위 */
const WON_AMOUNT_STEP = 1000;

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

/** 이름 없는 추가 초안. 서버 normalize는 빈 이름을 버리므로 응답 병합 시 보존. */
const isDraftFeeItem = (item: LabFeeItem) => !String(item.name || "").trim();

const mergeServerItemsWithLocalDrafts = (
  serverItems: LabFeeItem[],
  localItems: LabFeeItem[],
) => {
  const drafts = localItems.filter(isDraftFeeItem);
  if (!drafts.length) return serverItems;
  const serverIds = new Set(serverItems.map((item) => item.id));
  return [
    ...serverItems,
    ...drafts.filter((draft) => !serverIds.has(draft.id)),
  ];
};

const toWon = (value: number) => Math.max(0, Math.round(Number(value) || 0));

const labFeeItemHasChargePrice = (item: LabFeeItem) => {
  if (item.enabled === false) return false;
  const tierMax = Math.max(
    0,
    ...item.tiers.map((tier) => Math.round(Number(tier.price || 0))),
  );
  return Math.max(0, Math.round(Number(item.price || 0)), tierMax) > 0;
};

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
  // 편집 중엔 문자열 초안만 두고 blur 때 확정.
  // 키마다 onChange하면 price>0 순간 need 카드가 리마운트되어 "4"에서 포커스가 끊긴다.
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const focusedRef = useRef(false);
  const display = draft !== null ? draft : String(toWon(value));

  const commitDraft = () => {
    const raw = draftRef.current;
    if (raw === null) return;
    onChange(toWon(Number(raw || 0)));
    draftRef.current = null;
    setDraft(null);
  };

  return (
    <div className="min-w-0">
      <Label
        htmlFor={id}
        className={cn(
          "mb-1.5 block text-[11px] font-medium",
          remake ? "text-amber-800" : "text-slate-500",
        )}
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={WON_AMOUNT_STEP}
          autoComplete="off"
          value={display}
          disabled={disabled}
          onFocus={(e) => {
            focusedRef.current = true;
            const next = toWon(value) === 0 ? "" : String(toWon(value));
            draftRef.current = next;
            setDraft(next);
            e.target.select();
          }}
          onBlur={() => {
            focusedRef.current = false;
            commitDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onChange={(e) => {
            const next = e.target.value;
            // 스피너(±1000)는 즉시 반영. 타이핑은 blur까지 초안 유지.
            if (!focusedRef.current) {
              onChange(toWon(Number(next || 0)));
              return;
            }
            const prev = draftRef.current;
            const prevNum = toWon(Number(prev || 0));
            const nextNum = toWon(Number(next || 0));
            const spun =
              prev !== null &&
              next !== "" &&
              Math.abs(nextNum - prevNum) === WON_AMOUNT_STEP;
            if (spun) {
              draftRef.current = null;
              setDraft(null);
              onChange(nextNum);
              return;
            }
            draftRef.current = next;
            setDraft(next);
          }}
          className={cn(
            "h-11 rounded-xl border-slate-200 bg-slate-50/70 px-3 pr-14 text-right text-base font-semibold tabular-nums tracking-tight disabled:cursor-not-allowed disabled:bg-slate-50",
            remake && "border-amber-200/80 bg-amber-50/40",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-8 flex items-center text-[11px] font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

export const LabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightSetup = searchParams.get("setup") === "1";
  const fromAccept = searchParams.get("from") === "accept";
  const fromCatalog = searchParams.get("from") === "catalog";
  const fromNeedGuide = fromAccept || fromCatalog;
  const needNames = useMemo(
    () => parseLabFeeNeedNames(searchParams.toString()),
    [searchParams],
  );
  const needKey = needNames.join(",");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(false);
  const [items, setItems] = useState<LabFeeItem[]>([]);
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const itemsRef = useRef(items);
  const activeRef = useRef(active);
  itemsRef.current = items;
  activeRef.current = active;

  const patchItem = (id: string, patch: Partial<LabFeeItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const patchTier = (
    item: LabFeeItem,
    patch: Partial<{ n: number; price: number; remake: number }>,
  ) => {
    const current = item.tiers[0] || { n: 3, price: item.price, remake: item.remake };
    const next = { ...current, ...patch };
    patchItem(item.id, {
      price: next.price,
      remake: next.remake,
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
        data?: {
          items?: LabFeeItem[];
          schedule?: Partial<LabFeeSchedule>;
          remake?: Partial<LabFeeSchedule>;
          enabled?: Partial<Record<string, boolean>>;
          active?: boolean;
          configured?: boolean;
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
      setActive(Boolean(payload?.active ?? payload?.configured));
      if (Array.isArray(payload?.items)) {
        applyLoadedItems(
          payload.items.length ? normalizeLabFeeItems({ items: payload.items }) : [],
        );
      } else {
        applyLoadedItems(
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

  useEffect(() => {
    if (loading || !hydratedRef.current || !needNames.length) return;
    setItems((prev) => {
      const missing = needNames.filter(
        (name) => !prev.some((item) => labFeeItemMatchesNeedName(item, name)),
      );
      const isNeed = (item: LabFeeItem) =>
        needNames.some((name) => labFeeItemMatchesNeedName(item, name));
      const rest = prev.filter((item) => !isNeed(item));
      const hits = prev.filter((item) => isNeed(item));
      const created = missing.map((name) =>
        createFeeItem({
          name,
          enabled: true,
          price:
            name === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME
              ? LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE
              : name === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME
                ? LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE
                : 0,
          unit: name === "임시치아" ? "perNTeeth" : "perTooth",
        }),
      );
      // 강제 입력은 맨 아래에서 작업. 저장 후에도 같은 위치에 남도록 items 순서를 맞춘다.
      const next = [...rest, ...hits, ...created];
      if (
        next.length === prev.length &&
        next.every((item, i) => item === prev[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [loading, needKey, needNames]);

  const persist = useCallback(
    async (next: { items: LabFeeItem[]; active: boolean }) => {
      if (!token) return false;
      try {
        const res = await request<{
          message?: string;
          data?: { items?: LabFeeItem[]; active?: boolean; configured?: boolean };
        }>({
          path: "/api/lab-trading-partners/fee-schedule",
          method: "PUT",
          token,
          jsonBody: { items: next.items, active: activeRef.current },
        });
        if (!res.ok) {
          toast({
            title: "기공비 저장 실패",
            description: res.data?.message || "다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        const serverItems = Array.isArray(res.data?.data?.items)
          ? normalizeLabFeeItems({ items: res.data.data.items })
          : next.items.filter((item) => !isDraftFeeItem(item));
        const localItems = itemsRef.current;
        const merged = mergeServerItemsWithLocalDrafts(serverItems, localItems);
        if (snapshotItems(localItems) === snapshotItems(next.items)) {
          setItems(merged);
          savedSnapshotRef.current = snapshotItems(merged);
        } else {
          savedSnapshotRef.current = snapshotItems(
            mergeServerItemsWithLocalDrafts(serverItems, localItems),
          );
        }
        return true;
      } catch {
        toast({
          title: "기공비 저장 실패",
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
      void persist({ items: payload, active: activeRef.current });
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [items, token, loading, persist]);

  const toggleActive = async (nextActive: boolean) => {
    const prev = active;
    activeRef.current = nextActive;
    setActive(nextActive);
    setSaving(true);
    const ok = await persist({ items: itemsRef.current, active: nextActive });
    setSaving(false);
    if (!ok) {
      activeRef.current = prev;
      setActive(prev);
      return;
    }
    if (nextActive) {
      if (highlightSetup) {
        const next = new URLSearchParams(searchParams);
        next.delete("setup");
        setSearchParams(next, { replace: true });
      }
      toast({ title: "기공비 설정을 완료했습니다." });
      return;
    }
    toast({ title: "기공비를 껐습니다." });
  };

  const focusNeedId = items.find(
    (item) =>
      needNames.some((name) => labFeeItemMatchesNeedName(item, name)) &&
      !labFeeItemHasChargePrice(item),
  )?.id;

  const focusNeedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (loading || !needNames.length) return;
    const timer = window.setTimeout(() => {
      focusNeedRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loading, needKey, needNames.length]);

  // need 수가 입력이 끝나면 from/need/setup 쿼리를 지워 상단 안내·하이라이트를 끈다.
  useEffect(() => {
    if (loading || !hydratedRef.current || !needNames.length) return;
    const stillMissing = needNames.some((name) => {
      const item = items.find((row) => labFeeItemMatchesNeedName(row, name));
      return !item || !labFeeItemHasChargePrice(item);
    });
    if (stillMissing) return;

    const next = new URLSearchParams(searchParams);
    let changed = false;
    for (const key of ["from", "need", "setup"] as const) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [loading, items, needNames, searchParams, setSearchParams]);

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
              <Banknote className="h-4 w-4 text-primary-strong" />
            </span>
            기공비 수가
          </CardTitle>
          <div
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 transition-shadow",
              !active
                ? "bg-red-50 ring-2 ring-red-500 ring-offset-2 ring-offset-white animate-pulse"
                : "bg-slate-50 ring-1 ring-slate-200/80",
            )}
          >
            <span
              className={cn(
                "text-[12px] font-medium",
                !active ? "text-red-600" : "text-slate-600",
              )}
            >
              치과 의뢰 받으려면 켜세요.
            </span>
            <Switch
              checked={active}
              disabled={saving}
              onCheckedChange={(checked) => void toggleActive(checked === true)}
              aria-label="기공비 사용"
            />
          </div>
        </div>
        {fromNeedGuide && needNames.length ? (
          <p className="mt-2 text-[13px] font-medium text-red-600">
            {fromCatalog
              ? `치과에서 의뢰가 들어올 수 있습니다. 기공비를 정상적으로 받으려면 「${needNames.join("·")}」 수가를 켜고 설정하세요.`
              : `치과에서 의뢰가 들어왔습니다. 기공비를 정상적으로 받으려면 「${needNames.join("·")}」 수가를 켜고 설정하세요.`}
          </p>
        ) : active &&
          !items.some(
            (item) =>
              item.enabled !== false && Math.round(Number(item.price || 0)) > 0,
          ) ? (
          <p className="mt-2 text-[12px] font-medium text-red-600">
            제공할 항목을 켜야 의뢰를 수락할 수 있습니다.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const isProvided = item.enabled !== false;
            const isNeedCard = needNames.some((name) =>
              labFeeItemMatchesNeedName(item, name),
            );
            const needsInput = isNeedCard && !labFeeItemHasChargePrice(item);
            const tier = item.tiers[0] || {
              n: 3,
              price: item.price,
              remake: item.remake,
            };
            const card = (
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm transition-all",
                  isProvided
                    ? "hover:border-primary-muted/80 hover:shadow-md"
                    : "opacity-60",
                  needsInput &&
                    "opacity-100 ring-2 ring-red-500 ring-offset-2 ring-offset-white animate-pulse",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Switch
                    id={`fee-enabled-${item.id}`}
                    checked={isProvided}
                    onCheckedChange={(checked) =>
                      patchItem(item.id, { enabled: checked === true })
                    }
                    className="mt-2"
                    aria-label={`${item.name || "항목"} 제공`}
                  />
                  <Input
                    value={item.name}
                    placeholder="항목 이름 (예: 크라운)"
                    disabled={!isProvided}
                    onChange={(e) => patchItem(item.id, { name: e.target.value })}
                    className="h-10 rounded-xl border-slate-200 bg-white text-[15px] font-semibold tracking-tight"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-9 w-9 shrink-0 text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setItems((prev) => prev.filter((row) => row.id !== item.id))
                    }
                    aria-label="항목 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {needsInput ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">
                    이 항목을 켜고 수가를 입력해야 의뢰를 수락할 수 있습니다.
                  </p>
                ) : null}

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
                    <span className="text-[13px] font-medium text-slate-600">이하</span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2.5">
                  <WonInput
                    id={`fee-${item.id}`}
                    label="수가"
                    value={item.unit === "perNTeeth" ? tier.price : item.price}
                    disabled={!isProvided}
                    onChange={(price) =>
                      item.unit === "perNTeeth"
                        ? patchTier(item, { price })
                        : patchItem(item.id, { price })
                    }
                  />
                  <WonInput
                    id={`fee-remake-${item.id}`}
                    label="리메이크"
                    remake
                    value={item.unit === "perNTeeth" ? tier.remake : item.remake}
                    disabled={!isProvided}
                    onChange={(remake) =>
                      item.unit === "perNTeeth"
                        ? patchTier(item, { remake })
                        : patchItem(item.id, { remake })
                    }
                  />
                </div>
              </div>
            );
            return (
              <div
                key={item.id}
                ref={item.id === focusNeedId ? focusNeedRef : undefined}
              >
                {card}
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
