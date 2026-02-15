import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import {
  onCncMachiningCompleted,
  onCncMachiningTick,
  onCncMachiningStarted,
} from "@/lib/socket";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import { useCncProgramEditor } from "@/pages/manufacturer/cnc/hooks/useCncProgramEditor";
import { useCncRaw } from "@/pages/manufacturer/cnc/hooks/useCncRaw";
import { useQueueSlots } from "@/pages/manufacturer/cnc/hooks/useQueueSlots";
import { apiFetch } from "@/lib/apiClient";
import { CncCirclePlayPauseButton } from "@/pages/manufacturer/cnc/components/CncCirclePlayPauseButton";
import { Badge } from "@/components/ui/badge";
import { ToastAction } from "@/components/ui/toast";
import { CncEventLogModal } from "@/components/CncEventLogModal";
import { CncProgramEditorPanel } from "@/pages/manufacturer/cnc/components/CncProgramEditorPanel";
import { getMachineStatusDotClass } from "@/pages/manufacturer/cnc/lib/machineStatus";
import { useMachineStatusStore } from "@/store/useMachineStatusStore";
import {
  CncPlaylistDrawer,
  type PlaylistJobItem,
} from "@/pages/manufacturer/cnc/components/CncPlaylistDrawer";

type QueueItem = {
  requestId?: string;
  status?: string;
  queuePosition?: number;
  machiningQty?: number;
  estimatedDelivery?: string | Date;
  diameter?: number;
  diameterGroup?: string;
  paused?: boolean;
  machiningRecord?: {
    status?: string;
    startedAt?: string | Date;
    completedAt?: string | Date;
    durationSeconds?: number;
    elapsedSeconds?: number;
  } | null;
  ncFile?: {
    fileName?: string;
    filePath?: string;
    s3Key?: string;
    s3Bucket?: string;
  } | null;
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
  onToggleNowPlaying: (machineId: string) => void;
  onPlayNextUp: (machineId: string) => void;
  autoEnabled: boolean;
  onToggleAuto: (next: boolean) => void;
  machineStatus?: MachineStatus | null;
  statusRefreshing?: boolean;
  onOpenReservation: () => void;
  onOpenProgramCode?: (prog: any, machineId: string) => void;
  machiningElapsedSeconds?: number | null;
};

const getStatusDotColor = (status?: string) => getMachineStatusDotClass(status);

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
  onToggleNowPlaying,
  onPlayNextUp,
  autoEnabled,
  onToggleAuto,
  machineStatus,
  statusRefreshing,
  onOpenReservation,
  onOpenProgramCode,
  machiningElapsedSeconds,
}: MachineQueueCardProps) => {
  const machiningQueueAll = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q?.status),
  );
  const { currentSlot, nextSlot } = useQueueSlots(machiningQueueAll);

  const headPreloadBadge = getNcPreloadBadge(currentSlot);
  const headRequestId = currentSlot?.requestId
    ? String(currentSlot.requestId)
    : "";

  const totalMachiningCount = machiningQueueAll.length;

  const statusColor = getStatusDotColor(machineStatus?.status);

  const headerTitle = machineName || machineId;

  // Now Playing: currentSlot의 파일명 또는 machineStatus.currentProgram
  const nowPlayingLabel = currentSlot
    ? formatLabel(currentSlot)
    : machineStatus?.currentProgram
      ? String(machineStatus.currentProgram)
      : "없음";

  // Next Up: nextSlot의 파일명 또는 machineStatus.nextProgram
  const nextUpLabel = nextSlot
    ? formatLabel(nextSlot)
    : machineStatus?.nextProgram
      ? String(machineStatus.nextProgram)
      : "없음";

  // 가공 중 상태 판단
  const isMachining = machineStatus?.status
    ? ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
        String(machineStatus.status).toUpperCase().includes(k),
      )
    : false;

  const canToggleNowPlaying = currentSlot != null;
  const canPlayNextUp = nextSlot != null;

  const elapsedLabel = (() => {
    const sec =
      typeof machiningElapsedSeconds === "number" &&
      machiningElapsedSeconds >= 0
        ? Math.floor(machiningElapsedSeconds)
        : null;
    if (sec == null) return "";
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  const machiningRecordSummary = (() => {
    const rec = currentSlot?.machiningRecord ?? null;
    if (!rec) return null;
    const status = String(rec.status || "")
      .trim()
      .toUpperCase();
    const startedAt = rec.startedAt ? new Date(rec.startedAt) : null;
    const completedAt = rec.completedAt ? new Date(rec.completedAt) : null;
    const durationSecRaw =
      typeof rec.durationSeconds === "number"
        ? rec.durationSeconds
        : typeof rec.elapsedSeconds === "number"
          ? rec.elapsedSeconds
          : null;
    const durationSec =
      typeof durationSecRaw === "number" && durationSecRaw >= 0
        ? Math.floor(durationSecRaw)
        : null;

    const toHHMM = (d: Date | null) => {
      if (!d) return "-";
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };

    const toMMSS = (sec: number | null) => {
      if (sec == null) return "-";
      const m = String(Math.floor(sec / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      return `${m}:${s}`;
    };

    const statusLabel =
      status === "COMPLETED"
        ? "가공완료"
        : status === "FAILED"
          ? "가공실패"
          : status === "CANCELED"
            ? "취소"
            : status === "RUNNING"
              ? "가공중"
              : status || "-";

    return {
      statusLabel,
      startedAtLabel: toHHMM(startedAt),
      completedAtLabel: toHHMM(completedAt),
      durationLabel: toMMSS(durationSec),
    };
  })();

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
          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !currentSlot
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!currentSlot) return;
              const nc = currentSlot?.ncFile ?? null;
              const bridgePath = String(nc?.filePath || "").trim();
              const s3Key = String(nc?.s3Key || "").trim();
              const prog = {
                programNo: null,
                name: formatLabel(currentSlot),
                source: bridgePath ? "bridge_store" : "s3",
                bridgePath,
                s3Key,
                requestId: currentSlot?.requestId || "",
              };
              onOpenProgramCode?.(prog, machineId);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  Now Playing
                  {!!elapsedLabel ? (
                    <span className="ml-2 text-blue-600 font-extrabold">
                      {elapsedLabel}
                    </span>
                  ) : null}
                </div>
                {machiningRecordSummary ? (
                  <div className="mt-0.5 text-[11px] font-semibold text-slate-600">
                    <span className="mr-2 font-extrabold text-slate-700">
                      {machiningRecordSummary.statusLabel}
                    </span>
                    <span className="mr-2">
                      시작 {machiningRecordSummary.startedAtLabel}
                    </span>
                    <span className="mr-2">
                      종료 {machiningRecordSummary.completedAtLabel}
                    </span>
                    <span>소요 {machiningRecordSummary.durationLabel}</span>
                  </div>
                ) : null}
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nowPlayingLabel}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CncCirclePlayPauseButton
                  paused={!isMachining}
                  running={isMachining}
                  disabled={!canToggleNowPlaying}
                  title={isMachining ? "정지(Stop)" : "가공 시작"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canToggleNowPlaying) return;
                    onToggleNowPlaying(machineId);
                  }}
                />
                {headRequestId ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRequestLog?.(headRequestId);
                    }}
                  >
                    로그
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={`group rounded-2xl px-4 py-3 border shadow-sm transition-all ${
              !nextSlot
                ? "bg-white/55 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white/85 border-slate-200 hover:bg-white cursor-pointer"
            }`}
            onClick={(e) => {
              if (!nextSlot) return;
              const nc = nextSlot?.ncFile ?? null;
              const bridgePath = String(nc?.filePath || "").trim();
              const s3Key = String(nc?.s3Key || "").trim();
              const prog = {
                programNo: null,
                name: formatLabel(nextSlot),
                source: bridgePath ? "bridge_store" : "s3",
                bridgePath,
                s3Key,
                requestId: nextSlot?.requestId || "",
              };

              onOpenProgramCode?.(prog, machineId);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  Next Up
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nextUpLabel}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(() => {
                  const nextItemPaused = nextSlot?.paused === true;
                  return (
                    <CncCirclePlayPauseButton
                      paused={nextItemPaused}
                      disabled={!canPlayNextUp}
                      title={
                        !canPlayNextUp
                          ? "-"
                          : nextItemPaused
                            ? "자동 시작"
                            : "일시정지"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canPlayNextUp) return;
                        onPlayNextUp(machineId);
                      }}
                    />
                  );
                })()}
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

type MachiningQueueBoardProps = {
  searchQuery?: string;
};

export const MachiningQueueBoard = ({
  searchQuery,
}: MachiningQueueBoardProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { machines, setMachines } = useCncMachines();
  const { callRaw } = useCncRaw();
  const statusByUid = useMachineStatusStore((s) => s.statusByUid);
  const refreshStatuses = useMachineStatusStore((s) => s.refresh);

  const [loading, setLoading] = useState(false);

  const [queueMap, setQueueMap] = useState<QueueMap>({});
  const [machineStatusMap, setMachineStatusMap] = useState<
    Record<string, MachineStatus>
  >({});

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});
  const machiningElapsedBaseRef = useRef<
    Record<string, { elapsedSeconds: number; tickAtMs: number }>
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
  >("");

  const [eventLogRequestId, setEventLogRequestId] = useState<string | null>(
    null,
  );
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistMachineId, setPlaylistMachineId] = useState<string>("");
  const [playlistTitle, setPlaylistTitle] = useState<string>("");
  const [playlistJobs, setPlaylistJobs] = useState<PlaylistJobItem[]>([]);

  const [programEditorError, setProgramEditorError] = useState<string | null>(
    null,
  );
  const [workUid, setWorkUid] = useState<string>("");

  const {
    programEditorOpen,
    programEditorTarget,
    isReadOnly,
    openProgramDetail,
    closeProgramEditor,
    loadProgramCode,
    saveProgramCode,
  } = useCncProgramEditor({
    workUid,
    machines,
    programSummary: null,
    callRaw,
    setError: setProgramEditorError,
    fetchProgramList: async () => {
      // 가공카드에서는 프로그램 리스트 재조회 불필요
    },
  });

  const loadProgramCodeForMachining = useCallback(
    async (prog: any) => {
      const bridgePath = String(
        prog?.bridgePath || prog?.bridge_store_path || prog?.path || "",
      ).trim();
      const requestId = String(prog?.requestId || "").trim();
      const s3Key = String(prog?.s3Key || "").trim();

      // 1) 브리지 스토리지(storage/3-nc 포함)에서 우선 로드
      if (bridgePath && token) {
        const url = `/api/bridge-store/file?path=${encodeURIComponent(bridgePath)}&_ts=${Date.now()}`;
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        const body: any = await res.json().catch(() => ({}));
        if (
          res.ok &&
          body?.success !== false &&
          typeof body?.content === "string"
        ) {
          return body.content;
        }

        // 2) 없으면(DB 메타데이터 기반) S3 → 브리지 storage 로 동기화 후 재시도
        if (requestId && s3Key) {
          const ensureRes = await fetch(
            `/api/requests/by-request/${encodeURIComponent(requestId)}/nc-file/ensure-bridge`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ bridgePath }),
            },
          );
          const ensureBody: any = await ensureRes.json().catch(() => ({}));
          if (!ensureRes.ok || ensureBody?.success === false) {
            throw new Error(
              ensureBody?.message || ensureBody?.error || "NC 파일 동기화 실패",
            );
          }

          const nextPath = String(
            ensureBody?.data?.bridgePath ||
              ensureBody?.data?.filePath ||
              bridgePath,
          ).trim();
          if (nextPath) {
            const retry = await fetch(
              `/api/bridge-store/file?path=${encodeURIComponent(nextPath)}&_ts=${Date.now()}`,
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Cache-Control": "no-cache",
                  Pragma: "no-cache",
                },
              },
            );
            const retryBody: any = await retry.json().catch(() => ({}));
            if (
              retry.ok &&
              retryBody?.success !== false &&
              typeof retryBody?.content === "string"
            ) {
              return retryBody.content;
            }
          }
        }
      }

      // 3) fallback: 기존 CNC 에디터 로더(Hi-link 등)
      return loadProgramCode(prog);
    },
    [loadProgramCode, token],
  );

  const buildPlaylistJobsFromQueue = useCallback((raw: QueueItem[]) => {
    const jobs = (Array.isArray(raw) ? raw : [])
      .filter((q) => isMachiningStatus(q?.status))
      .map((q) => {
        const rid = String(q.requestId || "").trim();
        if (!rid) return null;
        const qty = Math.max(1, Number(q?.machiningQty ?? 1) || 1);
        const nc = q?.ncFile ?? null;
        const bridgePath = String(nc?.filePath || "").trim();
        const s3Key = String(nc?.s3Key || "").trim();
        const s3Bucket = String(nc?.s3Bucket || "").trim();
        return {
          id: rid,
          name: formatLabel(q),
          qty,
          bridgePath,
          s3Key,
          s3Bucket,
          requestId: rid,
          source: bridgePath ? "bridge_store" : s3Key ? "s3" : "db",
        } satisfies PlaylistJobItem;
      })
      .filter(Boolean) as PlaylistJobItem[];
    return jobs;
  }, []);

  const loadProductionQueueForMachine = useCallback(
    async (machineId: string, rawOverride?: QueueItem[]) => {
      const mid = String(machineId || "").trim();
      if (!mid) return;
      const raw = rawOverride ?? queueMap?.[mid] ?? [];
      setPlaylistJobs(buildPlaylistJobsFromQueue(raw));
    },
    [buildPlaylistJobsFromQueue, queueMap],
  );

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
      const uids = (Array.isArray(machines) ? machines : [])
        .map((m) => String(m?.uid || "").trim())
        .filter(Boolean);
      await refreshStatuses({ token, uids });
      setStatusRefreshedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setStatusRefreshError(e?.message || "status proxy failed");
      setStatusRefreshErroredAt(new Date().toLocaleTimeString());
    } finally {
      setStatusRefreshing(false);
    }
  }, [machines, refreshStatuses, token]);

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
      const machine = (Array.isArray(machines) ? machines : []).find(
        (m) => m.uid === uid,
      );

      setPlaylistMachineId(uid);
      setPlaylistTitle(machine?.name || uid);

      void (async () => {
        try {
          await loadProductionQueueForMachine(uid);
          setPlaylistOpen(true);
        } catch (e: any) {
          toast({
            title: "예약목록 조회 실패",
            description: e?.message || "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
        }
      })();
    },
    [loadProductionQueueForMachine, machines, toast],
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

  const toggleNowPlayingForMachine = useCallback(
    async (uid: string) => {
      if (!token) return;

      const local = machineStatusMap?.[uid] ?? null;
      const fromStore = statusByUid?.[uid];
      const statusMerged = String(
        fromStore != null ? fromStore : local?.status || "",
      )
        .trim()
        .toUpperCase();

      const isMachiningNow = ["RUN", "RUNNING", "ONLINE", "OK"].some((k) =>
        statusMerged.includes(k),
      );

      const rawQueue = Array.isArray(queueMap?.[uid]) ? queueMap[uid] : [];
      const machiningQueueAll = rawQueue.filter((x) =>
        isMachiningStatus(x?.status),
      );
      const head = machiningQueueAll[0] ?? null;
      const nc = head?.ncFile ?? null;
      const bridgePath = String(nc?.filePath || "").trim();

      try {
        if (isMachiningNow) {
          const res = await apiFetch({
            path: `/api/machines/${encodeURIComponent(uid)}/stop`,
            method: "POST",
            token,
          });
          const body: any = res.data ?? {};
          if (!res.ok || body?.success === false) {
            throw new Error(body?.message || body?.error || "정지 실패");
          }
          toast({
            title: "가공 정지",
            description: "가공 정지 요청을 보냈습니다.",
          });
          return;
        }

        if (!bridgePath) {
          throw new Error("NC 파일 경로가 없어 시작할 수 없습니다.");
        }

        const allIds = machiningQueueAll
          .map((q) => String((q as any)?.id || (q as any)?._id || "").trim())
          .filter(Boolean);
        const firstId = allIds[0] || "";
        if (!firstId) throw new Error("큐 작업 id가 없어 시작할 수 없습니다.");

        const batchRes = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/batch`,
          method: "POST",
          token,
          jsonBody: {
            order: allIds,
            pauseUpdates: [{ jobId: firstId, paused: false }],
          },
        });
        const batchBody: any = batchRes.data ?? {};
        if (!batchRes.ok || batchBody?.success === false) {
          throw new Error(
            batchBody?.message ||
              batchBody?.error ||
              "브리지 예약 큐 반영에 실패했습니다.",
          );
        }

        toast({
          title: "가공 시작",
          description: "가공 시작 요청을 보냈습니다.",
        });
      } catch (e: any) {
        toast({
          title: "가공 제어 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [machineStatusMap, queueMap, statusByUid, toast, token],
  );

  // WS tick 기반으로 경과시간 업데이트 (DB fetch 없이 실시간 표시)
  useEffect(() => {
    if (!token) return;

    const unsubscribeStarted = onCncMachiningStarted((data) => {
      const mid = String((data as any)?.machineId || "").trim();
      if (!mid) return;
      const startedAtMs = (data as any)?.startedAt
        ? new Date((data as any).startedAt).getTime()
        : Date.now();
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: 0,
        tickAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
    });

    const unsubscribeTick = onCncMachiningTick((data) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      const elapsed =
        typeof (data as any)?.elapsedSeconds === "number"
          ? Math.max(0, Math.floor((data as any).elapsedSeconds))
          : 0;
      const tickAtMs = data?.tickAt
        ? new Date(data.tickAt).getTime()
        : Date.now();

      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: elapsed,
        tickAtMs: Number.isFinite(tickAtMs) ? tickAtMs : Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] === elapsed) return prev;
        return { ...prev, [mid]: elapsed };
      });
    });

    const unsubscribeCompleted = onCncMachiningCompleted((data) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      setMachiningElapsedSecondsMap((prev) => {
        if (prev[mid] == null) return prev;
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      delete machiningElapsedBaseRef.current[mid];
    });

    return () => {
      unsubscribeStarted();
      unsubscribeTick();
      unsubscribeCompleted();
    };
  }, [token]);

  // tick이 듬성듬성 와도 1초 단위로 증가
  useEffect(() => {
    if (!token) return;

    const t = setInterval(() => {
      const base = machiningElapsedBaseRef.current;
      const now = Date.now();
      setMachiningElapsedSecondsMap((prev) => {
        let changed = false;
        const next: Record<string, number> = { ...prev };

        for (const [mid, v] of Object.entries(base)) {
          if (!v) continue;
          const add = Math.max(0, Math.floor((now - v.tickAtMs) / 1000));
          const calc = Math.max(0, Math.floor(v.elapsedSeconds + add));
          if (next[mid] !== calc) {
            next[mid] = calc;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(t);
    };
  }, [token]);

  const playNextUpForMachine = useCallback(
    async (uid: string) => {
      if (!token) return;

      const rawQueue = Array.isArray(queueMap?.[uid]) ? queueMap[uid] : [];
      const machiningQueueAll = rawQueue.filter((x) =>
        isMachiningStatus(x?.status),
      );
      const nextItem = machiningQueueAll[1] ?? null;
      if (!nextItem?.requestId) return;

      try {
        const nextItemId = String(nextItem.requestId);
        const currentPaused = nextItem.paused === true;
        const newPaused = !currentPaused;

        const res = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(uid)}/bridge-queue/${encodeURIComponent(nextItemId)}/pause`,
          method: "PATCH",
          token,
          jsonBody: { paused: newPaused },
        });

        if (!res.ok) {
          throw new Error("pause 상태 변경 실패");
        }

        // 로컬 상태 즉시 업데이트 (UI 반응성)
        setQueueMap((prev) => {
          const updated = { ...prev };
          if (Array.isArray(updated[uid])) {
            updated[uid] = updated[uid].map((item) =>
              item?.requestId === nextItemId
                ? { ...item, paused: newPaused }
                : item,
            );
          }
          return updated;
        });

        toast({
          title: newPaused ? "일시정지" : "재개",
          description: newPaused
            ? "다음 파일이 일시정지 상태로 설정되었습니다."
            : "다음 파일이 자동 시작 상태로 설정되었습니다.",
        });
      } catch (e: any) {
        toast({
          title: "상태 변경 실패",
          description: e?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    },
    [queueMap, toast, token],
  );

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
        {filteredMachines.map((m) =>
          (() => {
            const statusFromStore = statusByUid?.[m.uid];
            const local = machineStatusMap?.[m.uid] ?? null;
            const mergedStatus: MachineStatus | null = local
              ? {
                  ...local,
                  status: String(
                    statusFromStore != null ? statusFromStore : local.status,
                  ).trim(),
                }
              : statusFromStore != null
                ? {
                    uid: m.uid,
                    status: String(statusFromStore).trim(),
                  }
                : null;

            return (
              <MachineQueueCard
                key={m.uid}
                machineId={m.uid}
                machineName={m.name}
                queue={Array.isArray(queueMap?.[m.uid]) ? queueMap[m.uid] : []}
                machiningElapsedSeconds={
                  typeof machiningElapsedSecondsMap?.[m.uid] === "number"
                    ? machiningElapsedSecondsMap[m.uid]
                    : null
                }
                onOpenRequestLog={(requestId) =>
                  setEventLogRequestId(requestId)
                }
                onToggleNowPlaying={(machineId) => {
                  void toggleNowPlayingForMachine(machineId);
                }}
                onPlayNextUp={(machineId) => {
                  void playNextUpForMachine(machineId);
                }}
                autoEnabled={m.allowAutoMachining === true}
                onToggleAuto={(next) => {
                  requestToggleMachineAuto(m.uid, next);
                }}
                machineStatus={mergedStatus}
                statusRefreshing={statusRefreshing}
                onOpenReservation={() => openReservationForMachine(m.uid)}
                onOpenProgramCode={(prog, machineId) => {
                  setWorkUid(machineId);
                  openProgramDetail(prog, machineId);
                }}
              />
            );
          })(),
        )}
      </div>

      {eventLogRequestId ? (
        <CncEventLogModal
          open={!!eventLogRequestId}
          mode={{ kind: "request", requestId: eventLogRequestId }}
          onOpenChange={(next) => {
            if (!next) setEventLogRequestId(null);
          }}
        />
      ) : null}

      <CncPlaylistDrawer
        open={playlistOpen}
        title={playlistTitle}
        jobs={playlistJobs}
        readOnly={false}
        deleteVariant="worksheet"
        onClose={() => {
          setPlaylistOpen(false);
        }}
        onOpenCode={(jobId) => {
          const mid = String(playlistMachineId || "").trim();
          if (!mid) return;
          const job = (Array.isArray(playlistJobs) ? playlistJobs : []).find(
            (j) => j.id === jobId,
          );
          if (!job) return;
          setWorkUid(mid);
          const prog: any = {
            programNo: job.programNo ?? null,
            no: job.programNo ?? null,
            name: job.name,
            source: job.source || "db",
            s3Key: job.s3Key || "",
            s3Bucket: job.s3Bucket || "",
            bridgePath: job.bridgePath || "",
            requestId: job.requestId || "",
            headType: 1,
          };
          void openProgramDetail(prog, mid);
        }}
        onDelete={(jobId) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ deleteRequestIds: [jobId] }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "CAM으로 되돌리기 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "CAM으로 되돌리기 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onReorder={(nextOrder) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ order: nextOrder }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "순서 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "순서 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
        onChangeQty={(jobId, qty) => {
          void (async () => {
            try {
              if (!token) return;
              const mid = String(playlistMachineId || "").trim();
              if (!mid) return;
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(mid)}/production-queue/batch`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    qtyUpdates: [{ requestId: jobId, qty }],
                  }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(
                  body?.message || body?.error || "수량 변경 실패",
                );
              }

              const qRes = await fetch("/api/cnc-machines/queues", {
                headers: { Authorization: `Bearer ${token}` },
              });
              const qBody: any = await qRes.json().catch(() => ({}));
              if (qRes.ok && qBody?.success !== false) {
                const map =
                  qBody?.data && typeof qBody.data === "object"
                    ? qBody.data
                    : {};
                setQueueMap(map);
                const rawNext = Array.isArray(map?.[mid]) ? map[mid] : [];
                setPlaylistJobs(buildPlaylistJobsFromQueue(rawNext));
                await loadProductionQueueForMachine(mid, rawNext);
                return;
              }
              await loadProductionQueueForMachine(mid);
            } catch (e: any) {
              toast({
                title: "수량 변경 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        }}
      />

      {programEditorOpen && programEditorTarget ? (
        <CncProgramEditorPanel
          open={programEditorOpen}
          onClose={closeProgramEditor}
          workUid={workUid}
          selectedProgram={programEditorTarget}
          onLoadProgram={loadProgramCodeForMachining}
          onSaveProgram={saveProgramCode}
          readOnly={isReadOnly}
        />
      ) : null}
    </div>
  );
};
