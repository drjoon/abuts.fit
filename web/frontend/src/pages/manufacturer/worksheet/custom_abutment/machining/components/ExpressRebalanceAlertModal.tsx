// related files:
// - web/backend/controllers/requests/expressDeadlineRebalance.utils.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ExpressRebalanceMachineItem = {
  requestId?: string;
  estimateLabel?: string;
  estimatedCompleteAtLabel?: string;
  isTodayExpress?: boolean;
  isRunning?: boolean;
  maxDiameter?: number | null;
  totalLength?: number | null;
  shippingMode?: string | null;
  clinicName?: string | null;
  patientName?: string | null;
  tooth?: string | null;
  fastMachiningRebalance?: unknown;
};

export type ExpressRebalanceMachine = {
  machineId: string;
  materialDiameter?: number | null;
  items?: ExpressRebalanceMachineItem[];
  estimatedQueueCompleteAtLabel?: string | null;
  todayExpressCompleteAtLabel?: string | null;
  missesDeadline?: boolean;
};

export type ExpressRebalanceAlert = {
  id?: string;
  summary?: string;
  createdAt?: string;
  deadlineAtLabel?: string;
  moved?: Array<{
    requestId?: string;
    fromMachineId?: string;
    toMachineId?: string;
    fromDiameter?: number | null;
    toDiameter?: number | null;
    espritRetriggered?: boolean;
  }>;
  estimate?: {
    label?: string;
    secondsPerMm?: number;
    sampleCount?: number;
    usedFallback?: boolean;
    maxSample?: {
      requestId?: string;
      totalLength?: number;
      durationSeconds?: number;
      secondsPerMm?: number;
    } | null;
  } | null;
  machines?: ExpressRebalanceMachine[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert: ExpressRebalanceAlert | null;
};

export function ExpressRebalanceAlertModal({
  open,
  onOpenChange,
  alert,
}: Props) {
  const machines = Array.isArray(alert?.machines) ? alert.machines : [];
  const moved = Array.isArray(alert?.moved) ? alert.moved : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>빠른 가공 재배치</DialogTitle>
          <DialogDescription>
            {alert?.summary ||
              "신속배송 14시 가공 완료를 위한 여유 장비 재배치 결과입니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <div className="font-bold">
              목표 마감: {alert?.deadlineAtLabel || "오늘 14:00"}
            </div>
            {moved.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]">
                {moved.map((m) => (
                  <li key={`${m.requestId}-${m.toMachineId}`}>
                    {m.requestId}: {m.fromMachineId}
                    {m.fromDiameter != null ? `(${m.fromDiameter}mm)` : ""} →{" "}
                    {m.toMachineId}
                    {m.toDiameter != null ? `(${m.toDiameter}mm)` : ""}
                    {m.espritRetriggered ? " · Esprit NC 재생성" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {alert?.estimate?.label ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
              <div className="font-bold text-slate-800">가공시간 예측 기준</div>
              <div className="mt-0.5">{alert.estimate.label}</div>
              {alert.estimate.maxSample ? (
                <div className="mt-1 text-slate-500">
                  최댓값 샘플: {alert.estimate.maxSample.requestId} · 길이{" "}
                  {alert.estimate.maxSample.totalLength}mm ·{" "}
                  {Math.round(alert.estimate.maxSample.durationSeconds / 60)}분
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {machines.map((machine) => (
              <div
                key={machine.machineId}
                className="rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                  <div className="font-extrabold text-slate-800">
                    {machine.machineId}
                    {machine.materialDiameter != null
                      ? ` · 소재 ${machine.materialDiameter}mm`
                      : ""}
                    {machine.missesDeadline ? (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        14시 위험
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    예상 완료{" "}
                    {machine.todayExpressCompleteAtLabel ||
                      machine.estimatedQueueCompleteAtLabel ||
                      "-"}
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {(machine.items || []).length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-slate-400">
                      대기 없음
                    </div>
                  ) : (
                    (machine.items || []).map((item) => (
                      <div
                        key={`${machine.machineId}-${item.requestId}`}
                        className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
                            <span>{item.requestId || "-"}</span>
                            {item.isTodayExpress ? (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                당일신속
                              </span>
                            ) : null}
                            {item.fastMachiningRebalance ? (
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                                빠른 가공 재배치
                              </span>
                            ) : null}
                            {item.isRunning ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                가공중
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {[item.clinicName, item.patientName, item.tooth]
                              .filter(Boolean)
                              .join(" / ") || "-"}
                            {item.maxDiameter != null
                              ? ` · Ø${item.maxDiameter}`
                              : ""}
                            {item.totalLength != null
                              ? ` · L${item.totalLength}`
                              : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-slate-600">
                          <div className="font-bold">
                            {item.estimateLabel || "-"}
                          </div>
                          <div>완료 {item.estimatedCompleteAtLabel || "-"}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-bold text-slate-700">
                  장비 예상 완료:{" "}
                  {machine.estimatedQueueCompleteAtLabel || "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
