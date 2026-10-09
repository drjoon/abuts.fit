// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/hooks/useAutoApprovalGate.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx
import type { GateHoldItem } from "../hooks/useAutoApprovalGate";

const REASON_LABEL: Record<string, string> = {
  missing_filled_stl: "STL 없음",
  missing_finishline: "피니시라인 없음",
  missing_diameter: "직경 없음",
  absurd_diameter: "직경 비정상",
  diameter_over_limit: "직경 초과",
  diameter_group_over_limit: "소재 직경 초과",
  finishline_low_z: "피니시라인 낮음",
  finishline_z_jump: "피니시라인 벽면 이탈",
  finishline_radius_jump: "피니시라인 반경 급변",
  finishline_radius_cv: "피니시라인 반경 불균일",
  finishline_jagged_loop: "피니시라인 들쭉날쭉",
  "cuff_manual-review": "커프 확인 필요",
  "cuff_spec-pending": "커프 규격 대기",
  cuff_failed: "커프 보정 실패",
  cuff_proposal_pending: "커프 제안 대기",
  program_too_large: "NC 용량 초과",
  test_account: "테스트 계정",
  nc_no_coordinates: "NC 좌표 없음",
};

function reasonLabel(code: string): string {
  if (REASON_LABEL[code]) return REASON_LABEL[code];
  const m = /^nc_([xyz])_(below|above)_limit$/.exec(code);
  if (m) return `NC ${m[1].toUpperCase()} 범위 초과`;
  return code;
}

/** 자동 가공이 건너뛴 의뢰. 아침에 작업자가 확인한다. */
export function GateHoldCard({
  items,
  onOpenItem,
}: {
  items: GateHoldItem[];
  onOpenItem?: (item: GateHoldItem) => void;
}) {
  const has = items.length > 0;
  return (
    <div
      className={`rounded-xl border p-3 ${
        has ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div
        className={`flex items-center justify-between text-[11px] font-semibold tracking-wide ${
          has ? "text-amber-700" : "text-slate-500"
        }`}
      >
        <span>HOLD</span>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] ${
            has ? "bg-amber-100" : "bg-slate-100"
          }`}
        >
          보류 {items.length}건
        </span>
      </div>
      {has ? (
        <ul className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto px-1 py-1">
          {items.map((h) => (
            <li
              key={h.requestId}
              role={onOpenItem ? "button" : undefined}
              tabIndex={onOpenItem ? 0 : undefined}
              onClick={onOpenItem ? () => onOpenItem(h) : undefined}
              onKeyDown={
                onOpenItem
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenItem(h);
                      }
                    }
                  : undefined
              }
              className={`rounded-lg border border-amber-100 bg-white px-2 py-1.5 text-[12px] text-slate-700 ${
                onOpenItem ? "cursor-pointer hover:border-amber-300 hover:bg-amber-50/40" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">
                  {[h.clinicName, h.patientName, h.tooth].filter(Boolean).join(" / ") ||
                    h.requestId}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  {h.stage}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {h.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] text-amber-800"
                  >
                    {reasonLabel(r)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-[13px] text-slate-400">없음</div>
      )}
    </div>
  );
}
