// related files:
// - web/backend/services/abutmentStl/jsPrimary.service.js (productionSchedule.stlJsFallback)
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// change-log:
// - 2026-10-09: 신설. 백엔드 JS 파이프라인 실패 → 원격 Rhino 재처리 중인 건을 준비 페이지 상단에 알린다.
import { AlertTriangle } from "lucide-react";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";

type FallbackRequest = {
  requestId?: string;
  manufacturerStage?: string;
  productionSchedule?: {
    stlPreload?: { status?: string };
    stlJsFallback?: { reason?: string; at?: string | Date };
  };
};

const REASON_LABEL: Record<string, string> = {
  align_failed: "정렬 실패",
  finishline_missing: "피니시라인 없음",
  metadata_missing: "메타데이터 계산 실패",
  diameter_missing: "직경 계산 실패",
  empty_output: "출력 STL 없음",
  original_missing: "원본 STL 없음",
  js_error: "처리 오류",
};

function reasonLabel(raw: string) {
  const key = raw.split(":")[0].trim();
  if (REASON_LABEL[key]) return REASON_LABEL[key];
  if (key.startsWith("finishline_")) return "피니시라인 불량";
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}

/** JS 실패 후 Rhino가 아직 끝나지 않은(GENERATING) 건 또는 Rhino도 실패한(FAILED) 건. */
export function pickStlJsFallbackItems<T extends FallbackRequest>(list: T[]) {
  return list.filter((r) => {
    if (String(r?.manufacturerStage || "").trim() !== "준비") return false;
    if (!r?.productionSchedule?.stlJsFallback?.at) return false;
    const status = String(r?.productionSchedule?.stlPreload?.status || "")
      .trim()
      .toUpperCase();
    return status === "GENERATING" || status === "FAILED";
  });
}

export function StlJsFallbackAlert({ requests }: { requests: FallbackRequest[] }) {
  const items = pickStlJsFallbackItems(requests);
  if (!items.length) return null;

  const failed = items.filter(
    (r) =>
      String(r?.productionSchedule?.stlPreload?.status || "")
        .trim()
        .toUpperCase() === "FAILED",
  ).length;
  const reasons = Array.from(
    new Set(
      items.map((r) => reasonLabel(String(r?.productionSchedule?.stlJsFallback?.reason || ""))),
    ),
  ).slice(0, 3);

  return (
    <div className="px-4 pt-2">
      <div
        role="alert"
        className={`${CONTENT_MEASURED_CHROME_CLASS} flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950`}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0">
          <span className="font-semibold">
            백엔드 STL 처리 {items.length}건에 문제가 있어 원격 Rhino로 처리합니다.
          </span>
          <br />
          {failed > 0
            ? `Rhino도 실패한 건 ${failed}건은 재생성이 필요합니다.`
            : "Rhino 완료 후 자동으로 사라집니다."}
          {reasons.length ? (
            <>
              <br />
              <span className="text-amber-800">{reasons.join(" · ")}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
