// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncToolStatusModal.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolPanels.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots.tsx
import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import type {
  ToolSlot,
} from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots";

export type ToolLifeRow = {
  toolNum: number;
  useCount: number;
  configCount: number;
  warningCount: number;
  use: boolean;
};

type ToolingSummary = {
  warningCount?: number;
  alarmCount?: number;
  dueTools?: Array<{ toolNum?: number }>;
  tools?: Array<{
    toolNum?: number | string;
    status?: string;
    predictedReplacementUseCount?: number;
  }>;
};

interface CncToolStatusPanelProps {
  rows: ToolLifeRow[];
  toolSlots: ToolSlot[];
  toolingSummary: ToolingSummary | null;
  canAddTool: boolean;
  canBeginRemoval: boolean;
  onAddTool: () => void;
  onOpenOffset: (toolNum: number) => void;
  onConfigChange: (index: number, configCount: number) => void;
  onConfigBlur: () => void;
  onRequestRemoval: (row: ToolLifeRow, slot: ToolSlot | null) => void;
  onCompleteReplacement: (row: ToolLifeRow, slot: ToolSlot | null) => void;
}

function rowHealth(args: {
  use: number;
  cfg: number;
  toolMeta?: {
    status?: string;
    predictedReplacementUseCount?: number;
  };
  isBusy: boolean;
}): HealthLevel {
  const { use, cfg, toolMeta, isBusy } = args;
  if (isBusy) return "warn";
  if (toolMeta?.status === "alarm") return "alarm";
  if (toolMeta?.status === "warn") return "warn";
  if (toolMeta?.status === "ok") return "ok";
  if (cfg <= 0) return "unknown";
  const predicted = Number(toolMeta?.predictedReplacementUseCount || 0);
  const ratio = predicted > 0 ? use / predicted : use / cfg;
  if (ratio >= 1) return "alarm";
  if (ratio >= 0.95) return "warn";
  return "ok";
}

function remainRatio(use: number, cfg: number, predicted: number): number | null {
  if (predicted > 0) return Math.max(0, 1 - use / predicted);
  if (cfg > 0) return Math.max(0, 1 - use / cfg);
  return null;
}

function summaryLine(summary: ToolingSummary | null): string {
  const dueTools = Array.isArray(summary?.dueTools) ? summary.dueTools : [];
  if (dueTools.length === 0) return "교체 임박 공구 없음";
  const head = dueTools
    .slice(0, 3)
    .map((item) => `#${item.toolNum}`)
    .join(", ");
  const suffix = dueTools.length > 3 ? ` 외 ${dueTools.length - 3}개` : "";
  return `교체 임박 ${head}${suffix}`;
}

const STATUS_DOT: Record<HealthLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-400",
  alarm: "bg-red-500",
  unknown: "bg-slate-300",
};

const ROW_TINT: Record<HealthLevel, string> = {
  ok: "bg-emerald-50/70",
  warn: "bg-amber-50/80",
  alarm: "bg-red-50/80",
  unknown: "bg-white",
};

export function CncToolStatusPanel({
  rows,
  toolSlots,
  toolingSummary,
  canAddTool,
  canBeginRemoval,
  onAddTool,
  onOpenOffset,
  onConfigChange,
  onConfigBlur,
  onRequestRemoval,
  onCompleteReplacement,
}: CncToolStatusPanelProps) {
  const slotMap = new Map(toolSlots.map((s) => [s.toolNum, s]));
  const summaryMap = new Map(
    (Array.isArray(toolingSummary?.tools) ? toolingSummary.tools : []).map(
      (item) => [String(item?.toolNum || ""), item],
    ),
  );
  const pendingSlots = toolSlots.filter((s) => s.replacementStatus !== "mounted");
  const warnCount = Number(toolingSummary?.warningCount || 0);
  const alarmCount = Number(toolingSummary?.alarmCount || 0);

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">
            등록 {rows.length}개
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            주의 {warnCount}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            교체 필요 {alarmCount}
          </span>
        </div>
        {canAddTool ? (
          <button
            type="button"
            onClick={onAddTool}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <span className="text-sm leading-none">+</span>
            공구 추가
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          예측
        </div>
        <div className="mt-0.5 text-sm text-slate-700">
          {summaryLine(toolingSummary)}
        </div>
      </div>

      {pendingSlots.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <div className="font-semibold">교체 진행 중</div>
          <ul className="mt-1.5 space-y-1">
            {pendingSlots.map((s) => (
              <li key={s.toolNum} className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    s.replacementStatus === "removing"
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                />
                <span>
                  #{s.toolNum}
                  {s.toolName ? ` · ${s.toolName}` : ""}
                  {" — "}
                  {s.replacementStatus === "removing"
                    ? "해제 요청됨"
                    : "교체 대기"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="text-base font-semibold text-slate-800">
            등록된 공구가 없습니다
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            슬롯 번호와 공구 이름만 입력하면
            <br />
            사용량 추적과 교체 알림을 사용할 수 있습니다.
          </p>
          {canAddTool ? (
            <button
              type="button"
              onClick={onAddTool}
              className="mt-5 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <span className="text-base leading-none">+</span>
              공구 등록
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="max-h-[52vh] overflow-auto">
              <table className="w-full min-w-[640px] table-fixed text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="w-28 px-3 py-2.5 text-left">슬롯</th>
                    <th className="px-3 py-2.5 text-left">공구</th>
                    <th className="w-[4.5rem] px-2 py-2.5 text-center">옵셋</th>
                    <th className="w-14 px-2 py-2.5 text-center">사용</th>
                    <th className="w-[4.75rem] px-2 py-2.5 text-center">설정</th>
                    <th className="w-20 px-2 py-2.5 text-center">잔여</th>
                    <th className="w-[4.75rem] px-2 py-2.5 text-center">교체</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((t, idx) => {
                    const use = t.useCount ?? 0;
                    const cfg = t.configCount ?? 0;
                    const toolNum = t.toolNum ?? idx + 1;
                    const toolMeta = summaryMap.get(String(toolNum));
                    const slot = slotMap.get(toolNum) ?? null;
                    const isRemoving = slot?.replacementStatus === "removing";
                    const isRemoved = slot?.replacementStatus === "removed";
                    const health = rowHealth({
                      use,
                      cfg,
                      toolMeta,
                      isBusy: isRemoving || isRemoved,
                    });
                    const remain = remainRatio(
                      use,
                      cfg,
                      Number(toolMeta?.predictedReplacementUseCount || 0),
                    );
                    const statusLabel = isRemoving
                      ? "해제중"
                      : isRemoved
                        ? "교체대기"
                        : toolMeta?.status === "alarm"
                          ? "교체필요"
                          : toolMeta?.status === "warn"
                            ? "교체임박"
                            : null;

                    return (
                      <tr key={toolNum} className={ROW_TINT[health]}>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[health]}`}
                              aria-hidden
                            />
                            <span className="font-semibold text-slate-900">
                              #{toolNum}
                            </span>
                            {statusLabel ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  isRemoving || isRemoved
                                    ? "bg-amber-100 text-amber-800"
                                    : toolMeta?.status === "alarm"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {statusLabel}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="truncate font-medium text-slate-800">
                            {slot?.toolName || (
                              <span className="font-normal text-slate-400">
                                이름 없음
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => onOpenOffset(toolNum)}
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            수정
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center align-middle font-mono text-[11px] text-slate-600">
                          {use}
                        </td>
                        <td className="px-2 py-3 text-center align-middle">
                          <input
                            type="number"
                            defaultValue={cfg}
                            step={1000}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              onConfigChange(
                                idx,
                                Number.isFinite(v) ? v : 0,
                              );
                            }}
                            onBlur={onConfigBlur}
                            className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center font-mono text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                          />
                        </td>
                        <td className="px-2 py-3 align-middle">
                          {remain == null ? (
                            <div className="text-center text-slate-400">—</div>
                          ) : (
                            <div className="mx-auto w-14 space-y-1">
                              <div className="text-center font-mono text-[11px] text-slate-700">
                                {Math.round(remain * 100)}%
                              </div>
                              <div className="h-1 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${
                                    health === "alarm"
                                      ? "bg-red-500"
                                      : health === "warn"
                                        ? "bg-amber-400"
                                        : "bg-emerald-500"
                                  }`}
                                  style={{
                                    width: `${Math.round(remain * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3 text-center align-middle">
                          {isRemoving || isRemoved ? (
                            <button
                              type="button"
                              onClick={() => onCompleteReplacement(t, slot)}
                              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              완료
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRequestRemoval(t, slot)}
                              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                canBeginRemoval
                                  ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {canBeginRemoval ? "해제" : "교체"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              정상
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              주의
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              교체 필요
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default CncToolStatusPanel;
