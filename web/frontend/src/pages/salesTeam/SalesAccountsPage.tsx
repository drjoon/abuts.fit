// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/salesTeam/SalesPlaceSuggestInput.tsx
// - web/frontend/src/pages/salesTeam/SalesPlacePickerDrawer.tsx
// - web/frontend/src/shared/sales/CustomerPriceDialog.tsx
// change-log:
// - 2026-10-09: 목록 정렬 기본값 — 소개 내림차순(소개 거래처가 위).
// - 2026-10-09: 목록 정렬을 버튼으로. 클릭마다 끄기·오름차순·내림차순.
// - 2026-10-09: 정렬(소개 우선·이름순·최근 수정)을 목록 카드 헤더로 옮김.
// - 2026-10-09: 목록 필터 — 구강스캔 대신 소개. 전체·소개·치과·기공소·미가입·가입.
// - 2026-10-09: 거래처 목록·상세를 모노그램 행과 필터 칩으로 정리.
// - 2026-10-09: 상단 판매가 카드 제거. 소개 거래처를 목록 위에 두고, 선택 카드에서 가격을 입력한다.
// - 2026-10-08: 소개 거래처 판매가(1.2~1.5만)를 이 페이지에서 정한다.
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SalesPlaceSuggestInput from "./SalesPlaceSuggestInput";
import SalesPlacePickerDrawer from "./SalesPlacePickerDrawer";
import {
  KIND_LABEL,
  inferPlaceKindFromName,
  salesTeamApi,
  type SalesAccount,
  type SalesPlaceSuggest,
} from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesPageShell,
  SalesPanel,
  SalesSplit,
  SalesToolbar,
} from "./salesUi";
import {
  CustomerPriceFields,
  useCustomerPrices,
  type CustomerPriceRow,
} from "@/shared/sales/CustomerPriceDialog";

type ListFilter = "all" | "referred" | "practice" | "lab" | "unjoined" | "joined";
type AccountSortKey = "referred" | "name" | "recent";
type SortDir = "asc" | "desc";
type AccountSort = { key: AccountSortKey; dir: SortDir } | null;

const SORT_BUTTONS: Array<{ key: AccountSortKey; label: string }> = [
  { key: "referred", label: "소개" },
  { key: "name", label: "이름" },
  { key: "recent", label: "최근" },
];

function cycleAccountSort(prev: AccountSort, key: AccountSortKey): AccountSort {
  if (!prev || prev.key !== key) return { key, dir: "asc" };
  if (prev.dir === "asc") return { key, dir: "desc" };
  return null;
}

function sortDirLabel(dir: SortDir | null) {
  if (dir === "asc") return "오름차순";
  if (dir === "desc") return "내림차순";
  return "정렬 없음";
}

type AccountListItem = SalesAccount & {
  referredByMe?: boolean;
  referralOnly?: boolean;
};

function referralListId(anchorId: string) {
  return `ref:${anchorId}`;
}

function referralMatchesFilter(
  row: CustomerPriceRow,
  filter: ListFilter,
  q: string,
) {
  const kind = row.requestorKind === "lab" ? "lab" : "practice";
  if (filter === "unjoined") return false;
  if (filter === "practice" && kind !== "practice") return false;
  if (filter === "lab" && kind !== "lab") return false;
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hay = [row.name, row.representativeName, row.phone]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

function toReferralListItem(row: CustomerPriceRow): AccountListItem {
  const kind = row.requestorKind === "lab" ? "lab" : "practice";
  return {
    _id: referralListId(row.anchorId),
    kind,
    name: row.name || "이름 없음",
    representativeName: row.representativeName || "",
    phone: row.phone || "",
    address: row.address || "",
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    businessAnchorId: row.anchorId,
    usesOralScan: Boolean(row.usesOralScan),
    updatedAt: row.updatedAt || undefined,
    referredByMe: true,
    referralOnly: true,
    teamVisible: true,
  };
}

function sortAccounts(items: AccountListItem[], sort: AccountSort) {
  if (!sort) return items;
  const dir = sort.dir === "asc" ? 1 : -1;
  const next = [...items];
  next.sort((a, b) => {
    let cmp = 0;
    if (sort.key === "referred") {
      cmp = Number(Boolean(a.referredByMe)) - Number(Boolean(b.referredByMe));
    } else if (sort.key === "recent") {
      const at = Date.parse(a.updatedAt || "") || 0;
      const bt = Date.parse(b.updatedAt || "") || 0;
      cmp = at - bt;
    } else {
      cmp = a.name.localeCompare(b.name, "ko");
    }
    if (cmp) return cmp * dir;
    return a.name.localeCompare(b.name, "ko");
  });
  return next;
}

function listParams(filter: ListFilter) {
  if (filter === "practice" || filter === "lab") {
    return { kind: filter };
  }
  if (filter === "unjoined" || filter === "joined") {
    return { join: filter };
  }
  return {};
}

function hasCoords(a: { lat?: number | null; lng?: number | null } | null) {
  return (
    a != null &&
    a.lat != null &&
    a.lng != null &&
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lng)
  );
}

const LIST_FILTERS: Array<{ value: ListFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "referred", label: "소개" },
  { value: "practice", label: "치과" },
  { value: "lab", label: "기공소" },
  { value: "unjoined", label: "미가입" },
  { value: "joined", label: "가입" },
];

function KindMark({ kind, className }: { kind: string; className?: string }) {
  const lab = kind === "lab";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
        lab ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700",
        className,
      )}
    >
      {lab ? "기" : "치"}
    </span>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "join" | "idle" | "refer" | "scan" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        tone === "join" && "bg-primary/10 text-primary-strong",
        tone === "idle" && "bg-slate-100 text-slate-500",
        tone === "refer" && "bg-emerald-50 text-emerald-700",
        tone === "scan" && "bg-sky-50 text-sky-700",
        tone === "warn" && "bg-amber-50 text-amber-700",
      )}
    >
      {children}
    </span>
  );
}

function AccountRow({
  item,
  selected,
  onClick,
}: {
  item: AccountListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const meta =
    [item.representativeName, item.phone].filter(Boolean).join(" · ") ||
    "연락처 없음";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/30 bg-primary-soft shadow-sm"
          : "border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-50/80",
      )}
    >
      <KindMark kind={item.kind} className="h-10 w-10" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-900">
            {item.name}
          </span>
          {item.referredByMe ? <StatusPill tone="refer">소개</StatusPill> : null}
          {item.usesOralScan ? (
            <StatusPill tone="scan">구강스캔</StatusPill>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {meta}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill tone={item.businessAnchorId ? "join" : "idle"}>
          {item.businessAnchorId ? "가입" : "미가입"}
        </StatusPill>
        {!hasCoords(item) ? (
          <StatusPill tone="warn">좌표 없음</StatusPill>
        ) : null}
      </span>
    </button>
  );
}

function AccountListSkeleton() {
  return (
    <div className="space-y-2 px-0.5 py-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5"
        >
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactFact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[11px] font-medium text-slate-400">{label}</div>
        <div className="mt-0.5 text-sm text-slate-800">{children}</div>
      </div>
    </div>
  );
}

export default function SalesAccountsPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [accountSort, setAccountSort] = useState<AccountSort>({
    key: "referred",
    dir: "desc",
  });
  const [editing, setEditing] = useState<Partial<SalesAccount> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [placePickerSeed, setPlacePickerSeed] =
    useState<Partial<SalesPlaceSuggest> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [askKind, setAskKind] = useState(false);

  const filterParams = listParams(listFilter);
  const queryKey = useMemo(
    () => ["sales-team-accounts", q, listFilter] as const,
    [q, listFilter],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () =>
      salesTeamApi.listAccounts(token, {
        q: q || undefined,
        ...filterParams,
      }),
  });

  const {
    rows: priceRows,
    loadError: priceLoadError,
    patch: patchPrice,
  } = useCustomerPrices(true);

  const accountDetailId =
    selectedId && !selectedId.startsWith("ref:") ? selectedId : null;

  const { data: detail } = useQuery({
    queryKey: ["sales-team-account", accountDetailId],
    enabled: Boolean(token && accountDetailId),
    queryFn: () => salesTeamApi.getAccount(token, accountDetailId!),
  });

  const saveMut = useMutation({
    mutationFn: async (override?: Partial<SalesAccount>) => {
      const row = { ...editing, ...override };
      const name = String(row.name || "").trim();
      const inferred = inferPlaceKindFromName(name);
      const kind =
        row.kind === "lab" || row.kind === "practice"
          ? row.kind
          : inferred || "practice";
      if (!name) {
        throw new Error("이름과 유형은 필수입니다.");
      }
      const payload = { ...row, name, kind };
      if (row._id) {
        return salesTeamApi.updateAccount(token, row._id, payload);
      }
      return salesTeamApi.createAccount(token, payload);
    },
    onSuccess: (saved) => {
      toast({ title: "저장되었습니다." });
      setEditing(null);
      setShowExtra(false);
      setManualEntry(false);
      setAskKind(false);
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
      if (saved?._id) {
        setSelectedId(saved._id);
        void qc.invalidateQueries({
          queryKey: ["sales-team-account", saved._id],
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => salesTeamApi.deleteAccount(token, id),
    onSuccess: () => {
      toast({ title: "삭제되었습니다." });
      setDeleteConfirmOpen(false);
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-accounts"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const applyPlace = (item: SalesPlaceSuggest) => {
    setEditing((prev) => ({
      ...prev,
      _id: item.accountId || prev?._id,
      kind: item.kind || prev?.kind || "practice",
      name: item.name,
      representativeName:
        item.representativeName || prev?.representativeName || "",
      phone: item.phone || prev?.phone || "",
      address: item.address || prev?.address || "",
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      businessAnchorId:
        item.businessAnchorId || prev?.businessAnchorId || null,
      teamVisible: prev?.teamVisible !== false,
    }));
    if (item.representativeName || item.phone) setShowExtra(true);
  };

  const openPlacePicker = (seed?: Partial<SalesPlaceSuggest> | null) => {
    setPlacePickerSeed(seed || null);
    setPlacePickerOpen(true);
  };

  const applySuggest = (item: SalesPlaceSuggest) => {
    if (item.source === "manual") {
      setManualEntry(true);
      applyPlace(item);
      return;
    }
    setManualEntry(false);
    if (
      item.businessAnchorId ||
      item.source === "platform" ||
      !hasCoords(item)
    ) {
      openPlacePicker(item);
      return;
    }
    applyPlace(item);
  };

  const items = useMemo(() => {
    const accounts: AccountListItem[] = (data?.items || []).map((item) => ({
      ...item,
      referredByMe: Boolean(
        item.businessAnchorId &&
          priceRows?.some((row) => row.anchorId === item.businessAnchorId),
      ),
    }));
    const linked = new Set(
      accounts
        .map((item) => String(item.businessAnchorId || ""))
        .filter(Boolean),
    );
    const referrals = (priceRows || [])
      .filter(
        (row) =>
          !linked.has(row.anchorId) &&
          referralMatchesFilter(row, listFilter, q),
      )
      .map(toReferralListItem);
    const merged = sortAccounts([...accounts, ...referrals], accountSort);
    if (listFilter === "referred") {
      return merged.filter((item) => item.referredByMe);
    }
    return merged;
  }, [accountSort, data?.items, listFilter, priceRows, q]);
  const practiceCount = items.filter((i) => i.kind === "practice").length;
  const labCount = items.filter((i) => i.kind === "lab").length;
  const joinedCount = items.filter((i) => i.businessAnchorId).length;
  const unjoinedCount = items.length - joinedCount;
  const selectedItem = items.find((item) => item._id === selectedId) ?? null;
  const viewing: AccountListItem | null = selectedItem?.referralOnly
    ? selectedItem
    : detail && detail._id === selectedId
      ? { ...detail, referredByMe: selectedItem?.referredByMe }
      : selectedItem && !selectedItem.referralOnly
        ? selectedItem
        : null;
  const priceRow = viewing?.businessAnchorId
    ? (priceRows?.find((row) => row.anchorId === viewing.businessAnchorId) ??
      null)
    : null;

  const openCreate = () => {
    setShowExtra(false);
    setManualEntry(false);
    setAskKind(false);
    setEditing({
      kind: "practice",
      name: "",
      teamVisible: true,
    });
  };

  const closeForm = () => {
    setEditing(null);
    setShowExtra(false);
    setManualEntry(false);
    setAskKind(false);
  };

  const listPanel = (
    <SalesPanel
      title="목록"
      description={`${items.length}곳 · 치과 ${practiceCount} · 기공소 ${labCount}`}
      actions={
        <div className="flex gap-1" role="group" aria-label="정렬">
          {SORT_BUTTONS.map((opt) => {
            const dir = accountSort?.key === opt.key ? accountSort.dir : null;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={dir != null}
                aria-label={`${opt.label}, ${sortDirLabel(dir)}`}
                onClick={() =>
                  setAccountSort((prev) => cycleAccountSort(prev, opt.key))
                }
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                  dir
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/80 hover:text-slate-900",
                )}
              >
                {opt.label}
                {dir === "asc" ? (
                  <ArrowUp className="h-3 w-3" aria-hidden />
                ) : dir === "desc" ? (
                  <ArrowDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      }
      bodyClassName="lg:max-h-[min(74vh,48rem)] lg:overflow-y-auto"
    >
      {priceLoadError ? (
        <p className="mb-2 text-sm text-destructive">{priceLoadError}</p>
      ) : null}
      {isLoading ? (
        <AccountListSkeleton />
      ) : items.length === 0 ? (
        <SalesEmptyState
          icon={Building2}
          title="등록된 거래처가 없습니다"
          description="상호 몇 글자만 검색해 저장하면 일정·동선에 바로 쓸 수 있습니다."
          actionLabel="첫 거래처 추가"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-2 px-0.5 py-0.5">
          {items.map((item) => (
            <AccountRow
              key={item._id}
              item={item}
              selected={selectedId === item._id}
              onClick={() =>
                setSelectedId((prev) => (prev === item._id ? null : item._id))
              }
            />
          ))}
        </div>
      )}
    </SalesPanel>
  );

  const detailPanel = viewing ? (
      <SalesPanel className="overflow-hidden" bodyClassName="p-0">
        <div className="pb-4">
          <div className="flex items-start gap-3 px-4 py-4">
            <KindMark kind={viewing.kind} className="h-12 w-12 text-base" />
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                {viewing.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {[
                  viewing.referredByMe ? "소개" : null,
                  KIND_LABEL[viewing.kind] || viewing.kind,
                  viewing.businessAnchorId ? "플랫폼 가입" : "플랫폼 미가입",
                  viewing.usesOralScan ? "구강스캔" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {viewing.referralOnly ? null : (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {!hasCoords(viewing) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    onClick={() => {
                      setShowExtra(true);
                      setManualEntry(false);
                      setEditing(viewing);
                      openPlacePicker({
                        name: viewing.name,
                        address: viewing.address || "",
                        kind: viewing.kind,
                        businessAnchorId: viewing.businessAnchorId || null,
                        accountId: viewing._id,
                        source: viewing.businessAnchorId ? "platform" : "kakao",
                      });
                    }}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    위치
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg"
                  onClick={() => {
                    setShowExtra(true);
                    setManualEntry(false);
                    setEditing(viewing);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  수정
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </Button>
              </div>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            <ContactFact icon={UserRound} label="대표">
              {viewing.representativeName || "—"}
            </ContactFact>
            <ContactFact icon={Phone} label="전화">
              {viewing.phone ? (
                <a
                  className="text-slate-800 hover:text-primary"
                  href={`tel:${viewing.phone}`}
                >
                  {viewing.phone}
                </a>
              ) : (
                "—"
              )}
            </ContactFact>
            <ContactFact icon={MapPin} label="주소">
              {viewing.address ? (
                <a
                  className="text-primary underline-offset-2 hover:underline"
                  href={`https://map.kakao.com/?q=${encodeURIComponent(viewing.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {viewing.address}
                </a>
              ) : (
                "—"
              )}
              {!hasCoords(viewing) ? (
                <p className="mt-1 text-xs font-medium text-amber-700">
                  좌표 없음
                </p>
              ) : null}
            </ContactFact>
          </div>
          {viewing.memo ? (
            <div className="mx-4 mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              {viewing.memo}
            </div>
          ) : null}
          {priceRow ? (
            <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-primary-soft to-white p-4 ring-1 ring-primary-muted/80">
              <CustomerPriceFields row={priceRow} onSaved={patchPrice} />
            </div>
          ) : null}
          {!viewing.businessAnchorId ? (
            <p className="mx-4 mt-3 text-xs leading-relaxed text-slate-500">
              플랫폼 미가입이면 판매·세금계산서가 불가합니다.
              <br />
              성과의 소개 코드로 가입을 유도하세요.
            </p>
          ) : null}
          <p className="mx-4 mt-3 text-xs text-muted-foreground lg:hidden">
            플랫폼 가입 {joinedCount}곳 · 미가입 {unjoinedCount}곳
          </p>
        </div>
      </SalesPanel>
    ) : undefined;

  return (
    <SalesPageShell wide>
      <SalesToolbar className="w-full">
        <div className="flex w-full flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="이름 · 대표 · 전화"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-9 rounded-xl border-slate-200/80 bg-white pl-9 shadow-sm"
              />
            </div>
            <Button
              size="sm"
              className="h-9 shrink-0 rounded-xl px-3.5 shadow-sm"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              거래처 추가
            </Button>
          </div>
          <div
            className="flex gap-1.5 overflow-x-auto px-0.5 py-0.5"
            role="tablist"
            aria-label="거래처 필터"
          >
            {LIST_FILTERS.map((opt) => {
              const active = listFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setListFilter(opt.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200/80 hover:text-slate-900",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </SalesToolbar>

      <SalesSplit
        primary={listPanel}
        secondary={detailPanel}
        secondaryEmpty={
          <SalesEmptyState
            className="h-full min-h-[20rem]"
            icon={Building2}
            title="거래처를 선택하세요"
            description={
              <>
                목록에서 항목을 누르면
                <br />
                연락처와 판매가가 표시됩니다.
              </>
            }
          />
        }
      />

      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open && !saveMut.isPending) closeForm();
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,38rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl"
          closeClassName="z-50 right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background opacity-100 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
          closeIconClassName="h-5 w-5"
        >
          <DialogHeader className="relative z-0 shrink-0 space-y-1 border-b border-slate-100 bg-background px-4 py-3.5 pr-14 text-left sm:px-5 sm:pr-14">
            <DialogTitle>
              {editing?._id ? "거래처 수정" : "거래처 추가"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              상호를 검색해 고른 뒤 저장하세요.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <>
              <div className="relative z-0 min-h-0 space-y-3 overflow-y-auto px-4 py-3.5 sm:px-5">
                <SalesPlaceSuggestInput
                  className="min-w-0"
                  inputClassName="h-10 rounded-xl"
                  listMode="inline"
                  listClassName="max-h-[16rem] overflow-y-auto"
                  maxItems={24}
                  hideRegisteredAccounts
                  value={editing.name || ""}
                  onChange={(name) => {
                    if (!name.trim()) setAskKind(false);
                    setManualEntry(false);
                    setEditing((prev) => ({
                      ...prev,
                      name,
                      ...(prev?._id ? {} : { accountId: undefined }),
                    }));
                  }}
                  onPick={applySuggest}
                  onDirectCommit={(item) => {
                    setAskKind(false);
                    saveMut.mutate({
                      name: item.name,
                      kind: item.kind,
                      representativeName: editing.representativeName || "",
                      memo: editing.memo || "",
                      teamVisible: editing.teamVisible !== false,
                      ...(editing._id
                        ? { _id: editing._id }
                        : {
                            address: "",
                            phone: "",
                            lat: null,
                            lng: null,
                            businessAnchorId: null,
                          }),
                    });
                  }}
                  onRequireKind={
                    editing._id ? undefined : () => setAskKind(true)
                  }
                  kindPrompt={askKind}
                  directKind={editing.kind === "lab" ? "lab" : "practice"}
                  directCommitDisabled={saveMut.isPending}
                  placeholder="지역명 상호 · 예: 거제 서울미소"
                  autoFocus={!editing._id}
                />
                {manualEntry && editing.kind ? (
                  <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                    <span className="font-medium text-slate-900">
                      {KIND_LABEL[editing.kind] || editing.kind}
                      {" · "}
                      직접 입력
                    </span>
                  </p>
                ) : editing.address || editing.phone ? (
                  <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                    <span className="font-medium text-slate-900">
                      {editing.address?.trim() || "주소 없음"}
                    </span>
                    {editing.phone ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {editing.phone}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {showExtra ? (
                  <div className="grid gap-2.5">
                    <Input
                      className="h-10 rounded-xl"
                      placeholder="대표자명"
                      value={editing.representativeName || ""}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          representativeName: e.target.value,
                        }))
                      }
                    />
                    <Textarea
                      className="rounded-xl"
                      placeholder="특이사항 · 방문 팁"
                      value={editing.memo || ""}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          memo: e.target.value,
                        }))
                      }
                      rows={2}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-left text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setShowExtra(true)}
                  >
                    대표 · 메모 추가
                  </button>
                )}
              </div>
              <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-background px-4 py-3 sm:space-x-0 sm:px-5">
                {askKind ? (
                  <p className="mr-auto self-center text-xs font-medium text-amber-800">
                    유형을 선택하세요.
                  </p>
                ) : null}
                <Button
                  variant="outline"
                  onClick={closeForm}
                  disabled={saveMut.isPending}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  disabled={!(editing.name || "").trim() || saveMut.isPending}
                  onClick={() => {
                    if (!editing._id) {
                      setAskKind(true);
                      return;
                    }
                    saveMut.mutate({
                      name: editing.name,
                      kind: editing.kind,
                    });
                  }}
                >
                  {saveMut.isPending ? "저장 중…" : "저장"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <SalesPlacePickerDrawer
        open={placePickerOpen}
        onOpenChange={setPlacePickerOpen}
        initialQuery={placePickerSeed?.name || editing?.name || ""}
        seed={placePickerSeed}
        hideRegisteredAccounts
        allowDirectEntry
        onConfirm={(place) => {
          setManualEntry(place.source === "manual");
          applyPlace({
            ...place,
            accountId: place.accountId || editing?._id || null,
          });
          if (!editing) {
            setEditing({
              kind: place.kind || "practice",
              name: place.name,
              teamVisible: true,
              address: place.address,
              lat: place.lat,
              lng: place.lng,
              phone: place.phone,
              businessAnchorId: place.businessAnchorId,
              _id: place.accountId || undefined,
            });
          }
        }}
      />

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) {
            setDeleteConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>이 거래처를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {viewing?.name
                ? `「${viewing.name}」 거래처를 삭제합니다. 되돌릴 수 없습니다.`
                : "선택한 거래처를 삭제합니다. 되돌릴 수 없습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={deleteMut.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !viewing?._id || viewing.referralOnly || deleteMut.isPending
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!viewing?._id || viewing.referralOnly) return;
                deleteMut.mutate(viewing._id);
              }}
            >
              {deleteMut.isPending ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SalesPageShell>
  );
}
