// change-log:
// - 2026-10-24: 마진 필레 경고는 깊게 패일 수 있음·반경 0.5mm 재디자인 권고.
// - 2026-10-22: tight 도크 — OK와 같이 2줄·한 줄 배치. fillet R은 경고 문구 왼쪽.
// - 2026-10-22: 신규의뢰 3D 확인 — fillet R·경고를 하단 도크 한 장으로 통합.
// - 2026-10-22: tight는 코너 표시와 깊게 패일 수 있다는 경고만. 원본은 고치지 않는다.
// - 2026-10-21: tight 안내는 평균 R과 관계없이 같은 보정 문구.
// - 2026-10-21: tight 안내 — 접착 공간이 커져 헐거워질 수 있음, 원하면 보정 STL로 크라운 내면.
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
  /** 평균 필렛 R이 0.50mm 이상. */
  proceedAsIsAllowed?: boolean;
};

function formatToolRadiusMm(toolRadiusMm?: number | null) {
  const radius = Number(toolRadiusMm);
  return Number.isFinite(radius) && radius > 0 ? radius.toFixed(2) : "0.50";
}

const dockShell =
  "overflow-hidden rounded-xl border bg-white shadow-sm";

/** 접수 전 가공 검사 결과 안내. tight여도 접수를 막지 않고, 원본 STL은 그대로 둔다. */
export function StlMachiningPreflightNotice({
  preflight,
  className,
}: {
  preflight?: StlMachiningPreflight | null;
  className?: string;
}) {
  if (!preflight) return null;

  const avgRadius = Number(preflight.averageFilletRadiusMm);
  const showFilletMetric =
    preflight.status === "tight" && Number.isFinite(avgRadius);

  if (preflight.status === "checking") {
    return (
      <div
        className={cn(dockShell, "border-slate-200/90", className)}
        role="status"
      >
        <div className="flex items-start gap-2.5 px-3 py-2.5 text-xs text-slate-600">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          <p>
            가공 검사 중입니다.
            <br />
            불완전 가공 구간이 있는지 확인하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (preflight.status === "tight") {
    return (
      <div
        className={cn(dockShell, "border-rose-200/80", className)}
        role="alert"
      >
        <div className="flex items-start gap-2.5 bg-rose-50/70 px-3 py-2.5 text-xs text-rose-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          {showFilletMetric ? (
            <div className="shrink-0 border-r border-rose-200/90 pr-3">
              <p className="font-medium leading-snug text-rose-950/90">
                전체 평균 fillet R
              </p>
              <p className="mt-0.5 tabular-nums leading-snug">
                <span className="font-semibold text-rose-600">
                  {avgRadius.toFixed(2)} mm
                </span>
                <span className="text-rose-900/65">
                  {" "}
                  / 공구 R {formatToolRadiusMm(preflight.toolRadiusMm)}
                </span>
              </p>
            </div>
          ) : null}
          <p className="min-w-0 flex-1 leading-snug text-rose-900/90">
            마진 코너가 깊게 패입니다.
            <br />
            반경 0.5mm 이상으로 둥글게 디자인해 주세요.
          </p>
        </div>
      </div>
    );
  }

  if (preflight.status === "ok") {
    return (
      <div
        className={cn(dockShell, "border-emerald-200/80", className)}
        role="status"
      >
        <div className="flex items-start gap-2.5 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p>
            가공 검사 완료.
            <br />
            불완전 가공 구간이 확인되지 않았습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(dockShell, "border-slate-200/90", className)}
      role="status"
    >
      <div className="flex items-start gap-2.5 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-600">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          가공 검사를 마치지 못했습니다.
          <br />
          이대로 의뢰할 수 있습니다.
          <br />
          제조사에서 다시 확인합니다.
        </p>
      </div>
    </div>
  );
}
