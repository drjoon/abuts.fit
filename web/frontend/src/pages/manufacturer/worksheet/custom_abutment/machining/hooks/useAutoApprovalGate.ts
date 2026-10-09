// related files:
// - web/backend/controllers/cnc/autoMachiningGate.controller.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/AutoApprovalGateSwitch.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/GateHoldCard.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";

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

const PATH = "/api/cnc-machines/machining/auto-gate";

export function useAutoApprovalGate(token: string | null) {
  const [state, setState] = useState<GateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch({ path: PATH, method: "GET", token, skipCache: true });
    const next = (res.data as any)?.data;
    if (res.ok && next) setState(next);
  }, [token]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const save = useCallback(
    async (patch: Partial<Pick<GateState, "enabled" | "mode">>) => {
      if (!token || busy) return false;
      setBusy(true);
      setError(false);
      try {
        const res = await apiFetch({ path: PATH, method: "PUT", token, jsonBody: patch });
        const next = (res.data as any)?.data;
        if (!res.ok || !next) throw new Error("save failed");
        setState(next);
        return true;
      } catch {
        setError(true);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, busy],
  );

  const holdsByMachine = useMemo(() => {
    const map: Record<string, GateHoldItem[]> = {};
    for (const h of state?.holds || []) {
      if (!h.machineId) continue;
      (map[h.machineId] ||= []).push(h);
    }
    return map;
  }, [state]);

  return { state, busy, error, save, reload: load, holdsByMachine };
}
