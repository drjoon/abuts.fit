// related files:
// - web/backend/controllers/cnc/autoMachiningGate.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/AutoApprovalGateSwitch.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/GateHoldCard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// change-log:
// - 2026-10-09: 준비·가공이 같은 모듈 상태를 쓴다. 한쪽에서 바꾸면 다른 쪽 스위치도 바로 바뀐다.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

export type GateHoldItem = {
  requestId: string;
  stage: "준비" | "가공";
  machineId: string | null;
  clinicName: string;
  patientName: string;
  tooth: string;
  reasons: string[];
};

export type GateState = {
  enabled: boolean;
  mode: "shadow" | "live";
  holdCount: number;
  wouldApproveCount: number;
  holds: GateHoldItem[];
};

type MachineAuto = {
  uid: string;
  name: string;
  ip?: string;
  port?: number | string;
  allowJobStart: boolean;
  allowProgramDelete: boolean;
  allowRequestAssign: boolean;
  allowAutoMachining: boolean;
};

type Snapshot = {
  gate: GateState | null;
  machines: MachineAuto[];
  busy: boolean;
};

const GATE_PATH = "/api/cnc-machines/machining/auto-gate";

let snapshot: Snapshot = { gate: null, machines: [], busy: false };
let machineGen = 0;
const listeners = new Set<() => void>();
let pollers = 0;
let pollTimer: number | null = null;
let pollToken: string | null = null;
let machineBusy: (uid: string) => boolean = () => false;

function emit() {
  for (const listener of listeners) listener();
}

function commit(partial: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...partial };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeMachineAutoFlags(listener: () => void) {
  return subscribe(listener);
}

export function getMachineAutoFlags() {
  return snapshot.machines;
}

function getSnapshot() {
  return snapshot;
}

function flagKey(list: MachineAuto[]) {
  return list
    .map((m) => `${m.uid}:${m.allowAutoMachining ? 1 : 0}`)
    .sort()
    .join("|");
}

function toMachineAuto(raw: any): MachineAuto | null {
  const uid = String(raw?.uid || "").trim();
  if (!uid || uid === "unassigned") return null;
  return {
    uid,
    name: String(raw?.name || uid),
    ip: raw?.ip,
    port: raw?.port,
    allowJobStart: raw?.allowJobStart !== false,
    allowProgramDelete: raw?.allowProgramDelete === true,
    allowRequestAssign: raw?.allowRequestAssign !== false,
    allowAutoMachining: raw?.allowAutoMachining === true,
  };
}

/** 가공 보드의 장비 목록을 스위치와 맞춘다. 플래그가 같으면 다시 그리지 않는다. */
export function publishMachineAutoFlags(machines: Array<Record<string, unknown> | object>) {
  const next = (Array.isArray(machines) ? machines : [])
    .map((row) => toMachineAuto(row))
    .filter((row): row is MachineAuto => row !== null);
  if (flagKey(next) === flagKey(snapshot.machines)) return;
  machineGen += 1;
  commit({ machines: next });
}

/** 가공 중인 장비는 전역 스위치를 켤 때 추가 트리거를 보내지 않는다. */
export function registerMachineBusyCheck(fn: (uid: string) => boolean) {
  machineBusy = fn;
  return () => {
    if (machineBusy === fn) machineBusy = () => false;
  };
}

async function refresh(token: string) {
  const machinesAtStart = machineGen;
  const [gateRes, machineRes] = await Promise.all([
    apiFetch({ path: GATE_PATH, method: "GET", token, skipCache: true }),
    apiFetch({ path: "/api/machines", method: "GET", token, skipCache: true }),
  ]);
  const gateBody = (gateRes.data as any)?.data;
  const machineBody: any = machineRes.data ?? {};
  const machineList: any[] = machineBody.data ?? machineBody.machines ?? [];
  const next: Partial<Snapshot> = {};
  if (gateRes.ok && gateBody) next.gate = gateBody;
  if (machineRes.ok && machinesAtStart === machineGen) {
    next.machines = machineList
      .map((row) => toMachineAuto(row))
      .filter((row): row is MachineAuto => row !== null);
  }
  if (Object.keys(next).length) commit(next);
}

function retainPoller(token: string) {
  pollers += 1;
  pollToken = token;
  void refresh(token);
  if (pollTimer == null) {
    pollTimer = window.setInterval(() => {
      if (pollToken) void refresh(pollToken);
    }, 30_000);
  }
  return () => {
    pollers -= 1;
    if (pollers > 0) return;
    pollers = 0;
    if (pollTimer != null) window.clearInterval(pollTimer);
    pollTimer = null;
  };
}

async function saveGate(
  token: string,
  patch: Partial<Pick<GateState, "enabled" | "mode">>,
) {
  if (snapshot.busy) return false;
  commit({ busy: true });
  try {
    const res = await apiFetch({
      path: GATE_PATH,
      method: "PUT",
      token,
      jsonBody: patch,
    });
    const next = (res.data as any)?.data;
    if (!res.ok || !next) throw new Error("save failed");
    commit({ gate: next, busy: false });
    return true;
  } catch {
    commit({ busy: false });
    return false;
  }
}

async function applyMachinesAuto(token: string, enabled: boolean) {
  const list = snapshot.machines;
  if (!list.length) return false;
  const prev = list.map((m) => ({ ...m }));
  machineGen += 1;
  commit({
    busy: true,
    machines: list.map((m) => ({ ...m, allowAutoMachining: enabled })),
  });
  try {
    for (const m of prev) {
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
          allowRequestAssign: m.allowRequestAssign !== false,
          allowAutoMachining: enabled,
        },
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || "전체 자동 가공 설정 저장 실패");
      }
      if (enabled && !machineBusy(m.uid)) {
        const resp = await fetch(
          `/api/cnc-machines/machining/auto-trigger/${encodeURIComponent(m.uid)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        const triggerBody: any = await resp.json().catch(() => ({}));
        if (!resp.ok || triggerBody?.success === false) {
          throw new Error(
            triggerBody?.message ||
              triggerBody?.error ||
              `${m.name || m.uid} 자동 가공 트리거 호출 실패`,
          );
        }
      }
    }
    commit({ busy: false });
    return true;
  } catch {
    machineGen += 1;
    commit({ machines: prev, busy: false });
    return false;
  }
}

export function useAutoApprovalGate(token: string | null) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) return;
    return retainPoller(token);
  }, [token]);

  const save = useCallback(
    async (patch: Partial<Pick<GateState, "enabled" | "mode">>) => {
      if (!token) return false;
      return saveGate(token, patch);
    },
    [token],
  );

  const setMachinesAuto = useCallback(
    async (enabled: boolean) => {
      if (!token) return false;
      const ok = await applyMachinesAuto(token, enabled);
      if (!ok) {
        toast({
          title: "전체 자동 가공 설정 실패",
          description: "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return false;
      }
      if (enabled) {
        toast({
          title: "전체 자동 가공 ON",
          description:
            "각 장비의 자동 연속 가공을 활성화했습니다. (가공 중 장비는 완료 후 다음 건부터 적용)",
        });
      }
      return true;
    },
    [token, toast],
  );

  const holdsByMachine = useMemo(() => {
    const map: Record<string, GateHoldItem[]> = {};
    for (const h of snap.gate?.holds || []) {
      if (!h.machineId) continue;
      (map[h.machineId] ||= []).push(h);
    }
    return map;
  }, [snap.gate]);

  const machinesAutoEnabled = useMemo(() => {
    const list = snap.machines;
    if (!list.length) return false;
    return list.every((m) => m.allowAutoMachining === true);
  }, [snap.machines]);

  return {
    state: snap.gate,
    busy: snap.busy,
    save,
    setMachinesAuto,
    machinesAutoEnabled,
    holdsByMachine,
    reload: () => {
      if (token) void refresh(token);
    },
  };
}
