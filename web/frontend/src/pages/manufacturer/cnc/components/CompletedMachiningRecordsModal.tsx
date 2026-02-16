import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/useAuthStore";

type CompletedMachiningItem = {
  id: string;
  machineId: string;
  requestId: string | null;
  jobId: string | null;
  status: string;
  completedAt: string | null;
  durationSeconds: number;
  displayLabel: string | null;
};

export type CompletedMachiningRecordsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineId: string;
  title?: string;
  pageSize?: number;
};

export const CompletedMachiningRecordsModal = ({
  open,
  onOpenChange,
  machineId,
  title,
  pageSize = 5,
}: CompletedMachiningRecordsModalProps) => {
  const { token } = useAuthStore();
  const [items, setItems] = useState<CompletedMachiningItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const effectiveTitle = useMemo(() => {
    const mid = String(machineId || "").trim();
    return title || (mid ? `${mid} 가공 완료` : "가공 완료");
  }, [machineId, title]);

  const fetchPage = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!token) return;
      const mid = String(machineId || "").trim();
      if (!mid) return;
      if (loading) return;

      setLoading(true);
      setError(null);
      try {
        const nextCursor = opts?.reset ? null : cursor;
        const url = new URL(
          "/api/cnc-machines/machining/completed",
          window.location.origin,
        );
        url.searchParams.set("machineId", mid);
        url.searchParams.set("limit", String(pageSize));
        if (nextCursor) url.searchParams.set("cursor", nextCursor);

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url.pathname + url.search, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          setHasMore(false);
          setError(
            body?.message || body?.error || "완료 목록을 불러오지 못했습니다.",
          );
          return;
        }

        const data = body?.data ?? {};
        const list: CompletedMachiningItem[] = Array.isArray(data?.items)
          ? data.items
          : [];
        const next =
          typeof data?.nextCursor === "string" ? data.nextCursor : null;

        setItems((prev) => {
          const base = opts?.reset ? [] : prev;
          const merged = [...base, ...list];
          const uniq = new Map<string, CompletedMachiningItem>();
          for (const it of merged) {
            if (it?.id) uniq.set(String(it.id), it);
          }
          return Array.from(uniq.values());
        });
        setCursor(next);
        setHasMore(!!next);
      } catch (e: any) {
        const msg =
          e?.name === "AbortError"
            ? "완료 목록 조회가 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요."
            : e?.message || "완료 목록을 불러오지 못했습니다.";
        setHasMore(false);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [cursor, loading, machineId, pageSize, token],
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    void fetchPage({ reset: true });
  }, [open, machineId, fetchPage]);

  useEffect(() => {
    if (!open) return;
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!hasMore || loading) return;
        void fetchPage();
      },
      { root: null, threshold: 1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, loading, fetchPage]);

  const formatRow = (it: CompletedMachiningItem) => {
    const done = it.completedAt ? new Date(it.completedAt) : null;
    const hhmm = done
      ? `${String(done.getHours()).padStart(2, "0")}:${String(
          done.getMinutes(),
        ).padStart(2, "0")}`
      : "-";

    const sec =
      typeof it.durationSeconds === "number" && it.durationSeconds >= 0
        ? Math.floor(it.durationSeconds)
        : null;
    const mmss =
      sec == null
        ? "-"
        : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(
            sec % 60,
          ).padStart(2, "0")}`;

    const label = String(it.displayLabel || "").trim();
    const fallback = it.requestId
      ? `의뢰 (${String(it.requestId)})`
      : it.jobId
        ? `작업 (${String(it.jobId)})`
        : "-";

    return { hhmm, mmss, label: label || fallback };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-2xl max-h-[78vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">
            {effectiveTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 flex flex-col gap-2 overflow-auto pr-1 max-h-[62vh]">
          {!!error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {items.length === 0 && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
              표시할 완료 기록이 없습니다.
            </div>
          )}

          {items.map((it) => {
            const row = formatRow(it);
            return (
              <div
                key={it.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-500">
                      종료 {row.hhmm}
                      <span className="ml-4">소요 {row.mmss}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[15px] font-extrabold text-slate-900">
                      {row.label}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={sentinelRef} className="h-6" />

          {loading && (
            <div className="py-2 text-center text-sm text-slate-500">
              불러오는 중...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
