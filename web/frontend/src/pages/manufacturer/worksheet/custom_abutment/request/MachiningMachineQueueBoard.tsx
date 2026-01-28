import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { useCncMachines } from "@/pages/manufacturer/cnc/hooks/useCncMachines";
import { apiFetch } from "@/lib/apiClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type QueueItem = {
  requestId?: string;
  status?: string;
  queuePosition?: number;
  estimatedDelivery?: string | Date;
  diameter?: number;
  diameterGroup?: string;
  clinicName?: string;
  patientName?: string;
};

type QueueMap = Record<string, QueueItem[]>;

type MachineQueueCardProps = {
  machineId: string;
  machineName?: string;
  queue: QueueItem[];
  onOpenMore: () => void;
  autoEnabled: boolean;
  onToggleAuto: (next: boolean) => void;
};

const isMachiningStatus = (status?: string) => {
  // /api/cnc-machines/queues(getProductionQueues)에서 내려오는 status는 Request.status이며
  // 값은 "의뢰" | "CAM" | "생산" 으로 내려온다.
  return String(status || "").trim() === "생산";
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

const MachineQueueCard = ({
  machineId,
  machineName,
  queue,
  onOpenMore,
  autoEnabled,
  onToggleAuto,
}: MachineQueueCardProps) => {
  const machiningQueue = (Array.isArray(queue) ? queue : [])
    .filter((q) => isMachiningStatus(q?.status))
    .slice(0, 5);

  const headerTitle = machineName || machineId;

  return (
    <div className="app-glass-card app-glass-card--xl">
      <div className="app-glass-card-content flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-extrabold text-slate-900">
              {headerTitle}
            </div>
            <Badge
              variant="outline"
              className="shrink-0 bg-white/70 text-[11px] font-extrabold text-slate-700 border-slate-200"
            >
              {machiningQueue.length}건
            </Badge>
            <div
              className="hidden sm:flex items-center gap-2"
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
        </div>

        <button
          type="button"
          className="relative z-10 shrink-0 app-surface app-surface--item px-3 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-white"
          onClick={onOpenMore}
          disabled={!machiningQueue.length}
        >
          더보기
        </button>
      </div>

      <div className="app-glass-card-content mt-4 space-y-2">
        {machiningQueue.length ? (
          machiningQueue.map((q, idx) => (
            <div
              key={`${machineId}:${q.requestId || idx}`}
              className="app-surface app-surface--item flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-extrabold text-slate-800">
                  {formatLabel(q)}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  {q?.diameterGroup ? (
                    <Badge
                      variant="outline"
                      className="bg-white text-[11px] font-extrabold text-slate-700 border-slate-200"
                    >
                      {String(q.diameterGroup)}
                    </Badge>
                  ) : null}
                  {typeof q.queuePosition === "number" ? (
                    <Badge
                      variant="outline"
                      className="bg-white text-[11px] font-extrabold text-slate-700 border-slate-200"
                    >
                      #{q.queuePosition}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-[12px] font-semibold text-slate-500">없음</div>
        )}
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

  const [openMachineId, setOpenMachineId] = useState<string | null>(null);

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

  const openQueueRaw = openMachineId ? queueMap?.[openMachineId] || [] : [];
  const openQueue = (Array.isArray(openQueueRaw) ? openQueueRaw : []).filter(
    (q) => isMachiningStatus(q?.status),
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
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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
            onOpenMore={() => setOpenMachineId(m.uid)}
            autoEnabled={m.allowAutoMachining === true}
            onToggleAuto={(next) => {
              void updateMachineAuto(m.uid, next);
            }}
          />
        ))}
      </div>

      <Dialog
        open={!!openMachineId}
        onOpenChange={(v: boolean) => {
          if (!v) setOpenMachineId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {openMachineId ? `${openMachineId} 전체 큐` : "전체 큐"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto space-y-2">
            {openQueue.length ? (
              openQueue.map((q, idx) => (
                <div
                  key={`${openMachineId}:${q.requestId || idx}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-extrabold text-slate-900">
                      {formatLabel(q)}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      {q?.status ? (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-[11px] font-extrabold text-slate-700 border-slate-200"
                        >
                          {String(q.status)}
                        </Badge>
                      ) : null}
                      {q?.diameterGroup ? (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-[11px] font-extrabold text-slate-700 border-slate-200"
                        >
                          {String(q.diameterGroup)}
                        </Badge>
                      ) : null}
                      {typeof q.queuePosition === "number" ? (
                        <Badge
                          variant="outline"
                          className="bg-slate-50 text-[11px] font-extrabold text-slate-700 border-slate-200"
                        >
                          #{q.queuePosition}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">
                표시할 큐가 없습니다.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
