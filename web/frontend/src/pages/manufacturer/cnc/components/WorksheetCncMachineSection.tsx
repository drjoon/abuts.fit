import { useMemo, useState } from "react";
import { Thermometer, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import type { Machine } from "@/pages/manufacturer/cnc/types";
import { useCncRaw } from "@/pages/manufacturer/cnc/hooks/useCncRaw";
import { useCncTempPanel } from "@/pages/manufacturer/cnc/hooks/useCncTempPanel";
import { useCncToolPanels } from "@/pages/manufacturer/cnc/hooks/useCncToolPanels";
import { CncTempDetailModal } from "@/pages/manufacturer/cnc/components/CncTempDetailModal";
import { CncToolStatusModal } from "@/pages/manufacturer/cnc/components/CncToolStatusModal";
import { useCncWriteGuard } from "@/pages/manufacturer/cnc/hooks/useCncWriteGuard";
import { useToast } from "@/shared/hooks/use-toast";
import { WorksheetDiameterQueueBar } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import {
  WorksheetDiameterQueueModal,
  type WorksheetQueueItem,
} from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";
import type { HealthLevel } from "@/pages/manufacturer/cnc/components/MachineCard";

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

type DiameterBucketKey = "6" | "8" | "10" | "10+";

type MockQueueItem = {
  id: string;
  client: string;
  patient: string;
  tooth: string;
  programName: string;
  qty: number;
};

const mockDiameterQueues: Record<DiameterBucketKey, MockQueueItem[]> = {
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
  "10+": [
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
  diameter?: string | null;
  onChangeDiameter: (value: string) => void;
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
  diameter,
  onChangeDiameter,
}: WorksheetMachineCardProps) => {
  const statusForChip = statusOverride ?? (machine.status as string);
  const [diameterMenuOpen, setDiameterMenuOpen] = useState(false);
  return (
    <div
      className="relative flex flex-col rounded-2xl border bg-white/80 p-4 sm:p-5 shadow-sm transition-all hover:shadow-lg cursor-pointer min-h-[220px] sm:min-h-[240px] border-gray-200"
      onClick={onCardClick}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-gray-900">
            {machine.name}
          </span>
          {getMachineStatusChip(statusForChip)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full w-8 h-8 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-40 text-sm font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              if (loading) return;
              setDiameterMenuOpen((prev) => !prev);
            }}
            disabled={loading}
          >
            {diameter ? (diameter === "10+" ? "10+" : diameter) : "Ø"}
          </button>
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

      {diameterMenuOpen && (
        <>
          {/* 카드 밖 아무 곳이나 클릭해도 메뉴가 닫히도록 전체 오버레이 */}
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setDiameterMenuOpen(false);
            }}
          />
          <div
            className="absolute right-4 top-14 z-40 rounded-xl border border-gray-200 bg-white shadow-lg py-1 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {["6", "8", "10", "10+"].map((value) => (
              <button
                key={value}
                type="button"
                className={`block w-full px-3 py-1.5 text-left hover:bg-gray-100 ${
                  diameter === value
                    ? "font-semibold text-gray-900"
                    : "text-gray-700"
                }`}
                onClick={() => {
                  onChangeDiameter(value);
                  setDiameterMenuOpen(false);
                }}
              >
                {value === "10+" ? "최대 10mm 이상" : `최대 ${value}mm`}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mb-2 text-sm text-muted-foreground space-y-1">
        {machine.lastUpdated && (
          <div className="flex justify-between">
            <span className="font-medium text-slate-700">최근 상태 갱신</span>
            <span>{machine.lastUpdated}</span>
          </div>
        )}
      </div>

      <div className="mt-auto pt-1 text-sm text-slate-800 space-y-1">
        <div className="flex justify-between">
          <span className="font-medium">생산중</span>
          <span className="text-slate-900">-</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium">다음 생산</span>
          <span className="text-slate-900">-</span>
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
  const [tempHealthByUid, setTempHealthByUid] = useState<
    Record<string, HealthLevel>
  >({});
  const [toolHealthByUid, setToolHealthByUid] = useState<
    Record<string, HealthLevel>
  >({});
  const [statusByUid, setStatusByUid] = useState<Record<string, string>>({});
  const [diameterByUid, setDiameterByUid] = useState<Record<string, string>>(
    {}
  );

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

  const { ensureCncWriteAllowed, PinModal } = useCncWriteGuard();
  const { toast } = useToast();

  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [selectedBucket, setSelectedBucket] =
    useState<DiameterBucketKey | null>(null);

  const filteredMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => {
      const fields = [m.name, m.uid as string, m.ip as string].filter(Boolean);
      return fields.some((f) => String(f).toLowerCase().includes(q));
    });
  }, [machines, searchQuery]);

  const diameterQueueSummary = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "10+"];
    const counts = labels.map((label) => mockDiameterQueues[label].length);
    const total = counts.reduce((sum, c) => sum + c, 0);
    return { labels, counts, total };
  }, []);

  const machiningQueues: Record<DiameterBucketKey, WorksheetQueueItem[]> =
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
        "10+": mockDiameterQueues["10+"].map((q) => ({
          id: q.id,
          client: q.client,
          patient: q.patient,
          tooth: q.tooth,
          programText: q.programName,
          qty: q.qty,
        })),
      }),
      []
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

  const handleChangeDiameter = async (uid: string, value: string) => {
    const machine = machines.find((m) => m.uid === uid);
    const rawStatus =
      (statusByUid[uid] as string | undefined) ?? (machine?.status as string);
    const s = (rawStatus || "").toUpperCase();

    // RUN/OK 계열은 실제로 "생산 중" 상태로 보고 직경 변경을 막는다.
    if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) {
      toast({
        title: "생산 중에는 소재 직경을 변경할 수 없습니다.",
        description:
          "생산이 완료되면 직경을 변경하고, 다음 생산 리스트는 대기 큐로 올려 같은 소재 직경 장비로 옮겨주세요.",
        variant: "destructive",
      });
      return;
    }

    const ok = await ensureCncWriteAllowed();
    if (!ok) return;

    setDiameterByUid((prev) => ({ ...prev, [uid]: value }));

    toast({
      title: "소재 직경이 변경되었습니다.",
      description:
        "이 장비의 다음 생산 리스트는 대기 큐로 되돌리고, 새로운 소재 직경에 맞는 다른 장비로 재배치할 수 있습니다.",
    });
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
            {filteredMachines.map((m) => (
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
                diameter={diameterByUid[m.uid] ?? null}
                onChangeDiameter={(value) => {
                  void handleChangeDiameter(m.uid, value);
                }}
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
