import { create } from "zustand";

import { apiFetch } from "@/lib/apiClient";

type MachineStatusMap = Record<string, string>;

interface MachineStatusState {
  statusByUid: MachineStatusMap;
  refreshedAt: string | null;
  refreshing: boolean;
  error: string | null;
  refresh: (args: { token: string; uids?: string[] }) => Promise<void>;
  setStatus: (uid: string, status: string) => void;
  clear: () => void;
}

export const useMachineStatusStore = create<MachineStatusState>((set, get) => ({
  statusByUid: {},
  refreshedAt: null,
  refreshing: false,
  error: null,

  refresh: async ({ token, uids }) => {
    if (!token) return;
    if (get().refreshing) return;

    set({ refreshing: true, error: null });
    try {
      const res = await apiFetch({
        path: "/api/machines/status?includeAlarms=1",
        method: "GET",
        token,
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(
          String(body?.message || body?.error || "상태 조회 실패"),
        );
      }

      const list: any[] = Array.isArray(body?.machines)
        ? body.machines
        : Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body?.data?.machines)
            ? body.data.machines
            : [];

      const allow =
        Array.isArray(uids) && uids.length > 0 ? new Set(uids) : null;

      set((prev) => {
        const next: MachineStatusMap = { ...prev.statusByUid };

        // 요청한 uid들은 응답에 누락되더라도 fallback(stale green)을 피하기 위해
        // 항상 statusByUid에 엔트리를 남긴다.
        if (allow) {
          for (const uid of allow) {
            if (!uid) continue;
            if (next[uid] == null) next[uid] = "Unknown";
          }
        }

        for (const it of list) {
          const uid = String(it?.uid || it?.machineId || it?.id || "").trim();
          if (!uid) continue;
          if (allow && !allow.has(uid)) continue;
          next[uid] = String(
            it?.status || it?.state || it?.opStatus || "Unknown",
          ).trim();
        }
        return {
          statusByUid: next,
          refreshedAt: new Date().toLocaleTimeString(),
        } as any;
      });
    } catch (e: any) {
      const message = e?.message ?? "status proxy failed";
      set((prev) => {
        const allow =
          Array.isArray(uids) && uids.length > 0 ? new Set(uids) : null;
        const next: MachineStatusMap = { ...prev.statusByUid };
        const keys = allow ? Array.from(allow) : Object.keys(next);
        for (const uid of keys) {
          if (!uid) continue;
          next[uid] = "ERROR";
        }
        return {
          statusByUid: next,
          refreshedAt: new Date().toLocaleTimeString(),
          error: message,
        } as any;
      });
    } finally {
      set({ refreshing: false });
    }
  },

  setStatus: (uid, status) => {
    const id = String(uid || "").trim();
    if (!id) return;
    set((prev) => ({
      statusByUid: {
        ...prev.statusByUid,
        [id]: String(status || "").trim(),
      },
    }));
  },

  clear: () => set({ statusByUid: {}, refreshedAt: null, error: null }),
}));
