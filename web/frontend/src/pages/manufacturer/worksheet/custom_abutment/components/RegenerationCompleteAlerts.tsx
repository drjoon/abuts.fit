// change-log:
// - 2026-08-18: Filled STL/NC 재생성 완료 배너. 클릭 시 해당 의뢰 프리뷰를 연다.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
// - web/frontend/src/shared/ui/dashboard/WorksheetQueueSummary.tsx
import { RefreshCw, X } from "lucide-react";
import type { ManufacturerRequest } from "../utils/request";

export type RegenerationCompleteAlert = {
  id: string;
  kind: "filled" | "nc";
  requestId: string;
  requestMongoId?: string;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  createdAt: number;
  request?: ManufacturerRequest | null;
};

type Props = {
  alerts: RegenerationCompleteAlert[];
  onOpen: (alert: RegenerationCompleteAlert) => void;
  onDismiss: (id: string) => void;
};

const buildCaseLabel = (alert: RegenerationCompleteAlert) => {
  const parts = [alert.clinicName, alert.patientName, alert.tooth]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.join(" / ");
};

export function RegenerationCompleteAlerts({ alerts, onOpen, onDismiss }: Props) {
  if (!alerts.length) return null;

  return (
    <div className="mt-2 space-y-2">
      {alerts.map((alert) => {
        const caseLabel = buildCaseLabel(alert);
        const title =
          alert.kind === "filled"
            ? "Filled STL을 재생성했습니다"
            : "NC 코드를 재생성했습니다";
        return (
          <div
            key={alert.id}
            className="flex items-stretch overflow-hidden rounded-xl border border-primary-muted bg-primary-soft"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left hover:bg-primary-muted/30"
              onClick={() => onOpen(alert)}
            >
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-primary-strong">
                  {title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-600">
                  {alert.requestId}
                  {caseLabel ? ` · ${caseLabel}` : ""}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  클릭하면 의뢰 상세를 엽니다
                </span>
              </span>
            </button>
            <button
              type="button"
              className="inline-flex w-9 shrink-0 items-center justify-center border-l border-primary-muted/60 text-primary-strong hover:bg-primary-muted/40"
              onClick={() => onDismiss(alert.id)}
              title="알림 닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
