// related: AdminDashboardPage.tsx, admin.hexVerification.controller.js
// change-log:
// - 2026-09-03: BA/직원 collapse `??`/`||` 우선순위 수정 — pending 카드도 접힘
// - 2026-09-03: 스위치 옆 라벨을 확정/미정으로 동적 표시
// - 2026-09-03: 안내 문구 축약 · 사업자/이름/이메일/제조사 검색
// - 2026-09-03: 스위치 낙관적 반영 + 디바운스 저장 (토글마다 POST/목록 refetch 제거)
// - 2026-09-03: 0°/30°·확정 스위치 가로 배치
// - 2026-09-03: 제조사 카드 = 0°/30°·확정 스위치만 (STL/수정/되돌리기 제거)
// - 2026-09-03: 확정 후에도 applyHex30 스위치 변경 가능
// - 2026-09-03: 기공소BA 하위 임직원 들여쓰기 · 제조사 카드 3열
// - 2026-09-03: BA 카드 + 직원 collapse + 임플란트 제조사별 applyHex30/확정 UI
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type HexManufacturerRow = {
  manufacturer: string;
  applyHex30: boolean;
  verifiedHex?: string | null;
  status: "pending" | "confirmed";
  seedHex?: string;
  samplePending?: boolean;
  sampleRequestId?: string | null;
};

type HexEmployeeRow = {
  userId: string;
  name?: string | null;
  email?: string | null;
  subRole?: string | null;
  status: "pending" | "confirmed";
  pendingManufacturerCount?: number;
  manufacturers: HexManufacturerRow[];
};

type HexBusinessGroup = {
  businessAnchorId?: string | null;
  businessName?: string | null;
  employeeCount?: number;
  pendingUserCount?: number;
  status: "pending" | "confirmed";
  employees: HexEmployeeRow[];
};

type HexVerificationInProgressData = {
  pendingCount?: number;
  confirmedCount?: number;
  businessCount?: number;
  items?: HexBusinessGroup[];
};

type SwitchDraft = {
  applyHex30: boolean;
  confirmed: boolean;
};

type Props = {
  token: string | null | undefined;
  enabled?: boolean;
};

const HEX_SWITCH_DEBOUNCE_MS = 500;
const HEX_QUERY_KEY = ["admin-hex-verification-in-progress"] as const;

const choiceKey = (userId: string, manufacturer: string) =>
  `${userId}|${manufacturer}`;

const hexFromApply = (applyHex30: boolean) =>
  applyHex30 ? "헥스30도회전" : "STL모델대로";

const sameDraft = (a: SwitchDraft, b: SwitchDraft) =>
  a.applyHex30 === b.applyHex30 && a.confirmed === b.confirmed;

const draftFromRow = (row: HexManufacturerRow): SwitchDraft => ({
  applyHex30: Boolean(row.applyHex30),
  confirmed: row.status === "confirmed",
});

const hay = (value?: string | null) => String(value || "").toLowerCase();

const filterHexGroups = (
  groups: HexBusinessGroup[],
  rawQ: string,
): HexBusinessGroup[] => {
  const q = rawQ.trim().toLowerCase();
  if (!q) return groups;
  const hit = (value?: string | null) => hay(value).includes(q);
  return groups.flatMap((ba) => {
    const baHit = hit(ba.businessName);
    const employees = (ba.employees || []).flatMap((emp) => {
      const empHit = hit(emp.name) || hit(emp.email);
      if (baHit || empHit) return [emp];
      const manufacturers = (emp.manufacturers || []).filter((mfr) =>
        hit(mfr.manufacturer),
      );
      return manufacturers.length > 0 ? [{ ...emp, manufacturers }] : [];
    });
    return employees.length > 0 ? [{ ...ba, employees }] : [];
  });
};

const patchHexQueryData = (
  queryClient: QueryClient,
  userId: string,
  manufacturer: string,
  draft: SwitchDraft,
) => {
  queryClient.setQueryData(
    HEX_QUERY_KEY,
    (prev: ApiEnvelope<HexVerificationInProgressData> | undefined) => {
      if (!prev?.data) return prev;
      const items = (prev.data.items || []).map((ba) => {
        const employees = (ba.employees || []).map((emp) => {
          if (emp.userId !== userId) return emp;
          const manufacturers = (emp.manufacturers || []).map((mfr) => {
            if (mfr.manufacturer !== manufacturer) return mfr;
            return {
              ...mfr,
              applyHex30: draft.applyHex30,
              status: draft.confirmed ? ("confirmed" as const) : ("pending" as const),
              verifiedHex: draft.confirmed ? hexFromApply(draft.applyHex30) : null,
              seedHex: hexFromApply(draft.applyHex30),
            };
          });
          const pendingManufacturerCount = manufacturers.filter(
            (m) => m.status === "pending",
          ).length;
          return {
            ...emp,
            manufacturers,
            pendingManufacturerCount,
            status:
              pendingManufacturerCount > 0
                ? ("pending" as const)
                : ("confirmed" as const),
          };
        });
        const pendingUserCount = employees.filter(
          (e) => e.status === "pending",
        ).length;
        return {
          ...ba,
          employees,
          pendingUserCount,
          status:
            pendingUserCount > 0 ? ("pending" as const) : ("confirmed" as const),
        };
      });
      let pendingCount = 0;
      let confirmedCount = 0;
      for (const ba of items) {
        for (const emp of ba.employees || []) {
          for (const mfr of emp.manufacturers || []) {
            if (mfr.status === "pending") pendingCount += 1;
            else confirmedCount += 1;
          }
        }
      }
      return {
        ...prev,
        data: {
          ...prev.data,
          items,
          pendingCount,
          confirmedCount,
        },
      };
    },
  );
};

export function HexVerificationAdminPanel({ token, enabled = true }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedBa, setExpandedBa] = useState<Record<string, boolean>>({});
  const [expandedUser, setExpandedUser] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>(
    {},
  );
  const baselineRef = useRef<Record<string, SwitchDraft>>({});
  const latestRef = useRef<Record<string, SwitchDraft>>({});
  const metaRef = useRef<Record<string, { userId: string; manufacturer: string }>>(
    {},
  );

  const { data, isFetching } = useQuery({
    queryKey: HEX_QUERY_KEY,
    enabled: Boolean(token) && enabled,
    queryFn: async () => {
      const res = await apiFetch<ApiEnvelope<HexVerificationInProgressData>>({
        path: "/api/admin/hex-verification/in-progress",
        method: "GET",
        token: token || undefined,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message || "헥스 확인 목록 조회에 실패했습니다.",
        );
      }
      return res.data;
    },
  });

  const items = useMemo(
    () => (Array.isArray(data?.data?.items) ? data.data.items : []),
    [data],
  );
  const searching = Boolean(search.trim());
  const visibleItems = useMemo(
    () => filterHexGroups(items, search),
    [items, search],
  );
  const pendingCount = Number(data?.data?.pendingCount || 0);
  const confirmedCount = Number(data?.data?.confirmedCount || 0);

  const persistDraft = useCallback(
    async (
      userId: string,
      manufacturer: string,
      draft: SwitchDraft,
      baseline: SwitchDraft,
    ) => {
      const ck = choiceKey(userId, manufacturer);
      const hexRotation = hexFromApply(draft.applyHex30);
      const fail = (message?: string) => {
        throw new Error(message || "저장 실패");
      };
      try {
        if (draft.confirmed) {
          const res = await apiFetch<ApiEnvelope<unknown>>({
            path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/complete`,
            method: "POST",
            token: token || undefined,
            jsonBody: { hexRotation },
          });
          if (!res.ok || !res.data?.success) fail(res.data?.message);
          return;
        }
        if (baseline.confirmed) {
          const res = await apiFetch<ApiEnvelope<unknown>>({
            path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/revert`,
            method: "POST",
            token: token || undefined,
          });
          if (!res.ok || !res.data?.success) fail(res.data?.message);
        }
        if (draft.applyHex30 !== baseline.applyHex30) {
          const res = await apiFetch<ApiEnvelope<unknown>>({
            path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/apply-hex30`,
            method: "POST",
            token: token || undefined,
            jsonBody: { applyHex30: draft.applyHex30 },
          });
          if (!res.ok || !res.data?.success) fail(res.data?.message);
        }
      } catch (e: unknown) {
        if (!latestRef.current[ck]) {
          void queryClient.invalidateQueries({ queryKey: HEX_QUERY_KEY });
        }
        toast({
          title: "헥스 설정 저장 실패",
          description: e instanceof Error ? e.message : "다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [queryClient, toast, token],
  );

  const persistDraftRef = useRef(persistDraft);
  persistDraftRef.current = persistDraft;

  const flushKey = useCallback((key: string) => {
    const timer = timersRef.current[key];
    if (timer) clearTimeout(timer);
    timersRef.current[key] = null;
    const latest = latestRef.current[key];
    const baseline = baselineRef.current[key];
    const meta = metaRef.current[key];
    delete latestRef.current[key];
    delete baselineRef.current[key];
    delete metaRef.current[key];
    if (!latest || !baseline || !meta) return;
    if (sameDraft(latest, baseline)) return;
    void persistDraftRef.current(
      meta.userId,
      meta.manufacturer,
      latest,
      baseline,
    );
  }, []);

  const flushAll = useCallback(() => {
    for (const key of Object.keys(timersRef.current)) {
      if (timersRef.current[key] != null) flushKey(key);
    }
  }, [flushKey]);

  const scheduleSave = useCallback(
    (
      userId: string,
      manufacturer: string,
      displayed: SwitchDraft,
      next: Partial<SwitchDraft>,
    ) => {
      const key = choiceKey(userId, manufacturer);
      const draft: SwitchDraft = {
        ...(latestRef.current[key] ?? displayed),
        ...next,
      };
      latestRef.current[key] = draft;
      metaRef.current[key] = { userId, manufacturer };
      if (baselineRef.current[key] == null) {
        baselineRef.current[key] = displayed;
      }
      patchHexQueryData(queryClient, userId, manufacturer, draft);

      const existing = timersRef.current[key];
      if (existing) clearTimeout(existing);
      timersRef.current[key] = setTimeout(() => {
        flushKey(key);
      }, HEX_SWITCH_DEBOUNCE_MS);
    },
    [flushKey, queryClient],
  );

  useEffect(() => {
    if (enabled) return;
    flushAll();
    setSearch("");
  }, [enabled, flushAll]);

  useEffect(() => {
    return () => {
      flushAll();
    };
  }, [flushAll]);

  return (
    <div className="space-y-3 text-sm text-gray-700">
      <div className="text-xs text-muted-foreground">
        ExoCAD 3.0 이하 사용자 · 미확정 제조사 {pendingCount.toLocaleString()}건
        · 확정 {confirmedCount.toLocaleString()}건
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="사업자·이름·이메일·제조사 검색"
          className="h-8 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-muted"
        />
      </div>
      <div className="max-h-[60vh] overflow-auto pr-1 space-y-3">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
            {isFetching
              ? "불러오는 중…"
              : "ExoCAD 3.0 이하로 등록된 사용자가 없습니다."}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
            검색 결과가 없습니다.
          </div>
        ) : (
          visibleItems.map((ba) => {
            const baKey = String(ba.businessAnchorId || ba.businessName || "none");
            const many = (ba.employees?.length || 0) > 2;
            const baOpen =
              expandedBa[baKey] ??
              (searching || !many || ba.status === "pending");
            return (
              <div
                key={baKey}
                className="rounded-md border bg-white overflow-hidden"
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() =>
                    setExpandedBa((prev) => ({ ...prev, [baKey]: !baOpen }))
                  }
                >
                  {baOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {ba.businessName || "사업자명 미확인"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      직원 {(ba.employeeCount || 0).toLocaleString()}명 · 미확정
                      사용자 {(ba.pendingUserCount || 0).toLocaleString()}명
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      ba.status === "pending"
                        ? "text-[10px] border-amber-200 bg-amber-50 text-amber-700"
                        : "text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700"
                    }
                  >
                    {ba.status === "pending" ? "관리중" : "완료"}
                  </Badge>
                </button>
                {baOpen ? (
                  <div className="border-t divide-y pl-5">
                    {(ba.employees || []).map((emp) => {
                      const uKey = emp.userId;
                      const uOpen =
                        expandedUser[uKey] ??
                        (searching || emp.status === "pending");
                      return (
                        <div key={uKey} className="bg-slate-50/40">
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                            onClick={() =>
                              setExpandedUser((prev) => ({
                                ...prev,
                                [uKey]: !uOpen,
                              }))
                            }
                          >
                            {uOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate">
                                {emp.name || "-"}
                                {emp.subRole === "owner" ? " · 대표" : ""}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {emp.email || ""}
                                {emp.pendingManufacturerCount
                                  ? ` · 미확정 ${emp.pendingManufacturerCount}`
                                  : ""}
                              </div>
                            </div>
                          </button>
                          {uOpen ? (
                            <div className="pl-5 pr-3 pb-2 grid grid-cols-3 gap-1.5">
                              {(emp.manufacturers || []).map((mfr) => {
                                const displayed = draftFromRow(mfr);
                                return (
                                  <div
                                    key={mfr.manufacturer}
                                    className="rounded border bg-white px-2.5 py-2 space-y-1.5"
                                  >
                                    <div className="text-xs font-semibold truncate">
                                      {mfr.manufacturer}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground w-5 shrink-0">
                                          0°
                                        </span>
                                        <Switch
                                          checked={displayed.applyHex30}
                                          onCheckedChange={(checked) =>
                                            scheduleSave(
                                              emp.userId,
                                              mfr.manufacturer,
                                              displayed,
                                              { applyHex30: Boolean(checked) },
                                            )
                                          }
                                        />
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                          30°
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className={
                                            displayed.confirmed
                                              ? "text-[10px] font-semibold text-emerald-700 shrink-0"
                                              : "text-[10px] font-semibold text-amber-700 shrink-0"
                                          }
                                        >
                                          {displayed.confirmed ? "확정" : "미정"}
                                        </span>
                                        <Switch
                                          checked={displayed.confirmed}
                                          onCheckedChange={(checked) =>
                                            scheduleSave(
                                              emp.userId,
                                              mfr.manufacturer,
                                              displayed,
                                              { confirmed: Boolean(checked) },
                                            )
                                          }
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function useHexVerificationSummary(
  token: string | null | undefined,
  enabled = true,
) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: HEX_QUERY_KEY,
    enabled: Boolean(token) && enabled,
    queryFn: async () => {
      const res = await apiFetch<ApiEnvelope<HexVerificationInProgressData>>({
        path: "/api/admin/hex-verification/in-progress",
        method: "GET",
        token: token || undefined,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message || "헥스 확인 목록 조회에 실패했습니다.",
        );
      }
      return res.data;
    },
  });

  const items = Array.isArray(data?.data?.items) ? data.data.items : [];
  const pendingBusinesses = items.filter((i) => i.status === "pending");
  return {
    pendingCount: Number(data?.data?.pendingCount || 0),
    confirmedCount: Number(data?.data?.confirmedCount || 0),
    pendingBusinesses,
    loading: isFetching,
    refetch,
  };
}
