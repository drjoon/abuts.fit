// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useStlMachiningPreflight.ts
// - web/backend/services/abutmentStl/preflight.service.js
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
  /** 백그라운드에서 만드는 완전한 보정 STL. 확인 전에 이 id로 받는다. */
  correctedId?: string;
};

/** 접수 전 가공 검사 결과 안내. tight여도 접수를 막지 않는다. */
export function StlMachiningPreflightNotice({
  preflight,
  className,
}: {
  preflight?: StlMachiningPreflight | null;
  className?: string;
  /** @deprecated 보정 진행 확인은 확인 & 다음 단계에서 한다. */
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
          "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-center text-rose-950",
          className,
        )}
        role="alert"
      >
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="whitespace-nowrap text-sm font-semibold leading-5">코너가 좁아요</p>
        </div>
        <p className="text-center text-xs leading-5 text-rose-900/80">
          공구에 맞는 디자인으로 바꿔 의뢰합니다.
          <br />
          변경된 디자인을 다운로드해서 보철 내면을 새로 생성하셔야 합니다.
        </p>
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
