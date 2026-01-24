import { useCallback, useRef, useState } from "react";

import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { applyProgramNoToContent } from "../lib/programNaming";

const ensureFanucName = (slot: number) =>
  `O${String(slot).padStart(4, "0")}.nc`;

export const useCncQueueUpload = () => {
  const { token } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const nextSlotMapRef = useRef<Record<string, number>>({});

  const refreshNextSlot = useCallback(
    async (machineId: string): Promise<number> => {
      const mid = String(machineId || "").trim();
      if (!mid || !token) return 3000;
      try {
        const res = await apiFetch({
          path: `/api/cnc-machines/${encodeURIComponent(mid)}/continuous/state`,
          method: "GET",
          token,
        });
        if (!res.ok) return 3000;
        const payload: any = res.data ?? {};
        const data = payload?.data ?? payload;
        const nextSlot = Number(data?.nextSlot);
        const currentSlot = Number(data?.currentSlot);
        const resolved = Number.isFinite(nextSlot)
          ? nextSlot
          : Number.isFinite(currentSlot)
            ? currentSlot === 3000
              ? 3001
              : 3000
            : 3000;
        nextSlotMapRef.current = {
          ...nextSlotMapRef.current,
          [mid]: resolved,
        };
        return resolved;
      } catch {
        nextSlotMapRef.current = {
          ...nextSlotMapRef.current,
          [mid]: 3000,
        };
        return 3000;
      }
    },
    [token],
  );

  const allocateNextSlot = useCallback((machineId: string) => {
    const mid = String(machineId || "").trim();
    const cur = Number.isFinite(nextSlotMapRef.current[mid])
      ? Number(nextSlotMapRef.current[mid])
      : 3000;
    const next = cur === 3000 ? 3001 : 3000;
    nextSlotMapRef.current = {
      ...nextSlotMapRef.current,
      [mid]: next,
    };
    return cur;
  }, []);

  const uploadLocalFiles = useCallback(
    async (machineId: string, files: FileList | File[]) => {
      const mid = String(machineId || "").trim();
      if (!mid || !token) return;
      const list = Array.from(files || []);
      if (list.length === 0) return;

      setUploading(true);
      try {
        await refreshNextSlot(mid);

        await apiFetch({
          path: "/api/bridge-store/mkdir",
          method: "POST",
          token,
          jsonBody: { path: mid },
        }).catch(() => {});

        for (const file of list) {
          const raw = await file.text();
          const slot = allocateNextSlot(mid);
          const fileName = ensureFanucName(slot);
          const content = applyProgramNoToContent(slot, raw);
          const bridgePath = `${mid}/${fileName}`;

          const saveRes = await apiFetch({
            path: "/api/bridge-store/file",
            method: "POST",
            token,
            jsonBody: { path: bridgePath, content },
          });
          if (!saveRes.ok) {
            const body: any = saveRes.data ?? {};
            throw new Error(
              body?.message || body?.error || "브리지 스토어 저장 실패",
            );
          }

          const enqueueRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(mid)}/continuous/enqueue`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              bridgePath,
              requestId: null,
            },
          });
          const enqueueBody: any = enqueueRes.data ?? {};
          if (!enqueueRes.ok || enqueueBody?.success === false) {
            throw new Error(
              enqueueBody?.message ||
                enqueueBody?.error ||
                "브리지 연속 가공 큐 등록 실패",
            );
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [allocateNextSlot, refreshNextSlot, token],
  );

  return {
    uploading,
    uploadLocalFiles,
    refreshNextSlot,
  };
};
