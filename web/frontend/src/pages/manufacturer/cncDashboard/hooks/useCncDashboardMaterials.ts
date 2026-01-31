import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Machine } from "../../cnc/types";
import type { CncMaterialInfo } from "../../cnc/components/CncMaterialModal";

interface CncMachineMeta {
  currentMaterial?: CncMaterialInfo;
  scheduledMaterialChange?: any;
  dummySettings?: {
    enabled?: boolean;
    programName?: string;
    schedules?: any[];
    excludeHolidays?: boolean;
  };
  maxModelDiameterGroups?: ("6" | "8" | "10" | "10+")[];
}

interface Params {
  token: string | null;
  machines: Machine[];
  setMachines: React.Dispatch<React.SetStateAction<Machine[]>>;
  toast: (args: any) => void;
}

export function useCncDashboardMaterials({ token, machines, setMachines, toast }: Params) {
  const [materialChangeModalOpen, setMaterialChangeModalOpen] = useState(false);
  const [materialChangeTarget, setMaterialChangeTarget] = useState<Machine | null>(null);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialModalTarget, setMaterialModalTarget] = useState<Machine | null>(null);

  const [cncMachineMetaMap, setCncMachineMetaMap] = useState<Record<string, CncMachineMeta>>({});

  const refreshCncMachineMeta = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/cnc-machines", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      throw new Error(body?.message || "CNC 소재 정보를 불러오지 못했습니다.");
    }
    const list: any[] = Array.isArray(body?.data) ? body.data : [];
    const nextMap: Record<string, CncMachineMeta> = {};

    for (const item of list) {
      const machineId = String(item?.machineId || "");
      if (!machineId) continue;
      nextMap[machineId] = {
        currentMaterial: item?.currentMaterial || undefined,
        scheduledMaterialChange: item?.scheduledMaterialChange || undefined,
        dummySettings: item?.dummySettings || undefined,
        maxModelDiameterGroups: Array.isArray(item?.maxModelDiameterGroups)
          ? item.maxModelDiameterGroups
          : undefined,
      };
    }

    setCncMachineMetaMap(nextMap);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshCncMachineMeta().catch(() => {});
  }, [refreshCncMachineMeta, token]);

  const mergedMachines: Machine[] = useMemo(() => {
    return machines.map((m) => {
      const meta = cncMachineMetaMap[m.uid];
      if (!meta) return m;
      return {
        ...m,
        currentMaterial: meta.currentMaterial || (m as any).currentMaterial,
        scheduledMaterialChange:
          meta.scheduledMaterialChange || (m as any).scheduledMaterialChange,
        dummySettings: meta.dummySettings || (m as any).dummySettings,
        maxModelDiameterGroups:
          meta.maxModelDiameterGroups || (m as any).maxModelDiameterGroups,
      } as any;
    });
  }, [cncMachineMetaMap, machines]);

  const materialChangeScheduled = useMemo(() => {
    const s: any = materialChangeTarget?.scheduledMaterialChange;
    if (!s || !s.targetTime) return undefined;
    if (!s.newDiameterGroup) return undefined;
    const newDiameter =
      typeof s.newDiameter === "number"
        ? s.newDiameter
        : Number.parseInt(String(s.newDiameterGroup), 10);

    return {
      targetTime: String(s.targetTime),
      newDiameter: Number.isFinite(newDiameter) ? newDiameter : 0,
      newDiameterGroup: String(s.newDiameterGroup),
      notes: s.notes ? String(s.notes) : undefined,
    };
  }, [materialChangeTarget?.scheduledMaterialChange]);

  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const debounceBaselineRef = useRef<Record<string, any>>({});
  const debounceLatestRef = useRef<Record<string, any>>({});

  const scheduleDebounced = useCallback(
    (key: string, nextValue: any, baselineValue: any, commit: () => void) => {
      debounceLatestRef.current[key] = nextValue;

      if (debounceTimersRef.current[key] == null) {
        debounceBaselineRef.current[key] = baselineValue;
      }

      const existing = debounceTimersRef.current[key];
      if (existing) {
        clearTimeout(existing);
      }

      debounceTimersRef.current[key] = setTimeout(() => {
        const latest = debounceLatestRef.current[key];
        const baseline = debounceBaselineRef.current[key];

        debounceTimersRef.current[key] = null;
        delete debounceLatestRef.current[key];
        delete debounceBaselineRef.current[key];

        if (latest === baseline) {
          return;
        }

        commit();
      }, 400);
    },
    [],
  );

  const globalRemoteEnabled = useMemo(() => {
    if (!Array.isArray(machines) || machines.length === 0) return false;
    return machines.every((m) => m.allowJobStart !== false);
  }, [machines]);

  const globalDummyEnabled = useMemo(() => {
    const list = Array.isArray(machines) ? machines : [];
    if (list.length === 0) return false;
    return list.every((m) => cncMachineMetaMap[m.uid]?.dummySettings?.enabled !== false);
  }, [cncMachineMetaMap, machines]);

  const setGlobalRemoteEnabled = useCallback(
    (enabled: boolean) => {
      if (!token) return;

      const list = Array.isArray(machines) ? machines : [];
      if (list.length === 0) return;

      const prevMap = new Map(list.map((m) => [m.uid, m.allowJobStart !== false]));
      const baselineEnabled = globalRemoteEnabled;

      setMachines((prev) => prev.map((m) => ({ ...m, allowJobStart: enabled })));

      scheduleDebounced(
        "global-remote",
        enabled,
        baselineEnabled,
        () => {
          void (async () => {
            try {
              const res = await fetch("/api/cnc-machines/allow-job-start", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ enabled }),
              });
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(body?.message || "원격 가공 설정 저장 실패");
              }
            } catch (e: any) {
              setMachines((prev) =>
                prev.map((m) => ({
                  ...m,
                  allowJobStart: prevMap.get(m.uid) !== false,
                })),
              );
              toast({
                title: "설정 저장 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        },
      );
    },
    [globalRemoteEnabled, machines, scheduleDebounced, setMachines, toast, token],
  );

  const setGlobalDummyEnabled = useCallback(
    (enabled: boolean) => {
      if (!token) return;

      const list = Array.isArray(machines) ? machines : [];
      if (list.length === 0) return;

      const prevMap = new Map(
        list.map((m) => [m.uid, cncMachineMetaMap[m.uid]?.dummySettings?.enabled !== false]),
      );
      const baselineEnabled = globalDummyEnabled;

      setCncMachineMetaMap((prev) => {
        const next = { ...prev };
        for (const m of list) {
          const existing = next[m.uid] || {};
          next[m.uid] = {
            ...existing,
            dummySettings: {
              ...(existing as any).dummySettings,
              enabled,
            },
          } as any;
        }
        return next;
      });

      scheduleDebounced(
        "global-dummy",
        enabled,
        baselineEnabled,
        () => {
          void (async () => {
            try {
              const res = await fetch("/api/cnc-machines/dummy/enabled", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ enabled }),
              });
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(body?.message || "더미 가공 설정 저장 실패");
              }
              await refreshCncMachineMeta();
            } catch (e: any) {
              setCncMachineMetaMap((prev) => {
                const next = { ...prev };
                for (const m of list) {
                  const existing = next[m.uid] || {};
                  next[m.uid] = {
                    ...existing,
                    dummySettings: {
                      ...(existing as any).dummySettings,
                      enabled: prevMap.get(m.uid) !== false,
                    },
                  } as any;
                }
                return next;
              });
              toast({
                title: "설정 저장 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        },
      );
    },
    [cncMachineMetaMap, globalDummyEnabled, machines, refreshCncMachineMeta, scheduleDebounced, toast, token],
  );

  const updateMachineDummyEnabled = useCallback(
    (machineId: string, enabled: boolean) => {
      const uid = String(machineId || "").trim();
      if (!uid || !token) return;

      const prevEnabled = cncMachineMetaMap[uid]?.dummySettings?.enabled !== false;

      setCncMachineMetaMap((prev) => {
        const next = { ...prev };
        const existing = next[uid] || {};
        next[uid] = {
          ...existing,
          dummySettings: {
            ...(existing as any).dummySettings,
            enabled,
          },
        } as any;
        return next;
      });

      scheduleDebounced(
        `dummy:${uid}`,
        enabled,
        prevEnabled,
        () => {
          void (async () => {
            try {
              const res = await fetch(
                `/api/cnc-machines/${encodeURIComponent(uid)}/dummy/enabled`,
                {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ enabled }),
                },
              );
              const body: any = await res.json().catch(() => ({}));
              if (!res.ok || body?.success === false) {
                throw new Error(body?.message || "더미 가공 설정 저장 실패");
              }
              await refreshCncMachineMeta();
            } catch (e: any) {
              setCncMachineMetaMap((prev) => {
                const next = { ...prev };
                const existing = next[uid] || {};
                next[uid] = {
                  ...existing,
                  dummySettings: {
                    ...(existing as any).dummySettings,
                    enabled: prevEnabled,
                  },
                } as any;
                return next;
              });
              toast({
                title: "설정 저장 실패",
                description: e?.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            }
          })();
        },
      );
    },
    [cncMachineMetaMap, refreshCncMachineMeta, scheduleDebounced, toast, token],
  );

  const handleScheduleMaterialChange = useCallback(
    async (data: { targetTime: Date; newDiameter: number; newDiameterGroup: string; notes?: string }) => {
      if (!materialChangeTarget || !token) return;

      const res = await fetch(
        `/api/cnc-machines/${materialChangeTarget.uid}/schedule-material-change`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) {
        throw new Error("소재 교체 예약에 실패했습니다.");
      }

      await refreshCncMachineMeta();
    },
    [materialChangeTarget, refreshCncMachineMeta, token],
  );

  const handleCancelMaterialChange = useCallback(async () => {
    if (!materialChangeTarget || !token) return;

    const res = await fetch(
      `/api/cnc-machines/${materialChangeTarget.uid}/schedule-material-change`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      throw new Error("소재 교체 예약 취소에 실패했습니다.");
    }

    await refreshCncMachineMeta();
  }, [materialChangeTarget, refreshCncMachineMeta, token]);

  const handleReplaceMaterial = useCallback(
    async (next: {
      materialType: string;
      heatNo: string;
      diameter: number;
      diameterGroup: "6" | "8" | "10" | "10+";
      remainingLength: number;
      maxModelDiameterGroups: ("6" | "8" | "10" | "10+")[];
    }) => {
      if (!materialModalTarget || !token) return;
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(materialModalTarget.uid)}/material`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "소재교체에 실패했습니다.");
      }
      await refreshCncMachineMeta();
    },
    [materialModalTarget, refreshCncMachineMeta, token],
  );

  const handleAddMaterial = useCallback(
    async (next: { remainingLength: number }) => {
      if (!materialModalTarget || !token) return;
      const res = await fetch(
        `/api/cnc-machines/${encodeURIComponent(materialModalTarget.uid)}/material-remaining`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(next),
        },
      );
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "소재추가에 실패했습니다.");
      }
      await refreshCncMachineMeta();
    },
    [materialModalTarget, refreshCncMachineMeta, token],
  );

  return {
    cncMachineMetaMap,
    mergedMachines,
    refreshCncMachineMeta,

    materialChangeModalOpen,
    setMaterialChangeModalOpen,
    materialChangeTarget,
    setMaterialChangeTarget,
    materialChangeScheduled,
    handleScheduleMaterialChange,
    handleCancelMaterialChange,

    materialModalOpen,
    setMaterialModalOpen,
    materialModalTarget,
    setMaterialModalTarget,
    handleReplaceMaterial,
    handleAddMaterial,

    globalRemoteEnabled,
    globalDummyEnabled,
    setGlobalRemoteEnabled,
    setGlobalDummyEnabled,
    updateMachineDummyEnabled,
  };
}
