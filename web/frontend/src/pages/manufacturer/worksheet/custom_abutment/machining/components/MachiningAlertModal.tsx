// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useMachiningBoard.ts
// change-log:
// - 2026-10-10: 장비별 알람. 헤드·코드·의뢰·시각을 나눠 보여 준다.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export type MachiningAlarmDetail = {
  headType?: number | null;
  type?: string;
  no?: string;
  message?: string;
  displayText?: string;
  source?: string;
};

export type MachiningAlertItem = {
  machineId: string;
  requestId: string | null;
  jobId?: string | null;
  errorCode: string | null;
  message: string;
  alarmText: string;
  reason?: string;
  alarms?: MachiningAlarmDetail[];
  updatedAt: string;
  count: number;
  source?: "live" | "queue";
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineName?: string;
  alerts: MachiningAlertItem[];
  requestLabels?: Record<string, string>;
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

function headLabel(headType: number | null | undefined): string {
  if (headType === 1) return "MAIN";
  if (headType === 2) return "SUB";
  if (headType == null || Number.isNaN(Number(headType))) return "";
  return `HEAD${headType}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[13px]">
      <div className="text-slate-500">{label}</div>
      <div className="min-w-0 break-words font-medium text-slate-800">{value}</div>
    </div>
  );
}

export function MachiningAlertModal({
  open,
  onOpenChange,
  machineName,
  alerts,
  requestLabels,
  onClearAll,
}: Props) {
  const list = Array.isArray(alerts) ? alerts : [];
  const titleName = String(machineName || list[0]?.machineId || "").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {titleName ? `${titleName} 알람` : "CNC 알람"}
            {list.length > 0 ? ` ${list.length}건` : ""}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            이 장비에서 가공 중 감지된 오류입니다.
            <br />
            이 건은 자동으로 다시 가공하지 않습니다.
            <br />
            작업자가 확인한 뒤 수동으로 처리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4 text-sm sm:px-6">
          {list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-6 text-center text-sm text-slate-400">
              표시할 알람이 없습니다.
            </div>
          ) : (
            list.map((alert, index) => {
              const rid = String(alert.requestId || "").trim();
              const label = rid ? requestLabels?.[rid] || "" : "";
              const alarms = Array.isArray(alert.alarms) ? alert.alarms : [];
              const reason = String(alert.reason || alert.message || "").trim();
              return (
                <div
                  key={`${alert.machineId}-${rid}-${alert.updatedAt}-${index}`}
                  className="overflow-hidden rounded-xl border border-destructive-muted bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive-muted/60 bg-destructive-soft/40 px-3 py-2">
                    <div className="text-sm font-semibold text-slate-800">
                      {formatUpdatedAt(alert.updatedAt)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {alert.errorCode ? (
                        <span className="inline-flex items-center rounded-md border border-destructive-muted bg-destructive-soft px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          {alert.errorCode}
                        </span>
                      ) : null}
                      {alert.count > 1 ? (
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {alert.count}회
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-1.5 px-3 py-2.5">
                    <DetailRow label="장비" value={titleName || alert.machineId || ""} />
                    <DetailRow label="의뢰" value={rid} />
                    <DetailRow label="환자" value={label} />
                    <DetailRow
                      label="작업"
                      value={String(alert.jobId || "").trim()}
                    />
                    <DetailRow
                      label="사유"
                      value={
                        reason && reason !== "ALARM" && reason !== "FAILED"
                          ? reason
                          : alert.alarmText || reason
                      }
                    />
                    {alarms.length > 0 ? (
                      <div className="pt-1">
                        <div className="mb-1 text-[12px] text-slate-500">알람</div>
                        <ul className="space-y-1.5">
                          {alarms.map((alarm, alarmIndex) => {
                            const head = headLabel(alarm.headType);
                            const code = [alarm.type, alarm.no]
                              .map((v) => String(v || "").trim())
                              .filter(Boolean)
                              .join("-");
                            const text =
                              String(alarm.displayText || alarm.message || "").trim() ||
                              "CNC 알람";
                            const meta = [head, code ? `type ${code}` : ""]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <li
                                key={`${head}-${code}-${alarmIndex}`}
                                className="rounded-lg border border-destructive-muted/70 bg-destructive-soft/30 px-2.5 py-2"
                              >
                                <div className="text-[13px] font-semibold text-slate-800">
                                  {text}
                                </div>
                                {meta ? (
                                  <div className="mt-0.5 text-[11px] text-slate-500">
                                    {meta}
                                  </div>
                                ) : null}
                                {alarm.message &&
                                alarm.displayText &&
                                alarm.message !== alarm.displayText ? (
                                  <div className="mt-0.5 text-[11px] text-slate-600">
                                    {alarm.message}
                                  </div>
                                ) : null}
                                {alarm.source ? (
                                  <div className="mt-0.5 text-[11px] text-slate-400">
                                    {alarm.source}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : alert.alarmText && alert.alarmText !== reason ? (
                      <DetailRow label="내용" value={alert.alarmText} />
                    ) : null}
                  </div>
                </div>
              );
            })
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
              이 장비 알람 지우기
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
