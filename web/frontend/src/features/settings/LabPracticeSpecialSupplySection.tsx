// related files:
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/features/settings/tabs/LabPracticeSpecialSupplyTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - 2026-08-29: 기공소 설정 — 치과별 특별공급가(검색 추가·기공비 항목 오버라이드·2열 카드).
// - 2026-08-29: 기공비 탭 옆 「특별공급가」탭 콘텐츠로 사용.
// - 2026-08-29: 할인율(전체) / 할인금액(전 기공비 항목 일괄 입력) 선택.
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import type { LabFeeItem } from "@/shared/practice/labFeeSchedule";

const AUTO_SAVE_DELAY_MS = 700;
const WON_AMOUNT_STEP = 1000;
const SEARCH_DEBOUNCE_MS = 280;

export type LabSpecialSupplyMode = "rate" | "amount";

export type LabPracticeSpecialSupplyItem = {
  feeItemId: string;
  feeItemName: string;
  discountAmount: number;
  remakeDiscountAmount: number;
};

export type LabPracticeSpecialSupplyRow = {
  practiceAnchorId: string;
  practiceName: string;
  practiceAddress?: string;
  practiceRepresentativeName?: string;
  mode: LabSpecialSupplyMode;
  discountRate: number;
  items: LabPracticeSpecialSupplyItem[];
  updatedAt?: string | null;
};

type PracticeSearchHit = {
  _id: string;
  name: string;
  representativeName?: string;
  address?: string;
  requestorKind?: string;
};

const toWon = (value: number) => Math.max(0, Math.round(Number(value) || 0));

const normalizeRate = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
};

const normalizeMode = (value: unknown): LabSpecialSupplyMode =>
  String(value || "").trim() === "rate" ? "rate" : "amount";

const feeBasePrice = (item: LabFeeItem) =>
  toWon(
    item.unit === "perNTeeth" ? item.tiers[0]?.price ?? item.price : item.price,
  );

const feeBaseRemake = (item: LabFeeItem) =>
  toWon(
    item.unit === "perNTeeth"
      ? item.tiers[0]?.remake ?? item.remake
      : item.remake,
  );

const rowHasEffect = (row: LabPracticeSpecialSupplyRow) => {
  if (row.mode === "rate") return normalizeRate(row.discountRate) > 0;
  return row.items.some(
    (item) =>
      toWon(item.discountAmount) > 0 || toWon(item.remakeDiscountAmount) > 0,
  );
};

const normalizeRowFromApi = (
  raw: Partial<LabPracticeSpecialSupplyRow>,
): LabPracticeSpecialSupplyRow => {
  const mode = normalizeMode(raw.mode);
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => ({
          feeItemId: String(item?.feeItemId || "").trim(),
          feeItemName: String(item?.feeItemName || "").trim(),
          discountAmount: toWon(item?.discountAmount),
          remakeDiscountAmount: toWon(item?.remakeDiscountAmount),
        }))
        .filter(
          (item) =>
            item.feeItemId &&
            (item.discountAmount > 0 || item.remakeDiscountAmount > 0),
        )
    : [];
  return {
    practiceAnchorId: String(raw.practiceAnchorId || "").trim(),
    practiceName: String(raw.practiceName || "").trim() || "치과",
    practiceAddress: String(raw.practiceAddress || "").trim(),
    practiceRepresentativeName: String(
      raw.practiceRepresentativeName || "",
    ).trim(),
    mode,
    discountRate: mode === "rate" ? normalizeRate(raw.discountRate) : 0,
    items: mode === "amount" ? items : [],
    updatedAt: raw.updatedAt ?? null,
  };
};

const snapshotRows = (rows: LabPracticeSpecialSupplyRow[]) =>
  JSON.stringify(
    rows
      .filter(rowHasEffect)
      .map((row) => ({
        practiceAnchorId: row.practiceAnchorId,
        mode: row.mode,
        discountRate: row.mode === "rate" ? normalizeRate(row.discountRate) : 0,
        items:
          row.mode === "amount"
            ? row.items
                .filter(
                  (item) =>
                    toWon(item.discountAmount) > 0 ||
                    toWon(item.remakeDiscountAmount) > 0,
                )
                .map((item) => ({
                  feeItemId: item.feeItemId,
                  feeItemName: item.feeItemName,
                  discountAmount: toWon(item.discountAmount),
                  remakeDiscountAmount: toWon(item.remakeDiscountAmount),
                }))
            : [],
      })),
  );

const formatWon = (value: number) =>
  `${toWon(value).toLocaleString("ko-KR")}원`;

function CompactWonInput({
  id,
  label,
  value,
  onChange,
  remake = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  remake?: boolean;
}) {
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
          "mb-1 block text-[10px] font-medium",
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
            "h-8 rounded-lg border-slate-200 bg-slate-50/70 px-2 pr-8 text-right text-sm font-semibold tabular-nums tracking-tight",
            remake && "border-amber-200/80 bg-amber-50/40",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-slate-400">
          원
        </span>
      </div>
    </div>
  );
}

type LabPracticeSpecialSupplySectionProps = {
  feeItems: LabFeeItem[];
};

export function LabPracticeSpecialSupplySection({
  feeItems,
}: LabPracticeSpecialSupplySectionProps) {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<LabPracticeSpecialSupplyRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<PracticeSearchHit[]>([]);
  const hydratedRef = useRef(false);
  const savedSnapshotRef = useRef("");
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const namedFeeItems = useMemo(
    () => feeItems.filter((item) => String(item.name || "").trim()),
    [feeItems],
  );

  const feeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of feeItems) {
      map.set(item.id, String(item.name || "").trim());
    }
    return map;
  }, [feeItems]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    hydratedRef.current = false;
    try {
      const res = await request<{
        data?: { items?: Partial<LabPracticeSpecialSupplyRow>[] };
        message?: string;
      }>({
        path: "/api/lab-trading-partners/special-supply-prices",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "특별공급가 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const items = (Array.isArray(res.data?.data?.items)
        ? res.data.data.items
        : []
      )
        .map(normalizeRowFromApi)
        .filter((row) => row.practiceAnchorId);
      setRows(items);
      savedSnapshotRef.current = snapshotRows(items);
      hydratedRef.current = true;
      if (items.length === 1) {
        setExpandedIds(new Set([items[0].practiceAnchorId]));
      }
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (nextRows: LabPracticeSpecialSupplyRow[]) => {
      if (!token) return false;
      const payloadRows = nextRows.filter(rowHasEffect);
      try {
        const res = await request<{
          message?: string;
          data?: { items?: Partial<LabPracticeSpecialSupplyRow>[] };
        }>({
          path: "/api/lab-trading-partners/special-supply-prices",
          method: "PUT",
          token,
          jsonBody: {
            items: payloadRows.map((row) => ({
              practiceAnchorId: row.practiceAnchorId,
              mode: row.mode,
              discountRate:
                row.mode === "rate" ? normalizeRate(row.discountRate) : 0,
              items:
                row.mode === "amount"
                  ? row.items
                      .filter(
                        (item) =>
                          toWon(item.discountAmount) > 0 ||
                          toWon(item.remakeDiscountAmount) > 0,
                      )
                      .map((item) => ({
                        feeItemId: item.feeItemId,
                        feeItemName:
                          item.feeItemName ||
                          feeNameById.get(item.feeItemId) ||
                          "",
                        discountAmount: toWon(item.discountAmount),
                        remakeDiscountAmount: toWon(item.remakeDiscountAmount),
                      }))
                  : [],
            })),
          },
        });
        if (!res.ok) {
          toast({
            title: "특별공급가 저장 실패",
            description: res.data?.message || "다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        const saved = (Array.isArray(res.data?.data?.items)
          ? res.data.data.items
          : []
        )
          .map(normalizeRowFromApi)
          .filter((row) => row.practiceAnchorId);
        // 아직 할인 미입력인 초안 치과는 로컬에 유지
        const savedIds = new Set(saved.map((row) => row.practiceAnchorId));
        const drafts = nextRows.filter(
          (row) => !rowHasEffect(row) && !savedIds.has(row.practiceAnchorId),
        );
        const merged = [...saved, ...drafts];
        setRows(merged);
        savedSnapshotRef.current = snapshotRows(merged);
        return true;
      } catch {
        toast({
          title: "특별공급가 저장 실패",
          description: "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [token, toast, feeNameById],
  );

  useEffect(() => {
    if (!hydratedRef.current || loading) return;
    const snap = snapshotRows(rows);
    if (snap === savedSnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void persist(rowsRef.current).finally(() => setSaving(false));
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [rows, loading, persist]);

  useEffect(() => {
    if (!addOpen) {
      setSearchQ("");
      setSearchHits([]);
      return;
    }
    const q = searchQ.trim();
    if (q.length < 1) {
      setSearchHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!token) return;
      setSearching(true);
      try {
        const res = await request<{
          data?: PracticeSearchHit[];
          message?: string;
        }>({
          path: `/api/businesses/search?q=${encodeURIComponent(q)}&businessType=${encodeURIComponent("requestor")}&requestorKind=${encodeURIComponent("practice")}`,
          method: "GET",
          token,
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        const existing = new Set(rowsRef.current.map((r) => r.practiceAnchorId));
        setSearchHits(
          list.filter(
            (hit) =>
              hit?._id &&
              !existing.has(String(hit._id)) &&
              String(hit.requestorKind || "") !== "lab",
          ),
        );
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addOpen, searchQ, token]);

  const addPractice = (hit: PracticeSearchHit) => {
    const id = String(hit._id || "").trim();
    if (!id) return;
    if (rows.some((row) => row.practiceAnchorId === id)) {
      toast({ title: "이미 추가된 치과입니다.", duration: 2000 });
      return;
    }
    if (!namedFeeItems.length) {
      toast({
        title: "기공비 항목이 필요합니다",
        description: "기공비 탭에서 항목을 먼저 추가하세요.",
        variant: "destructive",
      });
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        practiceAnchorId: id,
        practiceName: String(hit.name || "").trim() || "치과",
        practiceAddress: String(hit.address || "").trim(),
        practiceRepresentativeName: String(hit.representativeName || "").trim(),
        mode: "amount",
        discountRate: 0,
        items: [],
      },
    ]);
    setExpandedIds((prev) => new Set(prev).add(id));
    setAddOpen(false);
  };

  const removePractice = (practiceAnchorId: string) => {
    setRows((prev) =>
      prev.filter((row) => row.practiceAnchorId !== practiceAnchorId),
    );
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(practiceAnchorId);
      return next;
    });
  };

  const patchPractice = (
    practiceAnchorId: string,
    patch: Partial<LabPracticeSpecialSupplyRow>,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.practiceAnchorId === practiceAnchorId ? { ...row, ...patch } : row,
      ),
    );
  };

  const setPracticeMode = (
    practiceAnchorId: string,
    mode: LabSpecialSupplyMode,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.practiceAnchorId !== practiceAnchorId) return row;
        if (row.mode === mode) return row;
        return { ...row, mode };
      }),
    );
  };

  const patchPracticeItemDiscount = (
    practiceAnchorId: string,
    feeItem: LabFeeItem,
    patch: Partial<
      Pick<
        LabPracticeSpecialSupplyItem,
        "discountAmount" | "remakeDiscountAmount"
      >
    >,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.practiceAnchorId !== practiceAnchorId) return row;
        const existing = row.items.find((item) => item.feeItemId === feeItem.id);
        const nextItem: LabPracticeSpecialSupplyItem = {
          feeItemId: feeItem.id,
          feeItemName: feeItem.name,
          discountAmount: toWon(existing?.discountAmount),
          remakeDiscountAmount: toWon(existing?.remakeDiscountAmount),
          ...patch,
        };
        const rest = row.items.filter((item) => item.feeItemId !== feeItem.id);
        const keep =
          toWon(nextItem.discountAmount) > 0 ||
          toWon(nextItem.remakeDiscountAmount) > 0;
        return {
          ...row,
          items: keep ? [...rest, nextItem] : rest,
        };
      }),
    );
  };

  const toggleExpanded = (practiceAnchorId: string, open: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(practiceAnchorId);
      else next.delete(practiceAnchorId);
      return next;
    });
  };

  const amountDiscountById = (row: LabPracticeSpecialSupplyRow) => {
    const map = new Map<string, LabPracticeSpecialSupplyItem>();
    for (const item of row.items) map.set(item.feeItemId, item);
    return map;
  };

  if (loading) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          특별공급가 불러오는 중…
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
                <Tag className="h-4 w-4 text-primary-strong" />
              </span>
              특별공급가
            </CardTitle>
            {saving ? (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                저장 중
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            치과별로 할인율(전체) 또는 항목별 할인금액을 적용합니다. 지정하지
            않은 항목은 기본 기공비를 씁니다.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const open = expandedIds.has(row.practiceAnchorId);
              const discounts = amountDiscountById(row);
              const discountedCount = row.items.filter(
                (item) =>
                  toWon(item.discountAmount) > 0 ||
                  toWon(item.remakeDiscountAmount) > 0,
              ).length;
              const summary =
                row.mode === "rate"
                  ? normalizeRate(row.discountRate) > 0
                    ? `전 항목 ${normalizeRate(row.discountRate)}% 할인`
                    : "할인율 미설정"
                  : discountedCount > 0
                    ? `${discountedCount}개 항목 할인금액`
                    : "할인금액 미설정";

              return (
                <Collapsible
                  key={row.practiceAnchorId}
                  open={open}
                  onOpenChange={(next) =>
                    toggleExpanded(row.practiceAnchorId, next)
                  }
                >
                  <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-sm transition-all hover:border-primary-muted/70 hover:shadow-md">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200/80">
                        <Building2 className="h-3.5 w-3.5 text-slate-600" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.practiceName || "치과"}
                            </p>
                            {row.practiceAddress ? (
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {row.practiceAddress}
                              </p>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              removePractice(row.practiceAnchorId)
                            }
                            aria-label="치과 제거"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="mt-2 flex w-full items-center gap-1 rounded-lg px-1 py-1 text-left text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
                                open && "rotate-180",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {summary}
                            </span>
                          </button>
                        </CollapsibleTrigger>
                      </div>
                    </div>

                    <CollapsibleContent className="mt-2 space-y-2.5 border-t border-slate-100 pt-2.5">
                      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1">
                        {(
                          [
                            { key: "rate", label: "할인율" },
                            { key: "amount", label: "할인금액" },
                          ] as const
                        ).map((opt) => {
                          const selected = row.mode === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() =>
                                setPracticeMode(row.practiceAnchorId, opt.key)
                              }
                              className={cn(
                                "h-8 rounded-lg text-[12px] font-medium transition-all",
                                selected
                                  ? "bg-white text-slate-900 shadow-sm"
                                  : "text-slate-500 hover:text-slate-700",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>

                      {row.mode === "rate" ? (
                        <div className="rounded-xl bg-slate-50/70 px-3 py-2.5">
                          <Label
                            htmlFor={`ss-rate-${row.practiceAnchorId}`}
                            className="mb-1.5 block text-[11px] font-medium text-slate-500"
                          >
                            전 항목 할인율
                          </Label>
                          <div className="relative max-w-[10rem]">
                            <Input
                              id={`ss-rate-${row.practiceAnchorId}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step={0.1}
                              value={
                                row.discountRate === 0
                                  ? ""
                                  : String(row.discountRate)
                              }
                              onChange={(e) =>
                                patchPractice(row.practiceAnchorId, {
                                  discountRate: normalizeRate(e.target.value),
                                })
                              }
                              placeholder="0"
                              className="h-9 rounded-lg border-slate-200 bg-white pr-8 text-right text-sm font-semibold tabular-nums"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] font-medium text-slate-400">
                              %
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            기공비·리메이크 수가에 동일 비율로 적용됩니다.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {!namedFeeItems.length ? (
                            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                              기공비 탭에 항목을 먼저 추가하세요.
                            </p>
                          ) : (
                            namedFeeItems.map((fee) => {
                              const d = discounts.get(fee.id);
                              const base = feeBasePrice(fee);
                              const remake = feeBaseRemake(fee);
                              return (
                                <div
                                  key={fee.id}
                                  className="rounded-xl bg-slate-50/70 px-2.5 py-2"
                                >
                                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                                    <span className="min-w-0 truncate text-[12px] font-medium text-slate-800">
                                      {fee.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                      기본 {formatWon(base)}
                                      {remake > 0
                                        ? ` · 리메이크 ${formatWon(remake)}`
                                        : ""}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <CompactWonInput
                                      id={`ss-${row.practiceAnchorId}-${fee.id}-amt`}
                                      label="할인금액"
                                      value={toWon(d?.discountAmount)}
                                      onChange={(discountAmount) =>
                                        patchPracticeItemDiscount(
                                          row.practiceAnchorId,
                                          fee,
                                          { discountAmount },
                                        )
                                      }
                                    />
                                    <CompactWonInput
                                      id={`ss-${row.practiceAnchorId}-${fee.id}-remake`}
                                      label="리메이크 할인"
                                      remake
                                      value={toWon(d?.remakeDiscountAmount)}
                                      onChange={(remakeDiscountAmount) =>
                                        patchPracticeItemDiscount(
                                          row.practiceAnchorId,
                                          fee,
                                          { remakeDiscountAmount },
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-4 py-6 text-sm font-medium text-slate-500 transition-colors hover:border-primary-muted hover:bg-primary-soft/30 hover:text-primary-strong"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                <Plus className="h-4 w-4" />
              </span>
              치과 추가
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>특별공급가 치과 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="치과명·대표자명으로 검색"
                className="h-11 rounded-xl pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200/80">
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  검색 중…
                </div>
              ) : !searchQ.trim() ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  치과 이름을 입력하세요.
                </p>
              ) : searchHits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  검색 결과가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {searchHits.map((hit) => (
                    <li key={hit._id}>
                      <button
                        type="button"
                        onClick={() => addPractice(hit)}
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary-soft/30"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200/80">
                          <Building2 className="h-3.5 w-3.5 text-slate-600" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {hit.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {[hit.representativeName, hit.address]
                              .filter(Boolean)
                              .join(" · ") || "주소 없음"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
