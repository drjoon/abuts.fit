// related: AdminDashboardPage.tsx, admin.hexVerification.controller.js
// change-log:
// - 2026-10-13: 공통 적용은 ExoCAD 3.0 이하 직원에게 제조사별 세팅을 복사.
// - 2026-09-03: 저장 성공/실패 후 목록 invalidate — 낙관적 확정이 DB와 어긋나지 않게.
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/shared/api/apiClient";
import { formatPhoneNumberInput } from "@/shared/components/business/settings/business/validations";
import { useToast } from "@/shared/hooks/use-toast";
import { ChevronDown, ChevronRight, Phone, Search } from "lucide-react";

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
  phoneNumber?: string | null;
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
  phoneNumber?: string | null;
  status: "pending" | "confirmed";
  employees: HexEmployeeRow[];
};

type HexVerificationInProgressData = {
  pendingCount?: number;
  confirmedCount?: number;
  callNeededCount?: number;
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

const phoneDigits = (value?: string | null) =>
  String(value || "").replace(/\D/g, "");

const formatPhoneLabel = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return formatPhoneNumberInput(raw) || raw;
};

const exoStaffChoiceSig = (emp: HexEmployeeRow) =>
  (emp.manufacturers || [])
    .map((mfr) => `${mfr.manufacturer}:${mfr.applyHex30 ? "30" : "0"}`)
    .join("|");

/** 임플란트 제조사별 0°/30°가 직원 사이에 다른지. 제조사끼리 다른 것은 같은 세팅이다. */
const exoStaffChoicesDiffer = (ba: HexBusinessGroup) => {
  const employees = ba.employees || [];
  if (employees.length < 2) return false;
  return new Set(employees.map(exoStaffChoiceSig)).size > 1;
};

const needsExoStaffPhoneCheck = (ba: HexBusinessGroup) =>
  (ba.employees?.length || 0) > 1 && ba.status === "pending";

const seedSharedAngles = (ba: HexBusinessGroup): Record<string, boolean> => {
  const employees = ba.employees || [];
  const names = employees[0]?.manufacturers?.map((mfr) => mfr.manufacturer) || [];
  const angles: Record<string, boolean> = {};
  for (const name of names) {
    const flags = employees
      .map(
        (emp) =>
          emp.manufacturers?.find((mfr) => mfr.manufacturer === name)?.applyHex30,
      )
      .filter((value): value is boolean => typeof value === "boolean");
    const first = flags[0];
    angles[name] =
      flags.length > 0 && flags.every((value) => value === first)
        ? Boolean(first)
        : true;
  }
  return angles;
};

const sharedAnglesAlreadyApplied = (
  ba: HexBusinessGroup,
  angles: Record<string, boolean>,
) =>
  (ba.employees || []).every((emp) =>
    (emp.manufacturers || []).every((mfr) => {
      const applyHex30 = angles[mfr.manufacturer];
      if (typeof applyHex30 !== "boolean") return false;
      return (
        mfr.status === "confirmed" &&
        mfr.applyHex30 === applyHex30 &&
        mfr.verifiedHex === hexFromApply(applyHex30)
      );
    }),
  );

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

const patchBusinessCommonHex = (
  queryClient: QueryClient,
  businessAnchorId: string,
  angles: Record<string, boolean>,
) => {
  queryClient.setQueryData(
    HEX_QUERY_KEY,
    (prev: ApiEnvelope<HexVerificationInProgressData> | undefined) => {
      if (!prev?.data) return prev;
      const items = (prev.data.items || []).map((ba) => {
        if (String(ba.businessAnchorId || "") !== businessAnchorId) return ba;
        const employees = (ba.employees || []).map((emp) => {
          const manufacturers = (emp.manufacturers || []).map((mfr) => {
            const applyHex30 = angles[mfr.manufacturer];
            if (typeof applyHex30 !== "boolean") return mfr;
            const hex = hexFromApply(applyHex30);
            return {
              ...mfr,
              applyHex30,
              status: "confirmed" as const,
              verifiedHex: hex,
              seedHex: hex,
            };
          });
          const pendingManufacturerCount = manufacturers.filter(
            (mfr) => mfr.status === "pending",
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
          (emp) => emp.status === "pending",
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
          callNeededCount: items.filter((ba) => needsExoStaffPhoneCheck(ba)).length,
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
  const [showUsers, setShowUsers] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [sharedAngles, setSharedAngles] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [confirmApplyBaKey, setConfirmApplyBaKey] = useState<string | null>(null);
  const [applyingBaId, setApplyingBaId] = useState<string | null>(null);

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
  const callNeededCount = useMemo(
    () => items.filter((ba) => needsExoStaffPhoneCheck(ba)).length,
    [items],
  );

  const persistDraft = useCallback(
    async (
      userId: string,
      manufacturer: string,
      draft: SwitchDraft,
      baseline: SwitchDraft,
    ) => {
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
          void queryClient.invalidateQueries({ queryKey: HEX_QUERY_KEY });
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
        void queryClient.invalidateQueries({ queryKey: HEX_QUERY_KEY });
      } catch (e: unknown) {
        void queryClient.invalidateQueries({ queryKey: HEX_QUERY_KEY });
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

  const discardPendingSaves = useCallback(() => {
    for (const key of Object.keys(timersRef.current)) {
      const timer = timersRef.current[key];
      if (timer) clearTimeout(timer);
      timersRef.current[key] = null;
      delete latestRef.current[key];
      delete baselineRef.current[key];
      delete metaRef.current[key];
    }
  }, []);

  const applyCommon = useCallback(
    async (
      businessAnchorId: string,
      baKey: string,
      angles: Record<string, boolean>,
    ) => {
      discardPendingSaves();
      setApplyingBaId(businessAnchorId);
      patchBusinessCommonHex(queryClient, businessAnchorId, angles);
      try {
        const res = await apiFetch<ApiEnvelope<{ userCount?: number }>>({
          path: `/api/admin/hex-verification/businesses/${encodeURIComponent(businessAnchorId)}/apply-common`,
          method: "POST",
          token: token || undefined,
          jsonBody: {
            manufacturers: Object.entries(angles).map(
              ([manufacturer, applyHex30]) => ({
                manufacturer,
                applyHex30,
                confirmed: true,
              }),
            ),
          },
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "공통 적용에 실패했습니다.");
        }
        const userCount = Number(res.data?.data?.userCount || 0);
        toast({
          title: "직원에게 적용했습니다",
          description: `${userCount.toLocaleString()}명`,
        });
        setConfirmApplyBaKey((prev) => (prev === baKey ? null : prev));
        setSharedAngles((prev) => {
          if (!prev[baKey]) return prev;
          const next = { ...prev };
          delete next[baKey];
          return next;
        });
      } catch (e: unknown) {
        toast({
          title: "공통 적용 실패",
          description: e instanceof Error ? e.message : "다시 시도해주세요.",
          variant: "destructive",
        });
      } finally {
        setApplyingBaId(null);
        void queryClient.invalidateQueries({ queryKey: HEX_QUERY_KEY });
      }
    },
    [discardPendingSaves, queryClient, toast, token],
  );

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
    setConfirmApplyBaKey(null);
    setSharedAngles({});
  }, [enabled, flushAll]);

  useEffect(() => {
    return () => {
      flushAll();
    };
  }, [flushAll]);

  return (
    <div className="space-y-3 text-sm text-gray-700">
      <p className="text-xs text-muted-foreground">
        ExoCAD 3.0 이하 직원이 여러 명이면 전화하세요.
        <br />
        그 직원들이 같은 세팅을 쓰는지 물어보세요.
        <br />
        같으면 제조사별로 정해 그 직원들에게 적용합니다.
      </p>
      {callNeededCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          전화 {callNeededCount.toLocaleString()}곳
        </p>
      ) : null}
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
      <div className="max-h-[60vh] space-y-3 overflow-auto px-1.5 py-1.5">
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
            const exoCount = ba.employees?.length || 0;
            const multi = exoCount > 1;
            const staffDiffer = exoStaffChoicesDiffer(ba);
            const phoneCheck = needsExoStaffPhoneCheck(ba);
            const baOpen =
              expandedBa[baKey] ?? (searching || ba.status === "pending");
            const usersOpen =
              showUsers[baKey] ?? (searching || !multi || staffDiffer);
            const phone = formatPhoneLabel(ba.phoneNumber);
            const digits = phoneDigits(ba.phoneNumber);
            const angles = sharedAngles[baKey] ?? seedSharedAngles(ba);
            const confirming = confirmApplyBaKey === baKey;
            const applying =
              applyingBaId != null &&
              applyingBaId === String(ba.businessAnchorId || "");
            const sharedManufacturers = ba.employees?.[0]?.manufacturers || [];
            const sharedApplied =
              multi && sharedAnglesAlreadyApplied(ba, angles);
            return (
              <div
                key={baKey}
                className="rounded-md border bg-white"
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
                      ExoCAD 3.0 이하 {exoCount.toLocaleString()}명
                      {staffDiffer
                        ? " · 직원마다 다름"
                        : (ba.pendingUserCount || 0) > 0
                          ? ` · 미확정 ${(ba.pendingUserCount || 0).toLocaleString()}명`
                          : multi
                            ? " · 같은 세팅"
                            : ""}
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
                    {phoneCheck ? "전화 확인" : ba.status === "pending" ? "미정" : "완료"}
                  </Badge>
                </button>
                {baOpen ? (
                  <div className="space-y-2 border-t px-3 py-2.5">
                    {multi && phone && digits ? (
                      <a
                        href={`tel:${digits}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 underline underline-offset-2"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {phone}
                      </a>
                    ) : null}
                    {multi && !ba.businessAnchorId ? (
                      <p className="text-[11px] text-muted-foreground">
                        소속이 없어 사용자별로 저장합니다.
                      </p>
                    ) : null}
                    {multi && ba.businessAnchorId && staffDiffer ? (
                      <p className="text-[11px] text-amber-800">
                        직원마다 세팅이 다릅니다.
                        <br />
                        맞출 때만 전원에 적용하세요.
                      </p>
                    ) : null}
                    {multi && ba.businessAnchorId ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          {sharedManufacturers.map((mfr) => {
                            const applyHex30 = Boolean(angles[mfr.manufacturer]);
                            return (
                              <div
                                key={mfr.manufacturer}
                                className="flex items-center justify-between gap-2 rounded border bg-white px-2.5 py-2"
                              >
                                <div className="min-w-0 text-xs font-semibold truncate">
                                  {mfr.manufacturer}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-5 shrink-0 text-[10px] text-muted-foreground">
                                    0°
                                  </span>
                                  <Switch
                                    checked={applyHex30}
                                    onCheckedChange={(checked) =>
                                      setSharedAngles((prev) => ({
                                        ...prev,
                                        [baKey]: {
                                          ...(prev[baKey] ?? seedSharedAngles(ba)),
                                          [mfr.manufacturer]: Boolean(checked),
                                        },
                                      }))
                                    }
                                  />
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    30°
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {confirming ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] text-muted-foreground">
                              ExoCAD 3.0 이하 직원에게 이 세팅을 적용합니다.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              disabled={applying}
                              onClick={() =>
                                void applyCommon(
                                  String(ba.businessAnchorId),
                                  baKey,
                                  angles,
                                )
                              }
                            >
                              {applying ? "적용 중…" : "적용"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              disabled={applying}
                              onClick={() => setConfirmApplyBaKey(null)}
                            >
                              취소
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={sharedApplied || applyingBaId != null}
                            onClick={() => setConfirmApplyBaKey(baKey)}
                          >
                            이 세팅을 전원에 적용
                          </Button>
                        )}
                      </>
                    ) : null}
                    {multi ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                      onClick={() =>
                        setShowUsers((prev) => ({ ...prev, [baKey]: !usersOpen }))
                      }
                    >
                      {usersOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      사용자별
                    </button>
                    ) : null}
                    {!multi || usersOpen ? (
                  <div className="divide-y rounded-md border bg-slate-50/40">
                    {(ba.employees || []).map((emp) => {
                      const uKey = emp.userId;
                      const uOpen = expandedUser[uKey] ?? (searching || !multi);
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
    callNeededCount: items.filter((item) => needsExoStaffPhoneCheck(item)).length,
    confirmedBusinessCount: items.filter((item) => item.status !== "pending")
      .length,
    pendingBusinesses,
    loading: isFetching,
    refetch,
  };
}
