// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useStlMachiningPreflight.ts
// - web/backend/services/abutmentStl/preflight.service.js
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import type { StlMetadata } from "@/features/requests/hooks/useStlMetadata";

export type StlMachiningPreflight = {
  status: "checking" | "tight" | "ok" | "unknown";
  tightCount?: number;
  averageFilletRadiusMm?: number | null;
  minFilletRadiusMm?: number | null;
  toolRadiusMm?: number | null;
  suggestedFilletRadiusMm?: number | null;
  reason?: string;
  /** 원본 STL 좌표의 불완전 가공 면. 프리뷰에 빨갛게 얹는다. */
  overlay?: StlMetadata["tightCorner"];
};

/** 접수 전 가공 검사 결과 안내. tight여도 접수를 막지 않는다. */
export function StlMachiningPreflightNotice({
  preflight,
  className,
  onCorrectedDownloadClick,
  correctedDownloadBusy = false,
}: {
  preflight?: StlMachiningPreflight | null;
  className?: string;
  /** 불완전 가공일 때 보정 STL 다운로드(확인은 부모에서). */
  onCorrectedDownloadClick?: () => void;
  correctedDownloadBusy?: boolean;
}) {
  if (!preflight) return null;

  if (preflight.status === "checking") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600",
          className,
        )}
        role="status"
      >
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <p>
          가공 검사 중입니다.
          <br />
          불완전 가공 구간이 있는지 확인하고 있습니다.
        </p>
      </div>
    );
  }

  if (preflight.status === "tight") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-rose-950",
          className,
        )}
        role="alert"
      >
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="whitespace-nowrap text-sm font-semibold leading-5">코너가 좁아요</p>
        </div>
        <p className="min-w-0 flex-1 text-xs leading-5 text-rose-900/80">
          다운로드하여 보철을 다시 디자인해야 합니다.
          <br />
          변경된 형태로 가공됩니다.
        </p>
        {onCorrectedDownloadClick ? (
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 rounded-full bg-rose-600 px-3.5 text-white hover:bg-rose-700"
            disabled={correctedDownloadBusy}
            onClick={onCorrectedDownloadClick}
          >
            {correctedDownloadBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            보정 디자인 확인
          </Button>
        ) : null}
      </div>
    );
  }

  if (preflight.status === "ok") {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700",
          className,
        )}
        role="status"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          가공 검사 완료.
          <br />
          불완전 가공 구간이 확인되지 않았습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600",
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        가공 검사를 마치지 못했습니다.
        <br />
        이대로 의뢰할 수 있습니다.
        <br />
        제조사에서 다시 확인합니다.
      </p>
    </div>
  );
}
