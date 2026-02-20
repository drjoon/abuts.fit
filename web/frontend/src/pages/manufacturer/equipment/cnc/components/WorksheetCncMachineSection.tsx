import { useMemo, useState, useCallback, useEffect } from "react";
import { Thermometer, Wrench, Play, Pause, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCncMachines } from "@/features/manufacturer/cnc/hooks/useCncMachines";
import type { Machine } from "@/pages/manufacturer/equipment/cnc/types";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { useCncTempPanel } from "@/features/manufacturer/cnc/hooks/useCncTempPanel";
import { useCncToolPanels } from "@/features/manufacturer/cnc/hooks/useCncToolPanels";
import { useCncContinuous } from "@/features/manufacturer/cnc/hooks/useCncContinuous";
import { CncTempDetailModal } from "@/pages/manufacturer/equipment/cnc/components/CncTempDetailModal";
import { CncToolStatusModal } from "@/pages/manufacturer/equipment/cnc/components/CncToolStatusModal";
import { useCncWriteGuard } from "@/features/manufacturer/cnc/hooks/useCncWriteGuard";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { WorksheetDiameterQueueBar } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import { useToast } from "@/shared/hooks/use-toast";
import type { DiameterBucketKey as UiDiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";

const getMachineStatusChip = (status: string) => {
  const s = (status || "").toUpperCase();

  let color = "bg-gray-400";
  let label = "대기";

  if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) {
    color = "bg-emerald-500";
    label = "생산 중";
  } else if (["WARN", "WARNING"].some((k) => s.includes(k))) {
    color = "bg-amber-400";
    label = "주의";
  } else if (["ALARM", "ERROR", "FAULT"].some((k) => s.includes(k))) {
    color = "bg-red-500";
    label = "알람";
  } else if (["STOP", "IDLE"].some((k) => s.includes(k))) {
    color = "bg-slate-400";
    label = "정지";
  }

  return (
    <div className="flex items-center">
      <div
        className={`w-3.5 h-3.5 rounded-full ${color} shadow-inner`}
        title={label}
      />
    </div>
  );
};

const getHealthColorClass = (level: HealthLevel) => {
  switch (level) {
    case "ok":
      return "text-emerald-500";
    case "warn":
      return "text-amber-500";
    case "alarm":
      return "text-red-500";
    default:
      return "text-slate-400";
  }
};

const getDiameterBucketIndex = (diameter: string | null | undefined) => {
  if (!diameter) return null;
  const value = parseFloat(String(diameter).replace(/[^0-9.]/g, "")) || 0;
  if (value <= 6) return 0;
  if (value <= 8) return 1;
  if (value <= 10) return 2;
  return 3;
};

type ApiDiameterBucketKey = "6" | "8" | "10" | "12";

const formatMachineDiameterLabel = (machine: Machine): string => {
  const diameter = machine.currentMaterial?.diameter;
  if (
    typeof diameter === "number" &&
    Number.isFinite(diameter) &&
    diameter > 0
  ) {
    return `${Number.isInteger(diameter) ? diameter : diameter.toFixed(1)}`;
  }
  const group = machine.currentMaterial?.diameterGroup;
  if (group) {
    const numeric = Number.parseFloat(String(group).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) {
      return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(1)}`;
    }
  }
  return "-";
};

type MockQueueItem = {
  id: string;
  client: string;
  patient: string;
  tooth: string;
  programName: string;
  qty: number;
};

const mockDiameterQueues: Record<UiDiameterBucketKey, MockQueueItem[]> = {
  "6": [
    {
      id: "Q-601",
      client: "서울치과기공소",
      patient: "홍길동",
      tooth: "16",
      programName: "상악 대구치 커스텀 어벗",
      qty: 2,
    },
  ],
  "8": [
    {
      id: "Q-801",
      client: "부산치과기공소",
      patient: "김민수",
      tooth: "35",
      programName: "하악 소구치 어벗",
      qty: 1,
    },
    {
      id: "Q-802",
      client: "대구치과기공소",
      patient: "이수현",
      tooth: "21",
      programName: "전치부 지르코니아",
      qty: 1,
    },
  ],
  "10": [
    {
      id: "Q-1001",
      client: "수원치과기공소",
      patient: "정민호",
      tooth: "11",
      programName: "전치부 브릿지",
      qty: 3,
    },
  ],
  "12": [
    {
      id: "Q-10P1",
      client: "서울프리미엄기공소",
      patient: "박서연",
      tooth: "16/14/11/21/24/26",
      programName: "풀마우스 와이드",
      qty: 6,
    },
  ],
};

interface WorksheetMachineCardProps {
  machine: Machine;
  loading: boolean;
  onTempClick: () => void;
  onToolClick: () => void;
  tempHealth: HealthLevel;
  toolHealth: HealthLevel;
  statusOverride?: string;
  onCardClick: () => void;
  continuousEnabled?: boolean;
}

const WorksheetCncMachineCard = ({
  machine,
  loading,
  onTempClick,
  onToolClick,
  tempHealth,
  toolHealth,
  statusOverride,
  onCardClick,
  continuousEnabled,
}: WorksheetMachineCardProps) => {
  const { state: continuousState } = useCncContinuous(
    continuousEnabled ? machine.uid : null,
  );
  const { token } = useAuthStore();
  const { toast } = useToast();
  const statusForChip = statusOverride ?? (machine.status as string);
  const showContinuousInfo =
    continuousEnabled &&
    continuousState &&
    (continuousState.isRunning || continuousState.nextJob);
  const continuousElapsedMin = continuousState?.isRunning
    ? Math.floor(continuousState.elapsedSeconds / 60)
    : 0;
  const readOnlyDiameterLabel = useMemo(
    () => formatMachineDiameterLabel(machine),
    [machine],
  );

  const handlePlayPauseClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!continuousState?.currentJob || !token) return;

      try {
        if (continuousState.isRunning) {
          // 정지 요청
          const res = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(machine.uid)}/continuous/stop`,
            method: "POST",
            token,
            jsonBody: {},
          });
          const body: any = res.data ?? {};
          if (!res.ok || body?.success === false) {
            throw new Error(body?.message || "정지 요청 실패");
          }
          toast({
            title: "가공 정지",
            description: "가공을 정지했습니다.",
          });
        } else {
          // 시작 요청
          const res = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(machine.uid)}/continuous/play`,
            method: "POST",
            token,
            jsonBody: {},
          });
          const body: any = res.data ?? {};
          if (!res.ok || body?.success === false) {
            throw new Error(body?.message || "가공 시작 실패");
          }
          toast({
            title: "가공 시작",
            description: "가공을 시작했습니다.",
          });
        }
      } catch (e: any) {
        const msg = e?.message ?? "알 수 없는 오류";
        toast({
          title: continuousState.isRunning ? "정지 실패" : "시작 실패",
          description: msg,
          variant: "destructive",
        });
      }
    },
    [
      continuousState?.currentJob,
      continuousState?.isRunning,
      machine.uid,
      token,
      toast,
    ],
  );

  return (
    <div
      className="app-glass-card app-glass-card--lg flex flex-col cursor-pointer min-h-[220px] sm:min-h-[240px] border-gray-200"
      onClick={onCardClick}
    >
      <div className="app-glass-card-content flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-gray-900">
            {machine.name}
          </span>
          {getMachineStatusChip(statusForChip)}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border border-gray-200 bg-white/80 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-gray-700 shadow-sm"
            title="현재 소재 직경"
          >
            {readOnlyDiameterLabel}
          </span>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={(e) => {
              e.stopPropagation();
              if (loading) return;
              onTempClick();
            }}
            disabled={loading}
          >
            <Thermometer
              className={`h-4 w-4 ${getHealthColorClass(tempHealth)}`}
            />
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={(e) => {
              e.stopPropagation();
              if (loading) return;
              onToolClick();
            }}
            disabled={loading}
          >
            <Wrench className={`h-4 w-4 ${getHealthColorClass(toolHealth)}`} />
          </button>
        </div>
      </div>

      {showContinuousInfo && (
        <div className="app-glass-card-content mt-3 rounded-lg bg-purple-50 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-purple-700">연속가공</span>
            {continuousState?.isRunning && (
              <span className="text-purple-600">
                {continuousElapsedMin}분 경과
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-purple-600">
            <span>현재: O{continuousState?.currentSlot}</span>
            <span>→</span>
            <span>대기: O{continuousState?.nextSlot}</span>
          </div>
          {continuousState?.nextJob && (
            <div className="mt-1 text-purple-600 truncate">
              다음: {continuousState.nextJob}
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      <div className="app-glass-card-content mb-2 text-sm text-muted-foreground space-y-1">
        {machine.lastUpdated && (
          <div className="flex justify-between">
            <span className="font-medium text-slate-700">최근 상태 갱신</span>
            <span>{machine.lastUpdated}</span>
          </div>
        )}
      </div>

      <div className="app-glass-card-content mt-auto pt-3 space-y-2">
        {/* Now Playing */}
        <div className="rounded-lg bg-white/60 px-3 py-2 border border-slate-200">
          <div className="text-[11px] font-semibold text-slate-500 mb-1">
            Now Playing
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-slate-900 truncate">
                {continuousState?.currentJob ?? "없음"}
              </div>
            </div>
            <button
              type="button"
              onClick={handlePlayPauseClick}
              disabled={!continuousState?.currentJob}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                continuousState?.isRunning
                  ? "bg-blue-50 border-blue-300 text-blue-600 animate-pulse"
                  : !continuousState?.currentJob
                    ? "bg-slate-200 border-slate-500 text-slate-700 shadow-sm"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
              }`}
              title={continuousState?.isRunning ? "정지(Stop)" : "가공 시작"}
            >
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <Play
                  className={`absolute h-5 w-5 transition-opacity ${
                    continuousState?.isRunning ? "opacity-0" : "opacity-100"
                  } ${!continuousState?.currentJob ? "opacity-80" : ""}`}
                />
                <Pause
                  className={`absolute h-5 w-5 transition-opacity ${
                    continuousState?.isRunning ? "opacity-100" : "opacity-0"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Next Up */}
        <div className="rounded-lg bg-white/60 px-3 py-2 border border-slate-200">
          <div className="text-[11px] font-semibold text-slate-500 mb-1">
            Next Up
          </div>
          <div className="text-sm font-extrabold text-slate-900 truncate">
            {continuousState?.nextJob ?? "없음"}
          </div>
        </div>
      </div>
    </div>
  );
};

interface WorksheetCncMachineSectionProps {
  searchQuery: string;
}

export const WorksheetCncMachineSection = ({
  searchQuery,
}: WorksheetCncMachineSectionProps) => {
  const { machines, loading } = useCncMachines();
  const { callRaw } = useCncRaw();
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuthStore();
  const [tempHealthByUid, setTempHealthByUid] = useState<
    Record<string, HealthLevel>
  >({});
  const [toolHealthByUid, setToolHealthByUid] = useState<
    Record<string, HealthLevel>
  >({});
  const [statusByUid, setStatusByUid] = useState<Record<string, string>>({});

  const { tempModalOpen, tempModalBody, setTempModalOpen, openTempDetail } =
    useCncTempPanel({
      callRaw,
      setError,
      setTempHealth: (uid: string, level: HealthLevel) => {
        if (!uid) return;
        setTempHealthByUid((prev) => ({ ...prev, [uid]: level }));
      },
      setTempTooltip: () => {},
    });

  const [workUid, setWorkUid] = useState<string>("");

  const {
    modalOpen,
    modalTitle,
    modalBody,
    toolLifeDirty,
    toolLifeSaveConfirmOpen,
    setModalOpen,
    setToolLifeDirty,
    setToolLifeSaveConfirmOpen,
    openToolDetail,
  } = useCncToolPanels({
    workUid,
    callRaw,
    ensureCncWriteAllowed: async () => false,
    setError,
    setToolHealth: (level: HealthLevel) => {
      if (!workUid) return;
      setToolHealthByUid((prev) => ({ ...prev, [workUid]: level }));
    },
    setToolTooltip: (_: string) => {},
  });

  const { PinModal } = useCncWriteGuard();

  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] =
    useState<UiDiameterBucketKey | null>(null);

  const [cncMachineMetaMap, setCncMachineMetaMap] = useState<
    Record<string, any>
  >({});

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch("/api/cnc-machines", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) return;
        const list: any[] = Array.isArray(body?.data) ? body.data : [];
        const next: Record<string, any> = {};
        for (const item of list) {
          const machineId = String(item?.machineId || "");
          if (!machineId) continue;
          next[machineId] = item;
        }
        if (mounted) setCncMachineMetaMap(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const mergedMachines: Machine[] = useMemo(() => {
    return (machines || []).map((m) => {
      const meta = cncMachineMetaMap[m.uid];
      if (!meta) return m;

      const normalizeGroup = (g: any) => {
        const raw = String(g || "").trim();
        const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
        if (Number.isFinite(numeric) && numeric > 10) return "12";
        if (Number.isFinite(numeric) && numeric > 0)
          return String(Math.trunc(numeric));
        return raw;
      };
      const normalizedCurrent = meta.currentMaterial
        ? {
            ...meta.currentMaterial,
            diameterGroup: normalizeGroup(meta.currentMaterial?.diameterGroup),
          }
        : undefined;
      const normalizedSchedule = meta.scheduledMaterialChange
        ? {
            ...meta.scheduledMaterialChange,
            newDiameterGroup: normalizeGroup(
              meta.scheduledMaterialChange?.newDiameterGroup,
            ),
          }
        : undefined;
      const normalizedMaxGroups = Array.isArray(meta.maxModelDiameterGroups)
        ? meta.maxModelDiameterGroups.map(normalizeGroup)
        : undefined;

      return {
        ...m,
        currentMaterial: normalizedCurrent || (m as any).currentMaterial,
        scheduledMaterialChange:
          normalizedSchedule || (m as any).scheduledMaterialChange,
        maxModelDiameterGroups:
          normalizedMaxGroups || (m as any).maxModelDiameterGroups,
        dummySettings: meta.dummySettings || (m as any).dummySettings,
      } as any;
    });
  }, [cncMachineMetaMap, machines]);

  const filteredMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => {
      const fields = [m.name, m.uid as string, m.ip as string].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().includes(q));
    });
  }, [machines, searchQuery]);

  const filteredMergedMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mergedMachines;
    return mergedMachines.filter((m) => {
      const fields = [m.name, m.uid as string, m.ip as string].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().includes(q));
    });
  }, [mergedMachines, searchQuery]);

  const diameterQueueSummary = useMemo(() => {
    const labels: UiDiameterBucketKey[] = ["6", "8", "10", "12"];
    const counts = labels.map((label) => mockDiameterQueues[label].length);
    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total };
  }, []);

  const machiningQueues: Record<UiDiameterBucketKey, WorksheetQueueItem[]> =
    useMemo(
      () => ({
        "6": mockDiameterQueues["6"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.programName,
          qty: q.qty,
        })),
        "8": mockDiameterQueues["8"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.programName,
          qty: q.qty,
        })),
        "10": mockDiameterQueues["10"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.programName,
          qty: q.qty,
        })),
        "12": mockDiameterQueues["12"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.programName,
          qty: q.qty,
        })),
      }),
      [],
    );

  const handleTempClick = (machine: Machine) => {
    void openTempDetail(machine.uid);
  };

  const handleToolClick = async (machine: Machine) => {
    try {
      setWorkUid(machine.uid);
      const res = await callRaw(machine.uid, "GetToolLifeInfo");
      const data: any = res?.data ?? res;
      const toolLife =
        data?.machineToolLife?.toolLife ??
        data?.machineToolLife?.toolLifeInfo ??
        [];

      let level: HealthLevel = "unknown";
      if (Array.isArray(toolLife) && toolLife.length) {
        let anyAlarm = false;
        let anyWarn = false;
        for (const t of toolLife) {
          const use = t.useCount ?? 0;
          const cfg = t.configCount ?? 0;
          if (cfg <= 0) continue;
          const ratio = use / cfg;
          if (ratio >= 1) anyAlarm = true;
          else if (ratio >= 0.95) anyWarn = true;
        }
        if (anyAlarm) level = "alarm";
        else if (anyWarn) level = "warn";
        else level = "ok";
      }

      openToolDetail(toolLife, level);
    } catch (e: any) {
      const msg = e?.message ?? "공구 상세 조회 중 오류";
      setError(msg);
      openToolDetail([], "alarm");
    }
  };

  const handleCardClick = async (machine: Machine) => {
    try {
      const res = await callRaw(machine.uid, "GetOPStatus");
      const data: any = res?.data ?? res;
      const resultCode =
        typeof data?.result === "number"
          ? data.result
          : typeof res?.result === "number"
            ? res.result
            : null;

      let status = machine.status || "Unknown";
      if (typeof resultCode === "number") {
        status = resultCode === 0 ? "OK" : "Error";
      }

      setStatusByUid((prev) => ({ ...prev, [machine.uid]: String(status) }));
    } catch (e: any) {
      const msg = e?.message ?? "장비 상태 조회 중 오류";
      setError(msg);
    }
  };

  const handleQueueClick = () => {
    setQueueModalOpen(true);
  };

  return (
    <>
      <div className="flex-1 flex flex-col">
        <div className="space-y-3">
          <WorksheetDiameterQueueBar
            title={`진행중인 의뢰 총 ${diameterQueueSummary.total}건`}
            labels={diameterQueueSummary.labels}
            counts={diameterQueueSummary.counts}
            total={diameterQueueSummary.total}
            onBucketClick={(label) => {
              setSelectedBucket(label);
              setQueueModalOpen(true);
            }}
          />

          <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredMergedMachines.map((m) => (
              <WorksheetCncMachineCard
                key={m.uid}
                machine={m}
                loading={loading}
                onTempClick={() => handleTempClick(m)}
                onToolClick={() => void handleToolClick(m)}
                tempHealth={tempHealthByUid[m.uid] ?? "unknown"}
                toolHealth={toolHealthByUid[m.uid] ?? "unknown"}
                statusOverride={statusByUid[m.uid]}
                onCardClick={() => void handleCardClick(m)}
                continuousEnabled={m.allowAutoMachining === true}
              />
            ))}
          </div>
        </div>

        <CncTempDetailModal
          open={tempModalOpen}
          body={tempModalBody}
          onRequestClose={() => setTempModalOpen(false)}
        />

        <CncToolStatusModal
          open={modalOpen}
          title={modalTitle}
          body={modalBody}
          toolLifeDirty={toolLifeDirty}
          health={"unknown"}
          onRequestClose={() => {
            setToolLifeSaveConfirmOpen(false);
            setToolLifeDirty(false);
            setModalOpen(false);
          }}
          onOpenToolOffsetEditor={() => {}}
          onSave={toolLifeSaveConfirmOpen ? undefined : undefined}
        />

        <WorksheetDiameterQueueModal
          open={queueModalOpen}
          onOpenChange={setQueueModalOpen}
          processLabel="커스텀어벗 > 생산"
          queues={machiningQueues}
          selectedBucket={selectedBucket}
          onSelectBucket={setSelectedBucket}
        />
      </div>
      {PinModal}
    </>
  );
};
