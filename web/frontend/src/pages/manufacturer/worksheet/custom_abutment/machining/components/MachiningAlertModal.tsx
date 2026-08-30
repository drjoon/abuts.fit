// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export type MachiningAlertItem = {
  machineId: string;
  requestId: string | null;
  errorCode: string | null;
  message: string;
  alarmText: string;
  updatedAt: string;
  count: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: MachiningAlertItem[];
  onClearAll?: () => void;
};

const formatUpdatedAt = (raw: string): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw || "-";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

export function MachiningAlertModal({
  open,
  onOpenChange,
  alerts,
  onClearAll,
}: Props) {
  const list = Array.isArray(alerts) ? alerts : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            CNC 알람 {list.length > 0 ? `${list.length}건` : ""}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            가공 중 감지된 CNC 알람·중단 내역입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 pt-4 pb-4 text-sm sm:px-6">
          {list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-6 text-center text-sm text-slate-400">
              표시할 알람이 없습니다.
            </div>
          ) : (
            list.map((alert) => (
              <div
                key={`${alert.machineId}-${alert.requestId || ""}-${alert.updatedAt}`}
                className="overflow-hidden rounded-xl border border-destructive-muted bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive-muted/60 bg-destructive-soft/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <span>{alert.machineId || "-"}</span>
                    {alert.requestId ? (
                      <span className="font-medium text-slate-600">
                        / {alert.requestId}
                      </span>
                    ) : null}
                    {alert.errorCode ? (
                      <span className="inline-flex items-center rounded-md border border-destructive-muted bg-destructive-soft px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        {alert.errorCode}
                      </span>
                    ) : null}
                    {alert.count > 1 ? (
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        ×{alert.count}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] font-medium text-slate-500">
                    {formatUpdatedAt(alert.updatedAt)}
                  </div>
                </div>
                <div className="space-y-1 px-3 py-2.5">
                  <div className="text-sm font-medium text-slate-800">
                    {alert.alarmText || alert.message || "CNC 알람"}
                  </div>
                  {alert.message &&
                  alert.alarmText &&
                  alert.message !== alert.alarmText &&
                  alert.message !== "ALARM" &&
                  alert.message !== "FAILED" ? (
                    <div className="text-[11px] text-slate-500">
                      {alert.message}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {list.length > 0 && onClearAll ? (
          <div className="shrink-0 border-t border-slate-100 px-5 py-3 sm:px-6">
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => {
                onClearAll();
                onOpenChange(false);
              }}
            >
              알람 모두 지우기
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
