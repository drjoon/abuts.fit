import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

const COOLDOWN_MS = 10 * 60 * 1000;

function formatRemainingMs(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function getLastRunAt(key: string) {
  try {
    const raw = localStorage.getItem(key);
    const v = Number(raw || 0);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return v;
  } catch {
    return 0;
  }
}

function setLastRunAt(key: string, at: number) {
  try {
    localStorage.setItem(key, String(at));
  } catch {
    // ignore
  }
}

export function useSnapshotRecalcAll({
  token,
  periodKey,
  onSuccess,
}: {
  token?: string | null;
  periodKey?: string;
  onSuccess?: () => void | Promise<void>;
} = {}) {
  const { toast } = useToast();
  const { user } = useAuthStore();

  const storageKey = useMemo(() => {
    const uid = String(user?.id || "").trim() || "unknown";
    const role = String(user?.role || "").trim() || "unknown";
    return `snapshot:recalc-all:last-run-at:${role}:${uid}`;
  }, [user?.id, user?.role]);

  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const remainingMs = useMemo(() => {
    const lastAt = getLastRunAt(storageKey);
    if (!lastAt) return 0;
    return Math.max(0, lastAt + COOLDOWN_MS - now);
  }, [now, storageKey]);

  useEffect(() => {
    if (remainingMs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [remainingMs]);

  const label = useMemo(() => {
    if (running) return "스냅샷...";
    if (remainingMs > 0) return `스냅샷 (${formatRemainingMs(remainingMs)})`;
    return "스냅샷";
  }, [remainingMs, running]);

  const recalcAll = useCallback(async () => {
    if (!token) return;

    const lastAt = getLastRunAt(storageKey);
    const remaining = lastAt
      ? Math.max(0, lastAt + COOLDOWN_MS - Date.now())
      : 0;
    if (remaining > 0) {
      toast({
        title: "스냅샷 재계산 대기",
        description: `한 번 실행한 뒤 10분 후 가능합니다. ${formatRemainingMs(remaining)} 후 다시 시도해주세요.`,
        duration: 3000,
      });
      return;
    }

    setRunning(true);
    try {
      const qs = new URLSearchParams();
      if (periodKey) qs.set("periodKey", periodKey);
      const res = await apiFetch<any>({
        path: `/api/snapshots/recalc-all${qs.toString() ? `?${qs.toString()}` : ""}`,
        method: "POST",
        token,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "스냅샷 재계산에 실패했습니다.");
      }

      setLastRunAt(storageKey, Date.now());
      setNow(Date.now());

      toast({
        title: "스냅샷 재계산 완료",
        description: "한 번 실행한 뒤 10분 후 다시 실행할 수 있습니다.",
        duration: 3000,
      });

      await onSuccess?.();
    } catch (e: any) {
      toast({
        title: "스냅샷 재계산 실패",
        description: e?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setRunning(false);
    }
  }, [onSuccess, periodKey, storageKey, toast, token]);

  return {
    recalcAll,
    running,
    remainingMs,
    label,
  };
}
