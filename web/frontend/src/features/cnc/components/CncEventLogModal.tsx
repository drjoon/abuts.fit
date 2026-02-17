import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type CncEventItem = {
  _id?: string;
  requestId?: string | null;
  machineId?: string | null;
  sourceStep?: string;
  status?: "success" | "failed" | "info" | string;
  eventType?: string;
  message?: string;
  metadata?: any;
  createdAt?: string;
};

type Mode =
  | { kind: "request"; requestId: string; title?: string }
  | { kind: "machine"; machineId: string; title?: string };

export function CncEventLogModal({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: Mode;
}) {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CncEventItem[]>([]);

  const headerTitle = useMemo(() => {
    if (mode.kind === "request") {
      return mode.title || `의뢰 이벤트 (${mode.requestId})`;
    }
    return mode.title || `장비 이벤트 (${mode.machineId})`;
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    if (!token) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const path =
          mode.kind === "request"
            ? `/api/requests/${encodeURIComponent(mode.requestId)}/cnc-events?limit=100`
            : `/api/cnc-machines/${encodeURIComponent(mode.machineId)}/events?limit=100`;
        const res = await apiFetch<any>({ path, method: "GET", token });
        if (!res.ok) {
          throw new Error(res.data?.message || "이벤트 로그 조회 실패");
        }
        const list = res.data?.data?.items;
        setItems(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setError(String(e?.message || "이벤트 로그 조회 실패"));
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [open, token, mode]);

  const statusBadge = (s?: string) => {
    const v = String(s || "").toLowerCase();
    if (v === "success") {
      return (
        <Badge
          variant="outline"
          className="shrink-0 bg-emerald-50 text-[10px] font-extrabold text-emerald-700 border-emerald-200 px-2 py-0.5"
        >
          성공
        </Badge>
      );
    }
    if (v === "failed") {
      return (
        <Badge
          variant="outline"
          className="shrink-0 bg-rose-50 text-[10px] font-extrabold text-rose-700 border-rose-200 px-2 py-0.5"
        >
          실패
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="shrink-0 bg-slate-50 text-[10px] font-extrabold text-slate-700 border-slate-200 px-2 py-0.5"
      >
        {String(s || "INFO").toUpperCase()}
      </Badge>
    );
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{headerTitle}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-slate-500">불러오는 중...</div>
        ) : error ? (
          <div className="text-sm text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-500">표시할 로그가 없습니다.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto space-y-2">
            {items.map((it) => {
              const when = formatTime(it.createdAt);
              const step = String(it.sourceStep || "").trim();
              const typ = String(it.eventType || "").trim();
              const msg = String(it.message || "").trim();
              const err = String(it.metadata?.error || "").trim();
              return (
                <div
                  key={it._id || `${it.createdAt}-${typ}-${step}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[13px] font-extrabold text-slate-900">
                      {when} {typ ? `· ${typ}` : ""} {step ? `· ${step}` : ""}
                    </div>
                    {statusBadge(it.status)}
                  </div>
                  {msg || err ? (
                    <div className="mt-1 text-[12px] font-semibold text-slate-700">
                      {err ? err : msg}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
