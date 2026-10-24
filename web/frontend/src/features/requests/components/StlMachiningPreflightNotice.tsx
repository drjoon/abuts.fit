// change-log:
// - 2026-10-24: 가공 경고 — 수치와 안내를 위아래로 나눠 한 줄에 읽히게.
// - 2026-10-24: 가공 검사 결과에 포스트 길이(max_z→포스트 탑)를 싣는다.
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
  /** 피니시라인 max_z에서 포스트 탑까지(mm). 피니시라인이 없으면 null. */
  postLengthMm?: number | null;
};

function formatToolRadiusMm(toolRadiusMm?: number | null) {
  const radius = Number(toolRadiusMm);
  return Number.isFinite(radius) && radius > 0 ? radius.toFixed(2) : "0.50";
}

const dockShell = "overflow-hidden rounded-xl border";

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
        <div className="flex items-start gap-3 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
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
        <div className="flex items-start gap-3 bg-rose-50 px-3.5 py-3 text-rose-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
          <div className="min-w-0 flex-1">
            {showFilletMetric ? (
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-medium text-rose-900/75">
                  전체 평균 fillet R
                </span>
                <span className="text-base font-semibold tabular-nums text-rose-700">
                  {avgRadius.toFixed(2)} mm
                </span>
                <span className="text-xs text-rose-900/60">
                  공구 R {formatToolRadiusMm(preflight.toolRadiusMm)}
                </span>
              </p>
            ) : null}
            <p className={cn("text-sm leading-relaxed", showFilletMetric && "mt-1")}>
              마진 코너가 깊게 패입니다.
              <br />
              반경 0.5mm 이상으로 둥글게 디자인해 주세요.
            </p>
          </div>
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
        <div className="flex items-start gap-3 bg-emerald-50 px-3.5 py-3 text-sm leading-relaxed text-emerald-800">
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
      <div className="flex items-start gap-3 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
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
