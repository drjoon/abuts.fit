// related files:
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/features/settings/tabs/LabPracticeSpecialSupplyTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - 2026-08-29: 기공소 설정 — 치과별 특별공급가(검색 추가·기공비 항목 오버라이드·2열 카드).
// - 2026-08-29: 기공비 탭 옆 「특별공급가」탭 콘텐츠로 사용.
// - 2026-08-29: 할인율(전체) / 할인금액(전 기공비 항목 일괄 입력) 선택.
// - 2026-08-29: 항목 행 압축·불필요 문구 제거. 치과 추가는 모달 대신 카드 내 콤보(기공소 선택과 동일).
// - 2026-08-29: 할인금액은 전 항목 나열 대신 항목 개별 추가. 미지정은 기본 기공비.
// - 2026-08-29: 할인율 UI −/+·5% 단위.
// - 2026-08-29: 할인금액 모드는 할인가(최종가) 입력·1천원 스피너. 저장은 기본가−할인가.
// - 2026-08-29: localStorage 캐시 제거 — 서버 GET/PUT만 사용(레이스 제거).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Building2,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Plus,
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
const RATE_STEP = 5;
const SEARCH_DEBOUNCE_MS = 280;
/** 과거 localStorage 캐시 키 — 로드 시 일회 제거. */
const LEGACY_SPECIAL_SUPPLY_CACHE_PREFIX = "abutsfit:lab-special-supply:v1:";

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

const stepRate = (current: number, dir: 1 | -1) => {
  const c = normalizeRate(current);
  if (dir > 0) {
    return Math.min(100, Math.ceil((c + 1e-6) / RATE_STEP) * RATE_STEP);
  }
  return Math.max(0, Math.floor((c - 1e-6) / RATE_STEP) * RATE_STEP);
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

/** UI 할인가 → 저장용 할인액(기본가 − 할인가). */
const toDiscountFromFinal = (base: number, finalPrice: number) => {
  const b = toWon(base);
  const f = Math.min(b, toWon(finalPrice));
  return Math.max(0, b - f);
};

/** 저장 할인액 → UI 할인가. */
const toFinalFromDiscount = (base: number, discountAmount: number) =>
  Math.max(0, toWon(base) - toWon(discountAmount));

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

const snapshotRows = (rows: LabPracticeSpecialSupplyRow[]) => {
  const normalized = rows
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
              .sort((a, b) => a.feeItemId.localeCompare(b.feeItemId))
          : [],
    }))
    .sort((a, b) => a.practiceAnchorId.localeCompare(b.practiceAnchorId));
  return JSON.stringify(normalized);
};

const clearLegacySpecialSupplyCache = () => {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LEGACY_SPECIAL_SUPPLY_CACHE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const formatWon = (value: number) =>
  `${toWon(value).toLocaleString("ko-KR")}원`;

function CompactWonInput({
  id,
  label,
  value,
  onChange,
  max,
  remake = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  remake?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const focusedRef = useRef(false);
  const won = toWon(value);
  const display = draft !== null ? draft : String(won);

  const clampWon = (n: number) => {
    let next = toWon(n);
    if (typeof max === "number" && Number.isFinite(max)) {
      next = Math.min(toWon(max), next);
    }
    return next;
  };

  const commitDraft = () => {
    const raw = draftRef.current;
    if (raw === null) return;
    onChange(clampWon(Number(raw || 0)));
    draftRef.current = null;
    setDraft(null);
  };

  return (
    <div className="relative min-w-0 w-full">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={typeof max === "number" ? toWon(max) : undefined}
        step={WON_AMOUNT_STEP}
        autoComplete="off"
        aria-label={label}
        value={display}
        onFocus={(e) => {
          focusedRef.current = true;
          const next = String(won);
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
          if (e.key === "ArrowUp") {
            e.preventDefault();
            focusedRef.current = false;
            draftRef.current = null;
            setDraft(null);
            onChange(clampWon(won + WON_AMOUNT_STEP));
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            focusedRef.current = false;
            draftRef.current = null;
            setDraft(null);
            onChange(clampWon(won - WON_AMOUNT_STEP));
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (!focusedRef.current) {
            onChange(clampWon(Number(next || 0)));
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
            onChange(clampWon(nextNum));
            return;
          }
          draftRef.current = next;
          setDraft(next);
        }}
        className={cn(
          "h-8 w-full rounded-lg border-slate-200 bg-white px-1.5 pr-6 text-right text-[12px] font-semibold tabular-nums tracking-tight [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          remake && "border-amber-200/80 bg-amber-50/50",
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-slate-400">
        원
      </span>
    </div>
  );
}

function CompactRateInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const focusedRef = useRef(false);
  const rate = normalizeRate(value);
  const display = draft !== null ? draft : rate === 0 ? "" : String(rate);

  const commitDraft = () => {
    const raw = draftRef.current;
    if (raw === null) return;
    onChange(normalizeRate(raw || 0));
    draftRef.current = null;
    setDraft(null);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50/80 px-2.5 py-2">
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-600">
        전 항목
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg border-slate-200 bg-white text-slate-600"
          onClick={() => onChange(stepRate(rate, -1))}
          disabled={rate <= 0}
          aria-label={`${RATE_STEP}% 감소`}
        >
          <span className="text-sm font-semibold leading-none">−</span>
        </Button>
        <div className="relative w-[4.75rem]">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={RATE_STEP}
            autoComplete="off"
            aria-label="할인율"
            value={display}
            placeholder="0"
            onFocus={(e) => {
              focusedRef.current = true;
              const next = rate === 0 ? "" : String(rate);
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
              if (e.key === "ArrowUp") {
                e.preventDefault();
                focusedRef.current = false;
                draftRef.current = null;
                setDraft(null);
                onChange(stepRate(rate, 1));
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                focusedRef.current = false;
                draftRef.current = null;
                setDraft(null);
                onChange(stepRate(rate, -1));
              }
            }}
            onChange={(e) => {
              const next = e.target.value;
              if (!focusedRef.current) {
                onChange(normalizeRate(next || 0));
                return;
              }
              const prev = draftRef.current;
              const prevNum = normalizeRate(prev || 0);
              const nextNum = normalizeRate(next || 0);
              const spun =
                prev !== null &&
                next !== "" &&
                Math.abs(nextNum - prevNum) === RATE_STEP;
              if (spun) {
                draftRef.current = null;
                setDraft(null);
                onChange(nextNum);
                return;
              }
              draftRef.current = next;
              setDraft(next);
            }}
            className="h-8 rounded-lg border-slate-200 bg-white px-2 pr-7 text-center text-sm font-semibold tabular-nums tracking-tight [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] font-medium text-slate-400">
            %
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg border-slate-200 bg-white text-slate-600"
          onClick={() => onChange(stepRate(rate, 1))}
          disabled={rate >= 100}
          aria-label={`${RATE_STEP}% 증가`}
        >
          <span className="text-sm font-semibold leading-none">+</span>
        </Button>
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
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [itemPickerPracticeId, setItemPickerPracticeId] = useState<string | null>(
    null,
  );
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
    clearLegacySpecialSupplyCache();
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
      } else {
        setExpandedIds(new Set());
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
        // 아직 할인 미입력인 초안 치과·항목은 세션 메모리에 유지
        const savedIds = new Set(saved.map((row) => row.practiceAnchorId));
        const localById = new Map(
          nextRows.map((row) => [row.practiceAnchorId, row]),
        );
        const mergedSaved = saved.map((savedRow) => {
          const local = localById.get(savedRow.practiceAnchorId);
          if (!local || local.mode !== "amount") return savedRow;
          const savedItemIds = new Set(
            savedRow.items.map((item) => item.feeItemId),
          );
          const draftItems = local.items.filter(
            (item) =>
              !savedItemIds.has(item.feeItemId) &&
              toWon(item.discountAmount) <= 0 &&
              toWon(item.remakeDiscountAmount) <= 0,
          );
          return draftItems.length
            ? { ...savedRow, items: [...savedRow.items, ...draftItems] }
            : savedRow;
        });
        const drafts = nextRows.filter(
          (row) => !rowHasEffect(row) && !savedIds.has(row.practiceAnchorId),
        );
        const merged = [...mergedSaved, ...drafts];
        setRows(merged);
        savedSnapshotRef.current = snapshotRows(saved);
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
    if (!addPickerOpen) {
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
  }, [addPickerOpen, searchQ, token]);

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
    setAddPickerOpen(false);
    setSearchQ("");
    setSearchHits([]);
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

  const addPracticeFeeItem = (
    practiceAnchorId: string,
    feeItem: LabFeeItem,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.practiceAnchorId !== practiceAnchorId) return row;
        if (row.items.some((item) => item.feeItemId === feeItem.id)) return row;
        return {
          ...row,
          items: [
            ...row.items,
            {
              feeItemId: feeItem.id,
              feeItemName: feeItem.name,
              discountAmount: 0,
              remakeDiscountAmount: 0,
            },
          ],
        };
      }),
    );
    setItemPickerPracticeId(null);
  };

  const removePracticeFeeItem = (
    practiceAnchorId: string,
    feeItemId: string,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.practiceAnchorId === practiceAnchorId
          ? {
              ...row,
              items: row.items.filter((item) => item.feeItemId !== feeItemId),
            }
          : row,
      ),
    );
  };

  const patchPracticeItemDiscount = (
    practiceAnchorId: string,
    feeItemId: string,
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
        return {
          ...row,
          items: row.items.map((item) =>
            item.feeItemId === feeItemId
              ? {
                  ...item,
                  ...patch,
                  discountAmount: toWon(
                    patch.discountAmount ?? item.discountAmount,
                  ),
                  remakeDiscountAmount: toWon(
                    patch.remakeDiscountAmount ?? item.remakeDiscountAmount,
                  ),
                }
              : item,
          ),
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
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
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
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          치과별 할인율·할인금액. 미지정 항목은 기본 기공비.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const open = expandedIds.has(row.practiceAnchorId);
            const summary =
              row.mode === "rate"
                ? normalizeRate(row.discountRate) > 0
                  ? `${normalizeRate(row.discountRate)}%`
                  : "미설정"
                : row.items.length > 0
                  ? `${row.items.length}개 항목`
                  : "미설정";
            const addedFeeIds = new Set(row.items.map((item) => item.feeItemId));
            const availableFeeItems = namedFeeItems.filter(
              (fee) => !addedFeeIds.has(fee.id),
            );
            const itemPickerOpen = itemPickerPracticeId === row.practiceAnchorId;

            return (
              <Collapsible
                key={row.practiceAnchorId}
                open={open}
                onOpenChange={(next) =>
                  toggleExpanded(row.practiceAnchorId, next)
                }
              >
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm transition-all hover:border-primary-muted/70 hover:shadow-md">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-200/80">
                      <Building2 className="h-3.5 w-3.5 text-slate-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {row.practiceName || "치과"}
                          </p>
                          {row.practiceAddress ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {row.practiceAddress}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removePractice(row.practiceAnchorId)}
                          aria-label="치과 제거"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="mt-1 flex w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-left text-[11px] text-slate-600 transition-colors hover:bg-slate-50"
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

                  <CollapsibleContent className="mt-1.5 space-y-1.5 border-t border-slate-100 pt-1.5">
                    <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-slate-100/80 p-0.5">
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
                              "h-7 rounded-md text-[11px] font-medium transition-all",
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
                      <CompactRateInput
                        id={`ss-rate-${row.practiceAnchorId}`}
                        value={row.discountRate}
                        onChange={(discountRate) =>
                          patchPractice(row.practiceAnchorId, {
                            discountRate,
                          })
                        }
                      />
                    ) : (
                      <div className="space-y-1">
                        {!namedFeeItems.length ? (
                          <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                            기공비 탭에 항목을 먼저 추가하세요.
                          </p>
                        ) : (
                          <>
                            {row.items.length > 0 ? (
                              <>
                                <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem_1.5rem] items-center gap-1 px-0.5">
                                  <span className="text-[10px] font-medium text-slate-400">
                                    항목
                                  </span>
                                  <span className="text-center text-[10px] font-medium text-slate-400">
                                    할인가
                                  </span>
                                  <span className="text-center text-[10px] font-medium text-amber-700/80">
                                    리메이크
                                  </span>
                                  <span className="sr-only">제거</span>
                                </div>
                                <div className="divide-y divide-slate-100/80">
                                  {row.items.map((item) => {
                                    const fee = namedFeeItems.find(
                                      (f) => f.id === item.feeItemId,
                                    );
                                    const name =
                                      fee?.name ||
                                      item.feeItemName ||
                                      item.feeItemId;
                                    const base = fee
                                      ? feeBasePrice(fee)
                                      : null;
                                    const remakeBase = fee
                                      ? feeBaseRemake(fee)
                                      : null;
                                    const finalPrice =
                                      base !== null
                                        ? toFinalFromDiscount(
                                            base,
                                            item.discountAmount,
                                          )
                                        : toWon(item.discountAmount);
                                    const remakeFinal =
                                      remakeBase !== null
                                        ? toFinalFromDiscount(
                                            remakeBase,
                                            item.remakeDiscountAmount,
                                          )
                                        : toWon(item.remakeDiscountAmount);
                                    return (
                                      <div
                                        key={item.feeItemId}
                                        className="grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem_1.5rem] items-center gap-1 py-1"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-medium leading-tight text-slate-800 break-keep">
                                            {name}
                                          </p>
                                          {base !== null ? (
                                            <p className="text-[10px] tabular-nums leading-tight text-muted-foreground">
                                              기본 {formatWon(base)}
                                            </p>
                                          ) : null}
                                        </div>
                                        <CompactWonInput
                                          id={`ss-${row.practiceAnchorId}-${item.feeItemId}-amt`}
                                          label={`${name} 할인가`}
                                          value={finalPrice}
                                          max={base ?? undefined}
                                          onChange={(nextFinal) =>
                                            patchPracticeItemDiscount(
                                              row.practiceAnchorId,
                                              item.feeItemId,
                                              {
                                                discountAmount:
                                                  base !== null
                                                    ? toDiscountFromFinal(
                                                        base,
                                                        nextFinal,
                                                      )
                                                    : toWon(nextFinal),
                                              },
                                            )
                                          }
                                        />
                                        <CompactWonInput
                                          id={`ss-${row.practiceAnchorId}-${item.feeItemId}-remake`}
                                          label={`${name} 리메이크 할인가`}
                                          remake
                                          value={remakeFinal}
                                          max={remakeBase ?? undefined}
                                          onChange={(nextFinal) =>
                                            patchPracticeItemDiscount(
                                              row.practiceAnchorId,
                                              item.feeItemId,
                                              {
                                                remakeDiscountAmount:
                                                  remakeBase !== null
                                                    ? toDiscountFromFinal(
                                                        remakeBase,
                                                        nextFinal,
                                                      )
                                                    : toWon(nextFinal),
                                              },
                                            )
                                          }
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                                          onClick={() =>
                                            removePracticeFeeItem(
                                              row.practiceAnchorId,
                                              item.feeItemId,
                                            )
                                          }
                                          aria-label={`${name} 제거`}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : null}

                            {availableFeeItems.length > 0 ? (
                              <Popover
                                open={itemPickerOpen}
                                onOpenChange={(next) =>
                                  setItemPickerPracticeId(
                                    next ? row.practiceAnchorId : null,
                                  )
                                }
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={itemPickerOpen}
                                    className="h-8 w-full justify-between rounded-lg border-dashed text-[12px] font-medium text-slate-600"
                                  >
                                    <span className="flex items-center gap-1.5 truncate">
                                      <Plus className="h-3.5 w-3.5 shrink-0" />
                                      항목 추가
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-[var(--radix-popover-trigger-width)] min-w-[min(16rem,calc(100vw-2rem))] p-0"
                                  align="start"
                                >
                                  <Command>
                                    <CommandInput placeholder="기공비 항목 검색" />
                                    <CommandList>
                                      <CommandEmpty>
                                        추가할 항목이 없습니다.
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {availableFeeItems.map((fee) => {
                                          const base = feeBasePrice(fee);
                                          return (
                                            <CommandItem
                                              key={fee.id}
                                              value={`${fee.name} ${fee.id}`}
                                              onSelect={() =>
                                                addPracticeFeeItem(
                                                  row.practiceAnchorId,
                                                  fee,
                                                )
                                              }
                                            >
                                              <div className="min-w-0">
                                                <div className="truncate text-sm">
                                                  {fee.name}
                                                </div>
                                                <div className="truncate text-xs text-muted-foreground tabular-nums">
                                                  {formatWon(base)}
                                                </div>
                                              </div>
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            ) : row.items.length > 0 ? (
                              <p className="px-0.5 text-[10px] text-muted-foreground">
                                기공비 항목을 모두 추가했습니다.
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 p-3">
            <p className="text-[12px] font-medium text-slate-600">치과 추가</p>
            <Popover open={addPickerOpen} onOpenChange={setAddPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={addPickerOpen}
                  className="h-10 w-full justify-between rounded-xl bg-white/90 text-sm"
                >
                  <span className="truncate text-left text-muted-foreground">
                    치과 선택
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[min(20rem,calc(100vw-2rem))] p-0"
                align="start"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="치과명·대표자명 검색"
                    value={searchQ}
                    onValueChange={setSearchQ}
                  />
                  <CommandList>
                    {searching ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        검색 중…
                      </div>
                    ) : !searchQ.trim() ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        치과 이름을 입력하세요.
                      </div>
                    ) : searchHits.length === 0 ? (
                      <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {searchHits.map((hit) => {
                          const rep = String(hit.representativeName || "").trim();
                          const addr = String(hit.address || "").trim();
                          const meta = [rep ? `대표: ${rep}` : "", addr]
                            .filter(Boolean)
                            .join(" · ");
                          const searchValue = [hit.name, rep, addr, hit._id]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <CommandItem
                              key={hit._id}
                              value={searchValue}
                              onSelect={() => addPractice(hit)}
                              className="items-start py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {hit.name}
                                </div>
                                {meta ? (
                                  <div className="truncate text-xs text-muted-foreground">
                                    {meta}
                                  </div>
                                ) : null}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
