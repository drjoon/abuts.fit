import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import { apiFetch } from "@/lib/apiClient";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { CncEventLogModal } from "@/components/CncEventLogModal";
import {
  CncPlaylistDrawer,
  type PlaylistJobItem,
} from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";

type QueueItem = {
  requestId?: string;
  status?: string;
  queuePosition?: number;
  estimatedDelivery?: string | Date;
  diameter?: number;
  diameterGroup?: string;
  ncPreload?: {
    status?: "NONE" | "UPLOADING" | "READY" | "FAILED" | string;
    machineId?: string;
    updatedAt?: string | Date;
    error?: string;
  } | null;
  clinicName?: string;
  patientName?: string;
};

type QueueMap = Record<string, QueueItem[]>;

type MachineStatus = {
  uid: string;
  status?: string;
  currentProgram?: string;
  nextProgram?: string;
};

type MachineQueueCardProps = {
  machineId: string;
  machineName?: string;
  queue: QueueItem[];
  onOpenRequestLog?: (requestId: string) => void;
  autoEnabled: boolean;
  onToggleAuto: (next: boolean) => void;
  machineStatus?: MachineStatus | null;
  statusRefreshing?: boolean;
  onOpenReservation: () => void;
};

const getStatusDotColor = (status?: string) => {
  const s = String(status || "")
    .trim()
    .toUpperCase();
  if (!s) return "bg-slate-300";
  if (["ALARM", "ERROR", "FAULT"].some((k) => s.includes(k))) {
    return "bg-rose-500";
  }
  if (["WARN", "WARNING"].some((k) => s.includes(k))) {
    return "bg-amber-500";
  }
  if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) {
    return "bg-emerald-500";
  }
  if (["STOP", "IDLE", "READY"].some((k) => s.includes(k))) {
    return "bg-emerald-500";
  }
  return "bg-blue-500";
};

const isMachiningStatus = (status?: string) => {
  // /api/cnc-machines/queues(getProductionQueues)에서 내려오는 status는 Request.status이며
  // 값은 "의뢰" | "CAM" | "생산" 으로 내려온다.
  const s = String(status || "").trim();
  return s === "생산" || s === "가공";
};

const formatLabel = (q: QueueItem) => {
  const clinic = String(q.clinicName || "").trim();
  const patient = String(q.patientName || "").trim();
  const rid = String(q.requestId || "").trim();
  const base =
    clinic || patient
      ? `${clinic}${clinic && patient ? " " : ""}${patient}`
      : rid;
  if (!base) return "-";
  return rid ? `${base} (${rid})` : base;
};

const getNcPreloadBadge = (item?: QueueItem | null) => {
  const s = String(item?.ncPreload?.status || "")
    .trim()
    .toUpperCase();
  if (!s || s === "NONE") return null;
  if (s === "UPLOADING") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-amber-50 text-[10px] font-extrabold text-amber-700 border-amber-200 px-2 py-0.5"
      >
        업로드중
      </Badge>
    );
  }
  if (s === "READY") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-emerald-50 text-[10px] font-extrabold text-emerald-700 border-emerald-200 px-2 py-0.5"
      >
        준비됨
      </Badge>
    );
  }
  if (s === "FAILED") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-rose-50 text-[10px] font-extrabold text-rose-700 border-rose-200 px-2 py-0.5"
      >
        실패
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="shrink-0 bg-slate-50 text-[10px] font-extrabold text-slate-700 border-slate-200 px-2 py-0.5"
    >
      {s}
    </Badge>
  );
};

const MachineQueueCard = ({
  machineId,
  machineName,
  queue,
  onOpenRequestLog,
  autoEnabled,
  onToggleAuto,
  machineStatus,
  statusRefreshing,
  onOpenReservation,
}: MachineQueueCardProps) => {
  const machiningQueueAll = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q?.status),
  );
  const headPreloadBadge = getNcPreloadBadge(machiningQueueAll[0]);
  const headRequestId = machiningQueueAll[0]?.requestId
    ? String(machiningQueueAll[0].requestId)
    : "";

  const totalMachiningCount = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q?.status),
  ).length;

  const statusColor = getStatusDotColor(machineStatus?.status);

  const headerTitle = machineName || machineId;
  const nowPlayingLabel = machineStatus?.currentProgram
    ? String(machineStatus.currentProgram)
    : "없음";
  const nextUpLabel = machineStatus?.nextProgram
    ? String(machineStatus.nextProgram)
    : machiningQueueAll[0]
      ? formatLabel(machiningQueueAll[0])
      : "없음";

  return (
    <div className="app-glass-card app-glass-card--xl flex flex-col">
      <div className="app-glass-card-content flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-extrabold text-slate-900">
              {headerTitle}
            </div>
            <span
              className={`w-3 h-3 rounded-full ${statusColor} ${
                statusRefreshing ? "animate-pulse" : ""
              }`}
            />
            <div className="shrink-0 text-[12px] font-extrabold text-slate-700">
              {totalMachiningCount}건
            </div>
            {headPreloadBadge ? headPreloadBadge : null}
          </div>
          {machineStatus?.currentProgram || machineStatus?.nextProgram ? (
            <div className="mt-1 text-[11px] font-semibold text-slate-600">
              {machineStatus?.currentProgram ? (
                <span className="mr-2">
                  현재: {machineStatus.currentProgram}
                </span>
              ) : null}
              {machineStatus?.nextProgram ? (
                <span>다음: {machineStatus.nextProgram}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="flex items-center gap-2"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="text-[11px] font-extrabold text-slate-700">
            자동 가공
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleAuto(!autoEnabled);
            }}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="app-glass-card-content mt-4 flex flex-col gap-2 text-sm">
        <div className="grid grid-cols-1 gap-2">
          <div className="group rounded-2xl px-4 py-3 border shadow-sm transition-all bg-white/85 border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">
                  Now Playing
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nowPlayingLabel}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {machineStatus?.currentProgram ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!headRequestId) return;
                      onOpenRequestLog?.(headRequestId);
                    }}
                  >
                    로그
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="group rounded-2xl px-4 py-3 border shadow-sm transition-all bg-white/85 border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500">
                  Next Up
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nextUpLabel}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReservation();
            }}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-xs font-extrabold text-white hover:from-blue-700 hover:to-sky-600 disabled:opacity-50 shadow-sm"
          >
            예약 관리
          </button>
        </div>
      </div>
    </div>
  );
};

type MachiningMachineQueueBoardProps = {
  searchQuery?: string;
};

export const MachiningMachineQueueBoard = ({
  searchQuery,
}: MachiningMachineQueueBoardProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { machines, setMachines } = useCncMachines();

  const [queueMap, setQueueMap] = useState<QueueMap>({});
  const [loading, setLoading] = useState(false);

  const [machineStatusMap, setMachineStatusMap] = useState<
    Record<string, MachineStatus>
  >({});

  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [statusRefreshedAt, setStatusRefreshedAt] = useState<string | null>(
    null,
  );
  const [statusRefreshError, setStatusRefreshError] = useState<string | null>(
    null,
  );
  const [statusRefreshErroredAt, setStatusRefreshErroredAt] = useState<
    string | null
  >(null);

  const [eventLogRequestId, setEventLogRequestId] = useState<string | null>(
    null,
  );
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState<string>("");
  const [playlistJobs, setPlaylistJobs] = useState<PlaylistJobItem[]>([]);

  useEffect(() => {
    let mounted = true;
    if (!token) return;
    setLoading(true);
    fetch("/api/cnc-machines/queues", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body: any) => ({ res, body })),
      )
      .then(({ res, body }) => {
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || body?.error || "생산 큐 조회 실패");
        }
        const map =
          body?.data && typeof body.data === "object" ? body.data : {};
        if (mounted) setQueueMap(map);
      })
      .catch((e: any) => {
        toast({
          title: "생산 큐 조회 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [token, toast]);

  const refreshMachineStatuses = useCallback(async () => {
    if (!token) return;
    setStatusRefreshing(true);
    setStatusRefreshError(null);
    setStatusRefreshErroredAt(null);
    try {
      const res = await apiFetch({
        path: "/api/machines/status",
        method: "GET",
        token,
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        const msg = String(body?.message || body?.error || "상태 조회 실패");
        setStatusRefreshError(msg);
        setStatusRefreshErroredAt(new Date().toLocaleTimeString());

        setMachineStatusMap((prev) => {
          const next = { ...prev };
          const list = Array.isArray(machines) ? machines : [];
          for (const m of list) {
            const uid = String(m?.uid || "").trim();
            if (!uid) continue;
            next[uid] = {
              ...(next[uid] || { uid }),
              uid,
              status: "ERROR",
            };
          }
          return next;
        });
        return;
      }

      const list: any[] = Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.machines)
          ? body.machines
          : Array.isArray(body?.data?.machines)
            ? body.data.machines
            : Array.isArray(body?.data?.data)
              ? body.data.data
              : [];

      setMachineStatusMap((prev) => {
        const next = { ...prev };
        for (const it of list) {
          const uid = String(it?.uid || it?.machineId || it?.id || "").trim();
          if (!uid) continue;
          next[uid] = {
            ...(next[uid] || { uid }),
            uid,
            status: String(
              it?.status || it?.state || it?.opStatus || "",
            ).trim(),
            currentProgram: next[uid]?.currentProgram,
            nextProgram: next[uid]?.nextProgram,
          };
        }
        return next;
      });

      setStatusRefreshedAt(new Date().toLocaleTimeString());
    } catch {
      // 브리지/백엔드 오류 시에도 UI에서 즉시 확인할 수 있도록 ERROR 상태를 반영한다.
      setMachineStatusMap((prev) => {
        const next = { ...prev };
        const list = Array.isArray(machines) ? machines : [];
        for (const m of list) {
          const uid = String(m?.uid || "").trim();
          if (!uid) continue;
          next[uid] = {
            ...(next[uid] || { uid }),
            uid,
            status: "ERROR",
          };
        }
        return next;
      });

      setStatusRefreshError("status proxy failed");
      setStatusRefreshErroredAt(new Date().toLocaleTimeString());
    } finally {
      setStatusRefreshing(false);
    }
  }, [machines, token]);

  useEffect(() => {
    if (!token) return;
    void refreshMachineStatuses();
  }, [token, refreshMachineStatuses]);

  const lastRefreshAtRef = useRef(0);
  const handleBoardClickCapture = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 800) return;
    lastRefreshAtRef.current = now;
    void refreshMachineStatuses();
  }, [refreshMachineStatuses]);

  const filteredMachines = useMemo(() => {
    const q = String(searchQuery || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(machines) ? machines : [];
    if (!q) return list;
    return list.filter((m) => {
      const fields = [m.name, m.uid, m.ip].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().indexOf(q) >= 0);
    });
  }, [machines, searchQuery]);

  const openReservationForMachine = useCallback(
    (uid: string) => {
      const raw = queueMap?.[uid] || [];
      const jobs = (Array.isArray(raw) ? raw : [])
        .filter((q) => isMachiningStatus(q?.status))
        .map((q, idx) => {
          const id = String(q.requestId || `${uid}:${idx}`);
          return {
            id,
            name: formatLabel(q),
            qty: 1,
          } satisfies PlaylistJobItem;
        });

      const machine = (Array.isArray(machines) ? machines : []).find(
        (m) => m.uid === uid,
      );

      setPlaylistTitle(machine?.name || uid);
      setPlaylistJobs(jobs);
      setPlaylistOpen(true);
    },
    [machines, queueMap],
  );

  const globalAutoEnabled = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return false;
    return list.every((m) => m.allowAutoMachining === true);
  }, [machines]);

  const updateMachineAuto = async (uid: string, next: boolean) => {
    if (!token) return;
    const target = (Array.isArray(machines) ? machines : []).find(
      (m) => m.uid === uid,
    );
    if (!target) return;

    const prev = target.allowAutoMachining === true;
    setMachines((prevList) =>
      prevList.map((m) =>
        m.uid === uid ? { ...m, allowAutoMachining: next } : m,
      ),
    );

    try {
      const res = await apiFetch({
        path: "/api/machines",
        method: "POST",
        token,
        jsonBody: {
          uid: target.uid,
          name: target.name,
          ip: target.ip,
          port: target.port,
          allowJobStart: target.allowJobStart !== false,
          allowProgramDelete: target.allowProgramDelete === true,
          allowAutoMachining: next,
        },
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "자동 가공 설정 저장 실패");
      }

      const trigger = body?.autoMachiningTrigger;
      if (next === true) {
        if (trigger?.attempted) {
          toast({
            title: "자동 가공 ON",
            description: trigger?.requestId
              ? `대기 의뢰(${String(trigger.requestId)}) 자동 시작을 트리거했습니다.`
              : "자동 시작을 트리거했습니다.",
          });
        } else {
          toast({
            title: "자동 가공 ON",
            description: "대기 의뢰가 없어 자동 시작 트리거를 건너뜁니다.",
          });
        }
      }
    } catch (e: any) {
      setMachines((prevList) =>
        prevList.map((m) =>
          m.uid === uid ? { ...m, allowAutoMachining: prev } : m,
        ),
      );
      toast({
        title: "설정 저장 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  const requestToggleMachineAuto = useCallback(
    (uid: string, next: boolean) => {
      if (!next) {
        void updateMachineAuto(uid, false);
        return;
      }

      const t = (Array.isArray(machines) ? machines : []).find(
        (m) => m.uid === uid,
      );
      const name = t?.name || uid;

      toast({
        title: "자동 가공을 켤까요?",
        description:
          "ON 하면 대기 중인 의뢰의 자동 가공이 즉시 시작될 수 있습니다. 계속 진행하시겠습니까?",
        variant: "destructive",
        duration: 8000,
        action: (
          <ToastAction
            altText="자동 가공 ON"
            onClick={() => {
              void updateMachineAuto(uid, true);
            }}
          >
            {name} ON
          </ToastAction>
        ),
      });
    },
    [machines, toast, updateMachineAuto],
  );

  const setGlobalAutoEnabled = async (enabled: boolean) => {
    if (!token) return;
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return;

    const prevMap = new Map(
      list.map((m) => [m.uid, m.allowAutoMachining === true]),
    );
    setMachines((prevList) =>
      prevList.map((m) => ({ ...m, allowAutoMachining: enabled })),
    );

    try {
      for (const m of list) {
        const res = await apiFetch({
          path: "/api/machines",
          method: "POST",
          token,
          jsonBody: {
            uid: m.uid,
            name: m.name,
            ip: m.ip,
            port: m.port,
            allowJobStart: m.allowJobStart !== false,
            allowProgramDelete: m.allowProgramDelete === true,
            allowAutoMachining: enabled,
          },
        });
        const body: any = res.data ?? {};
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "전체 자동 가공 설정 저장 실패");
        }
      }
    } catch (e: any) {
      setMachines((prevList) =>
        prevList.map((m) => ({
          ...m,
          allowAutoMachining: prevMap.get(m.uid) === true,
        })),
      );
      toast({
        title: "전체 자동 가공 설정 실패",
        description: e?.message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="space-y-4"
      onMouseDownCapture={handleBoardClickCapture}
      onTouchStartCapture={handleBoardClickCapture}
    >
      <div className="flex items-center justify-between">
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600 border border-slate-200 truncate">
          {statusRefreshing
            ? "장비 상태 조회중…"
            : statusRefreshError
              ? `장비 상태 조회 실패${
                  statusRefreshErroredAt ? ` ${statusRefreshErroredAt}` : ""
                } (${statusRefreshError})`
              : statusRefreshedAt
                ? `장비 상태 갱신 ${statusRefreshedAt}`
                : ""}
        </div>
        <div
          className="app-surface app-surface--panel flex items-center gap-3 px-4 py-3"
          title="OFF로 전환하면 현재 가공 중인 건은 그대로 진행되며, 완료 후 다음 자동 시작은 실행되지 않습니다."
        >
          <div className="text-[12px] font-extrabold text-slate-700">
            전체 자동 가공 허용
          </div>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              globalAutoEnabled ? "bg-emerald-500" : "bg-gray-300"
            }`}
            onClick={() => {
              void setGlobalAutoEnabled(!globalAutoEnabled);
            }}
            disabled={loading}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                globalAutoEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {filteredMachines.map((m) => (
          <MachineQueueCard
            key={m.uid}
            machineId={m.uid}
            machineName={m.name}
            queue={Array.isArray(queueMap?.[m.uid]) ? queueMap[m.uid] : []}
            onOpenRequestLog={(requestId) => setEventLogRequestId(requestId)}
            autoEnabled={m.allowAutoMachining === true}
            onToggleAuto={(next) => {
              requestToggleMachineAuto(m.uid, next);
            }}
            machineStatus={machineStatusMap?.[m.uid] ?? null}
            statusRefreshing={statusRefreshing}
            onOpenReservation={() => openReservationForMachine(m.uid)}
          />
        ))}
      </div>

      {eventLogRequestId ? (
        <CncEventLogModal
          open={!!eventLogRequestId}
          onOpenChange={(v) => {
            if (!v) setEventLogRequestId(null);
          }}
          mode={{ kind: "request", requestId: eventLogRequestId }}
        />
      ) : null}

      <CncPlaylistDrawer
        open={playlistOpen}
        title={playlistTitle}
        jobs={playlistJobs}
        readOnly={true}
        onClose={() => {
          setPlaylistOpen(false);
        }}
        onOpenCode={() => {
          toast({
            title: "코드 보기",
            description: "코드 보기는 CNC 페이지에서 확인할 수 있습니다.",
          });
        }}
        onDelete={() => {
          toast({
            title: "삭제 불가",
            description: "가공(워크시트)에서는 예약목록을 수정할 수 없습니다.",
            variant: "destructive",
          });
        }}
        onReorder={() => {
          toast({
            title: "순서 변경 불가",
            description: "가공(워크시트)에서는 예약목록을 수정할 수 없습니다.",
            variant: "destructive",
          });
        }}
        onChangeQty={() => {
          toast({
            title: "수량 변경 불가",
            description: "가공(워크시트)에서는 예약목록을 수정할 수 없습니다.",
            variant: "destructive",
          });
        }}
      />
    </div>
  );
};
