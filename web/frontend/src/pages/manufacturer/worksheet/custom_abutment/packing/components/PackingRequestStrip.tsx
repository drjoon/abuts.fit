// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingLabelPrintDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// change-log:
// - 2026-11-26: 우측 세로 목록 + 많을 때 overflow-y 스크롤(안쪽 여백).
// - 2026-11-26: 클릭은 선택만(미리보기 자동 오픈 제거). 각인코드는 카드로 고름.
// - 2026-11-26: 세척.패킹 대기 의뢰를 패킹 라벨 모달식 작은 카드 1행(가로 스크롤).
import { cn } from "@/shared/ui/cn";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { extractLotSuffix3 } from "../hooks/usePackingCapture";

const caseText = (
  req: ManufacturerRequest,
  key: "patientName" | "clinicName" | "tooth",
) =>
  String(
    (req.caseInfos as Record<string, unknown> | undefined)?.[key] || "",
  ).trim();

export function PackingRequestStrip({
  requests,
  highlightSuffix,
  selectedId,
  onSelect,
  className,
}: {
  requests: ManufacturerRequest[];
  highlightSuffix?: string;
  selectedId?: string;
  onSelect?: (req: ManufacturerRequest) => void;
  className?: string;
}) {
  const hint = extractLotSuffix3(highlightSuffix);

  if (!requests.length) {
    return (
      <div
        className={cn(
          "rounded-xl border border-stone-200 bg-stone-100 px-3 py-3 text-center text-sm text-stone-500",
          className,
        )}
      >
        세척·패킹 대기 의뢰가 없습니다.
      </div>
    );
  }

  return (
    <ul
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-100 px-1.5 py-1.5",
        className,
      )}
    >
      {requests.map((req) => {
        const id = String(req._id || "");
        const suffix = extractLotSuffix3(req.lotNumber?.value);
        const patient = caseText(req, "patientName");
        const clinic = caseText(req, "clinicName");
        const tooth = caseText(req, "tooth");
        const selected = Boolean(selectedId && selectedId === id);
        const hinted =
          Boolean(hint) &&
          (hint.length < 3 ? suffix.startsWith(hint) : suffix === hint);
        return (
          <li key={id || req.requestId} className="shrink-0">
            <button
              type="button"
              onClick={() => {
                onSelect?.(req);
              }}
              className={cn(
                "w-full rounded-xl border bg-white px-2 py-1.5 text-left transition",
                selected
                  ? "border-stone-900 shadow-sm"
                  : hinted
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-stone-200 hover:border-stone-400",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-sm font-bold tracking-widest text-stone-900">
                  {suffix || "—"}
                </span>
                {tooth ? (
                  <span className="text-[10px] font-semibold tabular-nums text-stone-500">
                    #{tooth}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-stone-700">
                {patient || req.requestId || "—"}
              </div>
              <div className="truncate text-[10px] text-stone-500">
                {clinic || req.requestId || ""}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
