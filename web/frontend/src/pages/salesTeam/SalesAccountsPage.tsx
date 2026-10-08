// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/salesTeam/SalesPlaceSuggestInput.tsx
// - web/frontend/src/pages/salesTeam/SalesPlacePickerDrawer.tsx
// - web/frontend/src/shared/sales/CustomerPriceDialog.tsx
// change-log:
// - 2026-10-09: 상단 판매가 카드 제거. 소개 거래처를 목록 위에 두고, 선택 카드에서 가격을 입력한다.
// - 2026-10-08: 소개 거래처 판매가(1.2~1.5만)를 이 페이지에서 정한다.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Phone, Search, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
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
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  SalesListRow,
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

type ListFilter = "all" | "practice" | "lab" | "unjoined" | "joined" | "oralScan";
type AccountSort = "referred" | "name" | "recent";

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
  if (filter === "oralScan" && (kind !== "practice" || !row.usesOralScan)) {
    return false;
  }
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
  const next = [...items];
  next.sort((a, b) => {
    if (sort === "referred") {
      const rank =
        Number(Boolean(b.referredByMe)) - Number(Boolean(a.referredByMe));
      if (rank) return rank;
    } else if (sort === "recent") {
      const at = Date.parse(a.updatedAt || "") || 0;
      const bt = Date.parse(b.updatedAt || "") || 0;
      if (bt !== at) return bt - at;
    }
    return a.name.localeCompare(b.name, "ko");
  });
  return next;
}

function listParams(filter: ListFilter) {
  if (filter === "oralScan") {
    return { usesOralScan: true as const };
  }
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

export default function SalesAccountsPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [accountSort, setAccountSort] = useState<AccountSort>("referred");
  const [editing, setEditing] = useState<Partial<SalesAccount> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [placePickerSeed, setPlacePickerSeed] =
    useState<Partial<SalesPlaceSuggest> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

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
    mutationFn: async () => {
      if (!editing?.name || !editing?.kind) {
        throw new Error("이름과 유형은 필수입니다.");
      }
      const inferred = inferPlaceKindFromName(editing.name);
      const kind =
        manualEntry || editing.address || editing.lat != null
          ? editing.kind
          : inferred || editing.kind;
      const payload = { ...editing, kind };
      if (editing._id) {
        return salesTeamApi.updateAccount(token, editing._id, payload);
      }
      return salesTeamApi.createAccount(token, payload);
    },
    onSuccess: (saved) => {
      toast({ title: "저장되었습니다." });
      setEditing(null);
      setShowExtra(false);
      setManualEntry(false);
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
    return sortAccounts([...accounts, ...referrals], accountSort);
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
  };

  const listPanel = (
    <SalesPanel
      title="목록"
      description={`${items.length}곳 · 치과 ${practiceCount} · 기공소 ${labCount}`}
      bodyClassName="lg:max-h-[min(74vh,48rem)] lg:overflow-y-auto"
    >
      {priceLoadError ? (
        <p className="mb-2 text-sm text-destructive">{priceLoadError}</p>
      ) : null}
      {isLoading && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
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
            <SalesListRow
              key={item._id}
              selected={selectedId === item._id}
              onClick={() =>
                setSelectedId((prev) => (prev === item._id ? null : item._id))
              }
              title={item.name}
              meta={
                [item.representativeName, item.phone]
                  .filter(Boolean)
                  .join(" · ") || "연락처 없음"
              }
              trailing={
                <div className="flex max-w-[48%] flex-wrap items-center justify-end gap-1 sm:max-w-none">
                  {item.referredByMe ? (
                    <Badge className="border-0 bg-emerald-50 text-emerald-800">
                      소개
                    </Badge>
                  ) : null}
                  {!hasCoords(item) ? (
                    <Badge variant="outline" className="text-amber-700">
                      좌표없음
                    </Badge>
                  ) : null}
                  {item.usesOralScan ? (
                    <Badge className="border-0 bg-sky-50 text-sky-800">
                      구강스캔
                    </Badge>
                  ) : null}
                  {item.businessAnchorId ? (
                    <Badge>가입</Badge>
                  ) : (
                    <Badge variant="outline">미가입</Badge>
                  )}
                  <Badge variant="secondary">
                    {KIND_LABEL[item.kind] || item.kind}
                  </Badge>
                </div>
              }
            />
          ))}
        </div>
      )}
    </SalesPanel>
  );

  const detailPanel = viewing ? (
      <SalesPanel
        title={viewing.name}
        description={[
          viewing.referredByMe ? "소개" : null,
          KIND_LABEL[viewing.kind] || viewing.kind,
          viewing.businessAnchorId ? "플랫폼 가입" : "플랫폼 미가입",
          viewing.usesOralScan ? "구강스캔" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          viewing.referralOnly ? undefined : (
            <div className="flex gap-1">
              {!hasCoords(viewing) ? (
                <Button
                  size="sm"
                  variant="outline"
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
                  위치
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowExtra(true);
                  setManualEntry(false);
                  setEditing(viewing);
                }}
              >
                수정
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                삭제
              </Button>
            </div>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <div className="text-xs text-muted-foreground">대표</div>
              <div>{viewing.representativeName || "—"}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <Phone className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <div className="text-xs text-muted-foreground">전화</div>
              <div>{viewing.phone || "—"}</div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:col-span-2">
            <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">주소</div>
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
                <p className="mt-1 text-xs text-amber-700">좌표 없음</p>
              ) : null}
            </div>
          </div>
        </div>
        {viewing.memo ? (
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-white p-3 text-sm text-slate-700">
            {viewing.memo}
          </div>
        ) : null}
        {priceRow ? (
          <div className="mt-3 rounded-xl border border-slate-200/80 px-3 py-3 shadow-sm">
            <CustomerPriceFields row={priceRow} onSaved={patchPrice} />
          </div>
        ) : null}
        {!viewing.businessAnchorId ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            플랫폼 미가입이면 판매·세금계산서가 불가합니다.
            <br />
            성과의 소개 코드로 가입을 유도하세요.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground lg:hidden">
          플랫폼 가입 {joinedCount}곳 · 미가입 {unjoinedCount}곳
        </p>
      </SalesPanel>
    ) : undefined;

  return (
    <SalesPageShell wide>
      <SalesToolbar className="w-full">
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="이름 · 대표 · 전화"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 pl-8"
            />
          </div>
          <Select
            value={accountSort}
            onValueChange={(v) => setAccountSort(v as AccountSort)}
          >
            <SelectTrigger className="h-8 w-[8.25rem] shrink-0" aria-label="정렬">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="referred">소개 우선</SelectItem>
              <SelectItem value="name">이름순</SelectItem>
              <SelectItem value="recent">최근 수정</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={listFilter}
            onValueChange={(v) => setListFilter(v as ListFilter)}
          >
            <SelectTrigger className="h-8 w-[7.5rem] shrink-0">
              <SelectValue placeholder="필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="practice">치과</SelectItem>
              <SelectItem value="lab">기공소</SelectItem>
              <SelectItem value="oralScan">구강스캔</SelectItem>
              <SelectItem value="unjoined">미가입</SelectItem>
              <SelectItem value="joined">가입</SelectItem>
            </SelectContent>
          </Select>
          <div className="shrink-0">
            <Button size="sm" className="h-8" onClick={openCreate}>
              거래처 추가
            </Button>
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
            description="목록에서 항목을 누르면 연락처와 판매가가 여기에 표시됩니다."
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
                    setManualEntry(false);
                    setEditing((prev) => ({
                      ...prev,
                      name,
                      ...(prev?._id ? {} : { accountId: undefined }),
                    }));
                  }}
                  onPick={applySuggest}
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
                <Button
                  variant="outline"
                  onClick={closeForm}
                  disabled={saveMut.isPending}
                >
                  취소
                </Button>
                <Button
                  disabled={
                    !(editing.name || "").trim() ||
                    !editing.kind ||
                    saveMut.isPending
                  }
                  onClick={() => saveMut.mutate()}
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
