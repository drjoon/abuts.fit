// change-log:
// - 2026-10-22: tight면 디자인 고치기 / 그대로 가공을 고른다.
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
  /** 백그라운드에서 만드는 완전한 보정 STL. 확인 전에 이 id로 받는다. */
  correctedId?: string;
  /** 평균 필렛 R이 0.50mm 이상. 보정 없이 진행할 수 있다. */
  proceedAsIsAllowed?: boolean;
};

/** 접수 전 가공 검사 결과 안내. tight여도 접수를 막지 않는다. */
export type FilletDesignChoice = "fix" | "asis";

export function StlMachiningPreflightNotice({
  preflight,
  className,
  choice = null,
  onChoice,
  choiceRequired = false,
}: {
  preflight?: StlMachiningPreflight | null;
  className?: string;
  /** @deprecated 보정 진행 확인은 확인 & 다음 단계에서 한다. */
  onCorrectedDownloadClick?: () => void;
  correctedDownloadBusy?: boolean;
  choice?: FilletDesignChoice | null;
  onChoice?: (choice: FilletDesignChoice | null) => void;
  choiceRequired?: boolean;
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
    const pick = (next: FilletDesignChoice) => onChoice?.(choice === next ? null : next);
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border bg-rose-50 px-3.5 py-3 text-center text-rose-950",
          choiceRequired ? "border-rose-400 ring-2 ring-rose-300" : "border-rose-200",
          className,
        )}
        role="alert"
      >
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="whitespace-nowrap text-sm font-semibold leading-5">코너가 공구보다 좁아요</p>
        </div>
        <p className="text-center text-xs leading-5 text-rose-900/80">
          그대로 가공하면 그 코너가 덜 깎입니다.
          <br />
          디자인을 고치면 접착 공간이 커져 헐거워질 수 있습니다.
        </p>
        {onChoice ? (
          <div className="grid w-full max-w-sm grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              className={cn(
                "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                choice === "fix"
                  ? "border-rose-700 bg-rose-700 text-white shadow-sm"
                  : "border-rose-200 bg-white text-rose-950 hover:border-rose-300 hover:bg-rose-100/70",
              )}
              aria-pressed={choice === "fix"}
              onClick={() => pick("fix")}
            >
              디자인 고치기
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                choice === "asis"
                  ? "border-slate-800 bg-slate-800 text-white shadow-sm"
                  : "border-rose-200 bg-white text-rose-950 hover:border-rose-300 hover:bg-rose-100/70",
              )}
              aria-pressed={choice === "asis"}
              onClick={() => pick("asis")}
            >
              그대로 가공
            </button>
          </div>
        ) : null}
        {choiceRequired ? (
          <p className="animate-pulse rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            가공 방법을 고르세요.
          </p>
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
