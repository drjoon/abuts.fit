// related: AdminDashboardPage.tsx, admin.hexVerification.controller.js
// change-log:
// - 2026-09-03: BA 카드 + 직원 collapse + 임플란트 제조사별 applyHex30/확정 UI
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { ChevronDown, ChevronRight } from "lucide-react";

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

type Props = {
  token: string | null | undefined;
  enabled?: boolean;
};

const choiceKey = (userId: string, manufacturer: string) =>
  `${userId}|${manufacturer}`;

export function HexVerificationAdminPanel({ token, enabled = true }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedBa, setExpandedBa] = useState<Record<string, boolean>>({});
  const [expandedUser, setExpandedUser] = useState<Record<string, boolean>>({});
  const [hexChoice, setHexChoice] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<Record<string, boolean>>({});

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-hex-verification-in-progress"],
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
  const pendingCount = Number(data?.data?.pendingCount || 0);
  const confirmedCount = Number(data?.data?.confirmedCount || 0);

  const runAction = async (
    key: string,
    fn: () => Promise<void>,
    okTitle: string,
    failTitle: string,
  ) => {
    setBusyKey((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
      toast({ title: okTitle });
      await refetch();
      queryClient.invalidateQueries({
        queryKey: ["admin-hex-verification-in-progress"],
      });
    } catch (e: unknown) {
      toast({
        title: failTitle,
        description: e instanceof Error ? e.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const toggleApplyHex30 = (
    userId: string,
    manufacturer: string,
    applyHex30: boolean,
  ) => {
    const key = `apply:${choiceKey(userId, manufacturer)}`;
    void runAction(
      key,
      async () => {
        const res = await apiFetch<ApiEnvelope<unknown>>({
          path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/apply-hex30`,
          method: "POST",
          token: token || undefined,
          jsonBody: { applyHex30 },
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "저장 실패");
        }
      },
      "헥스 30° 적용 설정 저장",
      "적용 설정 저장 실패",
    );
  };

  const completeManufacturer = (
    userId: string,
    manufacturer: string,
    fallback: string,
  ) => {
    const key = choiceKey(userId, manufacturer);
    const hexRotation = hexChoice[key] || fallback || "헥스30도회전";
    void runAction(
      `complete:${key}`,
      async () => {
        const res = await apiFetch<ApiEnvelope<unknown>>({
          path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/complete`,
          method: "POST",
          token: token || undefined,
          jsonBody: { hexRotation },
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "확정 실패");
        }
      },
      `확정 · ${manufacturer} → ${hexRotation}`,
      "헥스 확정 실패",
    );
  };

  const revertManufacturer = (userId: string, manufacturer: string) => {
    const key = choiceKey(userId, manufacturer);
    void runAction(
      `revert:${key}`,
      async () => {
        const res = await apiFetch<ApiEnvelope<unknown>>({
          path: `/api/admin/hex-verification/users/${encodeURIComponent(userId)}/manufacturers/${encodeURIComponent(manufacturer)}/revert`,
          method: "POST",
          token: token || undefined,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "되돌리기 실패");
        }
      },
      `미확인으로 되돌림 · ${manufacturer}`,
      "헥스 되돌리기 실패",
    );
  };

  return (
    <div className="space-y-3 text-sm text-gray-700">
      <div className="text-xs text-muted-foreground">
        ExoCAD 3.0 이하 사용자 · 미확정 제조사 {pendingCount.toLocaleString()}건
        · 확정 {confirmedCount.toLocaleString()}건. 제조사별 30° 패치 on/off와
        샘플 확인 후 확정하면 해당 임플란트 제조사 의뢰의 제조사 PreviewModal이
        잠깁니다.
      </div>
      <div className="max-h-[60vh] overflow-auto pr-1 space-y-3">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
            {isFetching
              ? "불러오는 중…"
              : "ExoCAD 3.0 이하로 등록된 사용자가 없습니다."}
          </div>
        ) : (
          items.map((ba) => {
            const baKey = String(ba.businessAnchorId || ba.businessName || "none");
            const many = (ba.employees?.length || 0) > 2;
            const baOpen = expandedBa[baKey] ?? !many || ba.status === "pending";
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
                  <div className="border-t divide-y">
                    {(ba.employees || []).map((emp) => {
                      const uKey = emp.userId;
                      const uOpen =
                        expandedUser[uKey] ?? emp.status === "pending";
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
                            <div className="px-3 pb-2 space-y-1.5">
                              {(emp.manufacturers || []).map((mfr) => {
                                const ck = choiceKey(emp.userId, mfr.manufacturer);
                                const selected =
                                  hexChoice[ck] ||
                                  mfr.verifiedHex ||
                                  mfr.seedHex ||
                                  "헥스30도회전";
                                const busy =
                                  busyKey[`apply:${ck}`] ||
                                  busyKey[`complete:${ck}`] ||
                                  busyKey[`revert:${ck}`];
                                return (
                                  <div
                                    key={mfr.manufacturer}
                                    className="rounded border bg-white px-2.5 py-2 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold">
                                          {mfr.manufacturer}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                          {mfr.status === "confirmed"
                                            ? `확정: ${mfr.verifiedHex}`
                                            : mfr.samplePending
                                              ? `샘플 ${mfr.sampleRequestId || "생성됨"}`
                                              : "샘플 대기 · 시드 " +
                                                (mfr.seedHex || "")}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-muted-foreground">
                                          30°
                                        </span>
                                        <Switch
                                          checked={Boolean(mfr.applyHex30)}
                                          disabled={
                                            busy || mfr.status === "confirmed"
                                          }
                                          onCheckedChange={(checked) =>
                                            toggleApplyHex30(
                                              emp.userId,
                                              mfr.manufacturer,
                                              Boolean(checked),
                                            )
                                          }
                                        />
                                        <Badge
                                          variant="outline"
                                          className={
                                            mfr.status === "pending"
                                              ? "text-[9px] border-amber-200 bg-amber-50 text-amber-700"
                                              : "text-[9px] border-emerald-200 bg-emerald-50 text-emerald-700"
                                          }
                                        >
                                          {mfr.status === "pending"
                                            ? "미정"
                                            : "확정"}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                          selected === "STL모델대로"
                                            ? "default"
                                            : "outline"
                                        }
                                        className="h-6 text-[10px] px-2"
                                        disabled={busy}
                                        onClick={() =>
                                          setHexChoice((prev) => ({
                                            ...prev,
                                            [ck]: "STL모델대로",
                                          }))
                                        }
                                      >
                                        STL
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                          selected === "헥스30도회전"
                                            ? "default"
                                            : "outline"
                                        }
                                        className="h-6 text-[10px] px-2"
                                        disabled={busy}
                                        onClick={() =>
                                          setHexChoice((prev) => ({
                                            ...prev,
                                            [ck]: "헥스30도회전",
                                          }))
                                        }
                                      >
                                        30°
                                      </Button>
                                      {mfr.status === "pending" ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-6 text-[10px] px-2 ml-auto"
                                          disabled={busy}
                                          onClick={() =>
                                            completeManufacturer(
                                              emp.userId,
                                              mfr.manufacturer,
                                              selected,
                                            )
                                          }
                                        >
                                          {busy ? "…" : "완료"}
                                        </Button>
                                      ) : (
                                        <>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-6 text-[10px] px-2 ml-auto"
                                            disabled={busy}
                                            onClick={() =>
                                              completeManufacturer(
                                                emp.userId,
                                                mfr.manufacturer,
                                                selected,
                                              )
                                            }
                                          >
                                            {busy ? "…" : "수정"}
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-[10px] px-2"
                                            disabled={busy}
                                            onClick={() =>
                                              revertManufacturer(
                                                emp.userId,
                                                mfr.manufacturer,
                                              )
                                            }
                                          >
                                            되돌리기
                                          </Button>
                                        </>
                                      )}
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
    queryKey: ["admin-hex-verification-in-progress"],
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
