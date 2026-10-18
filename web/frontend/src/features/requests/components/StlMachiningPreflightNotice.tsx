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
};

const fmtMm = (v?: number | null) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null;

/** 접수 전 가공 검사 결과 안내. tight여도 접수를 막지 않는다. */
export function StlMachiningPreflightNotice({
  preflight,
  className,
}: {
  preflight?: StlMachiningPreflight | null;
  className?: string;
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
    const avg = fmtMm(preflight.averageFilletRadiusMm);
    const suggested = fmtMm(preflight.suggestedFilletRadiusMm) ?? "0.65";
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-xs text-destructive",
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">불완전 가공</p>
          <p className="mt-1 leading-relaxed">
            {avg ? (
              <>
                코너 R은 {avg}mm입니다.
                <br />
              </>
            ) : null}
            {suggested}mm 이상으로 키우면 가공됩니다.
          </p>
        </div>
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
