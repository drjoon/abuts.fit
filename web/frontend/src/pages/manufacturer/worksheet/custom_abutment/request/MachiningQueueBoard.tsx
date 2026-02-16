import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import {
  initializeSocket,
  onCncMachiningCompleted,
  onCncMachiningTick,
  onCncMachiningStarted,
} from "@/lib/socket";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import { useCncProgramEditor } from "@/pages/manufacturer/cnc/hooks/useCncProgramEditor";
import { useCncRaw } from "@/pages/manufacturer/cnc/hooks/useCncRaw";
import { apiFetch } from "@/lib/apiClient";
import { getMockCncMachiningEnabled } from "@/lib/bridgeSettings";
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

const resolveCompletedDisplayLabel = (q: QueueItem | null) => {
  if (!q) return "-";
  return formatLabel(q);
};

type MachineStatus = {
  uid: string;
  status?: string;
  currentProgram?: string;
  nextProgram?: string;
};

type LastCompletedMachining = {
  machineId: string;
  jobId: string | null;
  requestId: string | null;
  displayLabel: string | null;
  completedAt: string;
  durationSeconds: number;
};

type NowPlayingHint = {
  machineId: string;
  jobId: string | null;
  requestId: string | null;
  bridgePath: string | null;
  startedAt: string;
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
  onOpenProgramCode?: (prog: any, machineId: string) => void;
  machiningElapsedSeconds?: number | null;
  lastCompleted?: LastCompletedMachining | null;
  nowPlayingHint?: NowPlayingHint | null;
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
  autoEnabled,
  onToggleAuto,
  machineStatus,
  statusRefreshing,
  onOpenReservation,
  onOpenProgramCode,
  machiningElapsedSeconds,
  lastCompleted,
  nowPlayingHint,
}: MachineQueueCardProps) => {
  const { toast } = useToast();
  const token = useAuthStore((s) => s.token);
  const [isMockFromBackend, setIsMockFromBackend] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const enabled = await getMockCncMachiningEnabled(token);
        if (enabled === true) setIsMockFromBackend(true);
        else if (enabled === false) setIsMockFromBackend(false);
      } catch {
        // keep previous state on failure
      }
    })();
  }, [token]);

  const machiningQueueAll = (Array.isArray(queue) ? queue : []).filter((q) =>
    isMachiningStatus(q?.status),
  );

  const { currentSlot, nextSlot } = useMemo(() => {
    const items = Array.isArray(machiningQueueAll) ? machiningQueueAll : [];
    const hintRid = String(nowPlayingHint?.requestId || "").trim();
    const hintJid = String(nowPlayingHint?.jobId || "").trim();
    const hintPath = String(nowPlayingHint?.bridgePath || "").trim();

    const idx =
      hintRid || hintJid || hintPath
        ? items.findIndex((j: any) => {
            const rid = String(j?.requestId || "").trim();
            if (hintRid && rid && rid === hintRid) return true;
            const jid = String(j?.jobId || j?.id || "").trim();
            if (hintJid && jid && jid === hintJid) return true;
            const bp = String(
              j?.ncFile?.filePath || j?.bridgePath || "",
            ).trim();
            if (hintPath && bp && bp === hintPath) return true;
            return false;
          })
        : -1;

    const current = idx >= 0 ? (items[idx] ?? null) : (items[0] ?? null);
    const next = idx >= 0 ? (items[idx + 1] ?? null) : (items[1] ?? null);
    return { currentSlot: current, nextSlot: next };
  }, [machiningQueueAll, nowPlayingHint]);

  const headPreloadBadge = getNcPreloadBadge(currentSlot);
  const headRequestId = currentSlot?.requestId
    ? String(currentSlot.requestId)
    : "";

  const totalMachiningCount = machiningQueueAll.length;

  const statusColor = getStatusDotColor(machineStatus?.status);

  const headerTitle = machineName || machineId;
  const badgeIsMock = isMockFromBackend === true;

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

  const derivedCompleted = lastCompleted;

  const lastCompletedSummary = (() => {
    const base = derivedCompleted;
    if (!base) return null;
    const completedAt = base.completedAt ? new Date(base.completedAt) : null;
    const durationSec =
      typeof base.durationSeconds === "number" && base.durationSeconds >= 0
        ? Math.floor(base.durationSeconds)
        : null;
    const hhmm = completedAt
      ? `${String(completedAt.getHours()).padStart(2, "0")}:${String(
          completedAt.getMinutes(),
        ).padStart(2, "0")}`
      : "-";
    const mmss =
      durationSec == null
        ? "-"
        : `${String(Math.floor(durationSec / 60)).padStart(2, "0")}:${String(
            durationSec % 60,
          ).padStart(2, "0")}`;
    return { completedAtLabel: hhmm, durationLabel: mmss };
  })();

  return (
    <div className="app-glass-card app-glass-card--xl flex flex-col">
      <div className="app-glass-card-content flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-extrabold text-slate-900">
              {headerTitle}
            </div>
            {badgeIsMock ? (
              <Badge
                variant="outline"
                className="shrink-0 bg-violet-50 text-[10px] font-extrabold text-violet-700 border-violet-200 px-2 py-0.5"
              >
                MOCK
              </Badge>
            ) : null}
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
          <div className="group rounded-2xl px-4 py-3 border shadow-sm bg-white/65 border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  Complete
                  <span className="ml-4 mr-4">
                    종료 {lastCompletedSummary?.completedAtLabel || "-"}
                  </span>
                  <span>소요 {lastCompletedSummary?.durationLabel || "-"}</span>
                </div>
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {derivedCompleted
                    ? String(derivedCompleted.displayLabel || "").trim() ||
                      (derivedCompleted.requestId
                        ? `의뢰 (${String(derivedCompleted.requestId)})`
                        : derivedCompleted.jobId
                          ? `작업 (${String(derivedCompleted.jobId)})`
                          : "-")
                    : "없음"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" />
            </div>
          </div>

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
                <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                  {nowPlayingLabel}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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

              <div className="flex items-center gap-2 shrink-0"></div>
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
  const queueMapRef = useRef<QueueMap>({});
  useEffect(() => {
    queueMapRef.current = queueMap;
  }, [queueMap]);

  const refreshProductionQueues = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/cnc-machines/queues", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) return;
      const map = body?.data && typeof body.data === "object" ? body.data : {};
      setQueueMap(map);
    } catch {
      // ignore
    }
  }, [token]);

  const [machineStatusMap, setMachineStatusMap] = useState<
    Record<string, MachineStatus>
  >({});

  const [machiningElapsedSecondsMap, setMachiningElapsedSecondsMap] = useState<
    Record<string, number>
  >({});
  const machiningElapsedBaseRef = useRef<
    Record<string, { elapsedSeconds: number; tickAtMs: number }>
  >({});

  const [lastCompletedMap, setLastCompletedMap] = useState<
    Record<string, LastCompletedMachining>
  >({});

  const [nowPlayingHintMap, setNowPlayingHintMap] = useState<
    Record<string, NowPlayingHint>
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

  useEffect(() => {
    let mounted = true;
    if (!token) return;

    fetch("/api/cnc-machines/machining/last-completed", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((body: any) => ({ res, body })),
      )
      .then(({ res, body }) => {
        if (!mounted) return;
        if (!res.ok || body?.success === false) return;
        const map =
          body?.data && typeof body.data === "object" ? (body.data as any) : {};
        setLastCompletedMap((prev) => ({ ...map, ...prev }));
      })
      .catch(() => {
        // ignore
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    initializeSocket(token);

    const offStarted = onCncMachiningStarted((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      setNowPlayingHintMap((prev) => ({
        ...prev,
        [mid]: {
          machineId: mid,
          jobId: data?.jobId != null ? String(data.jobId).trim() : null,
          requestId:
            data?.requestId != null ? String(data.requestId).trim() : null,
          bridgePath:
            data?.bridgePath != null ? String(data.bridgePath).trim() : null,
          startedAt: String(data?.startedAt || new Date().toISOString()),
        },
      }));
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: 0,
        tickAtMs: Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
      void refreshProductionQueues();
    });

    const offTick = onCncMachiningTick((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;
      const sec =
        typeof data?.elapsedSeconds === "number" && data.elapsedSeconds >= 0
          ? Math.floor(data.elapsedSeconds)
          : null;
      if (sec == null) return;
      machiningElapsedBaseRef.current[mid] = {
        elapsedSeconds: sec,
        tickAtMs: Date.now(),
      };
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: sec }));
    });

    const offCompleted = onCncMachiningCompleted((data: any) => {
      const mid = String(data?.machineId || "").trim();
      if (!mid) return;

      const rid = data?.requestId != null ? String(data.requestId).trim() : "";
      const jid = data?.jobId != null ? String(data.jobId).trim() : "";
      const jobs = Array.isArray(queueMapRef.current?.[mid])
        ? queueMapRef.current[mid]
        : [];
      const found = jobs.find((j) => {
        if (!j || typeof j !== "object") return false;
        const qRid = String((j as any)?.requestId || "").trim();
        if (rid && qRid === rid) return true;
        const qJobId = String((j as any)?.jobId || (j as any)?.id || "").trim();
        if (jid && qJobId === jid) return true;
        return false;
      });
      const displayLabel = found ? resolveCompletedDisplayLabel(found) : rid;

      const durationSeconds = (() => {
        const fromDuration =
          typeof data?.durationSeconds === "number" && data.durationSeconds >= 0
            ? Math.floor(data.durationSeconds)
            : null;
        if (fromDuration != null) return fromDuration;

        const fromElapsed =
          typeof data?.elapsedSeconds === "number" && data.elapsedSeconds >= 0
            ? Math.floor(data.elapsedSeconds)
            : null;
        if (fromElapsed != null) return fromElapsed;

        const fromBase = machiningElapsedBaseRef.current?.[mid]?.elapsedSeconds;
        if (typeof fromBase === "number" && fromBase >= 0) {
          return Math.floor(fromBase);
        }

        const fromMap = machiningElapsedSecondsMap?.[mid];
        if (typeof fromMap === "number" && fromMap >= 0) {
          return Math.floor(fromMap);
        }

        return 0;
      })();

      setLastCompletedMap((prev) => ({
        ...prev,
        [mid]: {
          machineId: mid,
          jobId: data?.jobId != null ? String(data.jobId) : null,
          requestId: data?.requestId != null ? String(data.requestId) : null,
          displayLabel: String(displayLabel || "").trim() || null,
          completedAt: String(data?.completedAt || new Date().toISOString()),
          durationSeconds,
        },
      }));

      setNowPlayingHintMap((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });

      delete machiningElapsedBaseRef.current[mid];
      setMachiningElapsedSecondsMap((prev) => ({ ...prev, [mid]: 0 }));
      void refreshProductionQueues();
    });

    return () => {
      offStarted?.();
      offTick?.();
      offCompleted?.();
    };
  }, [token, refreshProductionQueues]);

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
          allowJobStart: next ? true : target.allowJobStart !== false,
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
                lastCompleted={lastCompletedMap?.[m.uid] || null}
                nowPlayingHint={nowPlayingHintMap?.[m.uid] || null}
                onOpenRequestLog={(requestId) =>
                  setEventLogRequestId(requestId)
                }
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
