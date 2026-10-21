import { useEffect, useMemo, useState } from "react";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/shared/hooks/use-toast";
import {
  mergeAdminNewConnectionGroups,
  updateAdminNewConnectionGroupCanonical,
  updateAdminNewConnectionGroupWorkflow,
  updateAdminNewConnectionRequestImplant,
} from "@/shared/admin/newConnectionRequestInbox";

export type NewConnectionRequestItem = {
  id: string;
  requestId?: string;
  createdAt?: string | null;
  status?: string;
  manufacturerStage?: string;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  memo?: string;
  fileName?: string;
  connectionLabel?: string;
  source?: "unsupported" | "new_implant";
  groupKey?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  requesterName?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  businessName?: string;
  businessPhone?: string;
};

export type NewConnectionRequestGroup = {
  groupKey: string;
  canonicalManufacturer?: string;
  canonicalBrand?: string;
  aliases?: Array<{ manufacturer: string; brand: string }>;
  read?: boolean;
  inDevelopment?: boolean;
  developmentComplete?: boolean;
  requestCount?: number;
  hasNewImplant?: boolean;
  hasUnsupported?: boolean;
  items?: NewConnectionRequestItem[];
};

export type NewConnectionRequestStats = {
  total?: number;
  openGroupCount?: number;
  groups?: NewConnectionRequestGroup[];
};

const formatWhen = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
};

const phoneHref = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
};

type Props = {
  open: boolean;
  onClose: () => void;
  stats: NewConnectionRequestStats | null | undefined;
  onRefresh: () => void;
};

export function AdminNewConnectionRequestDialog({
  open,
  onClose,
  stats,
  onRefresh,
}: Props) {
  const groups = useMemo(
    () => (Array.isArray(stats?.groups) ? stats.groups : []),
    [stats?.groups],
  );

  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [implantDraft, setImplantDraft] = useState({
    manufacturer: "",
    brand: "",
    family: "",
    implantType: "",
  });
  const [canonicalDraft, setCanonicalDraft] = useState({
    manufacturer: "",
    brand: "",
  });
  const [mergeTargetKey, setMergeTargetKey] = useState("");

  const selectedGroup = groups.find((g) => g.groupKey === selectedGroupKey) || null;
  const groupItems = selectedGroup?.items || [];
  const selectedRequest =
    groupItems.find((item) => item.id === selectedRequestId) ||
    groupItems[0] ||
    null;

  useEffect(() => {
    if (!open) return;
    if (!selectedGroupKey && groups[0]?.groupKey) {
      setSelectedGroupKey(groups[0].groupKey);
    }
  }, [open, groups, selectedGroupKey]);

  useEffect(() => {
    if (!selectedGroup) return;
    setCanonicalDraft({
      manufacturer: selectedGroup.canonicalManufacturer || "",
      brand: selectedGroup.canonicalBrand || "",
    });
    const firstId = selectedGroup.items?.[0]?.id || null;
    setSelectedRequestId(firstId);
  }, [selectedGroup?.groupKey]);

  useEffect(() => {
    if (!selectedRequest) return;
    setImplantDraft({
      manufacturer: selectedRequest.implantManufacturer || "",
      brand: selectedRequest.implantBrand || "",
      family: selectedRequest.implantFamily || "",
      implantType: selectedRequest.implantType || "",
    });
  }, [selectedRequest?.id]);

  const patchGroupWorkflow = async (
    flags: Partial<{
      read: boolean;
      inDevelopment: boolean;
      developmentComplete: boolean;
    }>,
  ) => {
    if (!selectedGroup?.groupKey || groupBusy) return;
    setGroupBusy(true);
    const ok = await updateAdminNewConnectionGroupWorkflow(
      selectedGroup.groupKey,
      flags,
    );
    setGroupBusy(false);
    if (!ok) {
      toast({
        title: "저장 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }
    onRefresh();
  };

  const saveCanonical = async () => {
    if (!selectedGroup?.groupKey || groupBusy) return;
    setGroupBusy(true);
    const ok = await updateAdminNewConnectionGroupCanonical(selectedGroup.groupKey, {
      canonicalManufacturer: canonicalDraft.manufacturer,
      canonicalBrand: canonicalDraft.brand,
    });
    setGroupBusy(false);
    if (!ok) {
      toast({
        title: "묶음 이름 저장 실패",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "묶음 이름을 저장했습니다." });
    onRefresh();
  };

  const saveRequestImplant = async () => {
    if (!selectedRequest?.id || groupBusy) return;
    setGroupBusy(true);
    const ok = await updateAdminNewConnectionRequestImplant(selectedRequest.id, {
      implantManufacturer: implantDraft.manufacturer,
      implantBrand: implantDraft.brand,
      implantFamily: implantDraft.family,
      implantType: implantDraft.implantType,
      targetGroupKey: selectedGroup?.groupKey,
      mergeAlias:
        implantDraft.manufacturer && implantDraft.brand
          ? {
              manufacturer: implantDraft.manufacturer,
              brand: implantDraft.brand,
            }
          : undefined,
    });
    setGroupBusy(false);
    if (!ok) {
      toast({
        title: "임플란트 정보 저장 실패",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "임플란트 정보를 저장했습니다." });
    onRefresh();
  };

  const mergeIntoGroup = async () => {
    if (!selectedGroup?.groupKey || !mergeTargetKey.trim() || groupBusy) return;
    setGroupBusy(true);
    const ok = await mergeAdminNewConnectionGroups(
      selectedGroup.groupKey,
      mergeTargetKey.trim(),
    );
    setGroupBusy(false);
    if (!ok) {
      toast({
        title: "묶음 합치기 실패",
        description: "대상 묶음 키를 확인해주세요.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "묶음을 합쳤습니다." });
    setSelectedGroupKey(mergeTargetKey.trim());
    setMergeTargetKey("");
    onRefresh();
  };

  return (
    <MultiActionDialog
      open={open}
      onClose={() => {
        onClose();
        setSelectedGroupKey(null);
        setSelectedRequestId(null);
      }}
      title="신규 커넥션 요청"
      panelClassName="!w-[min(960px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
      actions={[
        {
          label: "닫기",
          variant: "secondary",
          onClick: () => {
            onClose();
            setSelectedGroupKey(null);
            setSelectedRequestId(null);
          },
        },
      ]}
      description={
        <div className="grid gap-3 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="px-1.5 text-xs text-slate-500">
              제조사·브랜드별 묶음 ({groups.length.toLocaleString()}개)
            </p>
            <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto px-1.5 py-1.5">
              {groups.length === 0 ? (
                <li className="px-2 py-3 text-sm text-slate-500">
                  대기 중인 요청이 없습니다.
                </li>
              ) : (
                groups.map((group) => {
                  const selected = group.groupKey === selectedGroupKey;
                  const label = [group.canonicalManufacturer, group.canonicalBrand]
                    .map((part) => String(part || "").trim())
                    .filter(Boolean)
                    .join(" · ");
                  const tone = group.developmentComplete
                    ? "border-slate-200 bg-slate-50/90"
                    : group.hasNewImplant
                      ? "border-amber-300 bg-amber-50/90"
                      : "border-rose-300 bg-rose-50/90";
                  return (
                    <li key={group.groupKey}>
                      <button
                        type="button"
                        onClick={() => setSelectedGroupKey(group.groupKey)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left ${
                          selected
                            ? "border-slate-500 bg-slate-100 ring-1 ring-slate-400/50"
                            : tone
                        }`}
                      >
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {label || group.groupKey}
                        </div>
                        <div className="truncate text-xs text-slate-600">
                          {group.requestCount?.toLocaleString() || 0}건
                          {group.hasNewImplant ? " · 신규 임플란트" : ""}
                          {group.hasUnsupported ? " · 미제공 커넥션" : ""}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {group.groupKey}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-medium text-slate-600">
                          {group.read ? (
                            <span className="rounded bg-slate-200 px-1 py-0.5">읽음</span>
                          ) : null}
                          {group.inDevelopment ? (
                            <span className="rounded bg-sky-100 px-1 py-0.5 text-sky-900">
                              개발중
                            </span>
                          ) : null}
                          {group.developmentComplete ? (
                            <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-900">
                              개발완료
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          {selectedGroup ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                <div className="text-xs font-semibold text-slate-600">묶음 진행</div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={Boolean(selectedGroup.read)}
                      disabled={groupBusy}
                      onCheckedChange={(checked) => {
                        void patchGroupWorkflow({ read: checked === true });
                      }}
                    />
                    읽음
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={Boolean(selectedGroup.inDevelopment)}
                      disabled={groupBusy}
                      onCheckedChange={(checked) => {
                        void patchGroupWorkflow({ inDevelopment: checked === true });
                      }}
                    />
                    개발중
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={Boolean(selectedGroup.developmentComplete)}
                      disabled={groupBusy}
                      onCheckedChange={(checked) => {
                        void patchGroupWorkflow({
                          developmentComplete: checked === true,
                        });
                      }}
                    />
                    개발완료
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  묶음 표시 이름 (전역 SSOT)
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">제조사</Label>
                    <Input
                      value={canonicalDraft.manufacturer}
                      onChange={(e) =>
                        setCanonicalDraft((prev) => ({
                          ...prev,
                          manufacturer: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">브랜드</Label>
                    <Input
                      value={canonicalDraft.brand}
                      onChange={(e) =>
                        setCanonicalDraft((prev) => ({
                          ...prev,
                          brand: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={groupBusy}
                  onClick={() => void saveCanonical()}
                >
                  {groupBusy ? "저장 중…" : "묶음 이름 저장"}
                </button>
                {(selectedGroup.aliases || []).length > 0 ? (
                  <div className="text-xs text-slate-500">
                    동의어:{" "}
                    {(selectedGroup.aliases || [])
                      .map((row) => `${row.manufacturer} · ${row.brand}`)
                      .join(" / ")}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-2">
                <div className="text-xs font-semibold text-slate-600">
                  다른 묶음과 합치기
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[10rem] flex-1">
                    <Label className="text-xs">대상 묶음</Label>
                    <select
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                      value={mergeTargetKey}
                      onChange={(e) => setMergeTargetKey(e.target.value)}
                    >
                      <option value="">선택…</option>
                      {groups
                        .filter((row) => row.groupKey !== selectedGroup.groupKey)
                        .map((row) => {
                          const label = [
                            row.canonicalManufacturer,
                            row.canonicalBrand,
                          ]
                            .map((part) => String(part || "").trim())
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <option key={row.groupKey} value={row.groupKey}>
                              {label || row.groupKey}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={groupBusy || !mergeTargetKey.trim()}
                    onClick={() => void mergeIntoGroup()}
                  >
                    합치기
                  </button>
                </div>
              </div>

              <div className="space-y-1 border-t border-slate-100 pt-2">
                <div className="text-xs font-semibold text-slate-600">의뢰 목록</div>
                <ul className="max-h-32 space-y-1 overflow-y-auto px-0.5 py-0.5">
                  {groupItems.map((item) => {
                    const who = [item.clinicName, item.patientName, item.tooth]
                      .map((part) => String(part || "").trim())
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRequestId(item.id)}
                          className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                            item.id === selectedRequest?.id
                              ? "border-slate-400 bg-slate-100"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className="truncate font-semibold">{who || item.requestId}</div>
                          <div className="truncate text-slate-500">
                            {item.connectionLabel}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {selectedRequest ? (
                <div className="space-y-2 border-t border-slate-100 pt-2">
                  <div className="text-xs font-semibold text-slate-600">선택 의뢰</div>
                  <div>
                    <div className="text-xs text-slate-500">의뢰자</div>
                    <div className="font-semibold text-slate-900">
                      {selectedRequest.requesterName || "이름 없음"}
                    </div>
                    <div>{selectedRequest.businessName || "사업자 없음"}</div>
                    {phoneHref(selectedRequest.requesterPhone) ? (
                      <a
                        className="font-semibold text-primary-strong underline"
                        href={phoneHref(selectedRequest.requesterPhone)}
                      >
                        {selectedRequest.requesterPhone}
                      </a>
                    ) : (
                      <div>전화번호 없음</div>
                    )}
                    {selectedRequest.requesterEmail ? (
                      <div>{selectedRequest.requesterEmail}</div>
                    ) : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">제조사</Label>
                      <Input
                        value={implantDraft.manufacturer}
                        onChange={(e) =>
                          setImplantDraft((prev) => ({
                            ...prev,
                            manufacturer: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">브랜드</Label>
                      <Input
                        value={implantDraft.brand}
                        onChange={(e) =>
                          setImplantDraft((prev) => ({
                            ...prev,
                            brand: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">패밀리</Label>
                      <Input
                        value={implantDraft.family}
                        onChange={(e) =>
                          setImplantDraft((prev) => ({
                            ...prev,
                            family: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-xs">타입</Label>
                      <Input
                        value={implantDraft.implantType}
                        onChange={(e) =>
                          setImplantDraft((prev) => ({
                            ...prev,
                            implantType: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    disabled={groupBusy}
                    onClick={() => void saveRequestImplant()}
                  >
                    {groupBusy ? "저장 중…" : "임플란트 정보 저장"}
                  </button>
                  <div className="text-xs text-slate-500">
                    접수 {formatWhen(selectedRequest.createdAt)}
                    {selectedRequest.requestId ? ` · ${selectedRequest.requestId}` : ""}
                  </div>
                  {selectedRequest.memo ? (
                    <div className="text-xs">{selectedRequest.memo}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500">
              왼쪽에서 묶음을 고르면 진행 상태와 의뢰 목록이 나옵니다.
            </div>
          )}
        </div>
      }
    />
  );
}
