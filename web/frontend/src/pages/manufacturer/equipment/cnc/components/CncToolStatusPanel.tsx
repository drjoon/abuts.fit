// related files:
// - web/frontend/src/pages/manufacturer/equipment/cnc/components/CncToolStatusModal.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolPanels.tsx
// - web/frontend/src/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots.tsx
import { useState } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import type {
  ToolSlot,
} from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";

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
  /** 현재 장비 슬롯을 템플릿으로 저장 */
  onSaveAsTemplate?: () => void;
  /** 템플릿을 이 장비에 불러오기 (공구 0개일 때만) */
  onLoadTemplate?: () => void;
  /** 공구 1개 삭제 */
  onDeleteTool?: (toolNum: number) => Promise<boolean>;
  /** 공구 전체 삭제 */
  onClearAllTools?: () => Promise<boolean>;
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
  ok: "bg-primary",
  warn: "bg-accent/80",
  alarm: "bg-destructive",
  unknown: "bg-slate-300",
};

const ROW_TINT: Record<HealthLevel, string> = {
  ok: "bg-primary-soft/70",
  warn: "bg-accent-soft/80",
  alarm: "bg-destructive-soft/80",
  unknown: "bg-white",
};

export function CncToolStatusPanel({
  rows,
  toolSlots,
  toolingSummary,
  canAddTool,
  canBeginRemoval,
  onAddTool,
  onSaveAsTemplate,
  onLoadTemplate,
  onDeleteTool,
  onClearAllTools,
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
  const hasTools = rows.length > 0 || toolSlots.length > 0;
  const canSaveTemplate = Boolean(onSaveAsTemplate) && hasTools;
  const canLoadTemplate = Boolean(onLoadTemplate) && !hasTools;
  const canClearAll = Boolean(onClearAllTools) && hasTools;
  const canDeleteOne = Boolean(onDeleteTool);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [pendingDeleteToolNum, setPendingDeleteToolNum] = useState<number | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const handleConfirmClear = async () => {
    if (!onClearAllTools || deleting) return;
    setDeleting(true);
    try {
      await onClearAllTools();
    } finally {
      setDeleting(false);
      setConfirmClearOpen(false);
    }
  };

  const handleConfirmDeleteOne = async () => {
    if (pendingDeleteToolNum == null || !onDeleteTool || deleting) return;
    setDeleting(true);
    try {
      await onDeleteTool(pendingDeleteToolNum);
    } finally {
      setDeleting(false);
      setPendingDeleteToolNum(null);
    }
  };

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
        <div className="flex flex-wrap items-center gap-2">
          {canLoadTemplate ? (
            <button
              type="button"
              onClick={onLoadTemplate}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              템플릿 불러오기
            </button>
          ) : null}
          {canSaveTemplate ? (
            <button
              type="button"
              onClick={onSaveAsTemplate}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              템플릿으로 저장
            </button>
          ) : null}
          {canClearAll ? (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center rounded-lg border border-destructive-muted bg-white px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive-soft"
            >
              공구 전체 삭제
            </button>
          ) : null}
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
        <div className="rounded-xl border border-accent-muted bg-accent-soft px-3.5 py-2.5 text-xs text-accent-strong">
          <div className="font-semibold">교체 진행 중</div>
          <ul className="mt-1.5 space-y-1">
            {pendingSlots.map((s) => (
              <li key={s.toolNum} className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    s.replacementStatus === "removing"
                      ? "bg-accent"
                      : "bg-destructive"
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
            먼저 이 장비에 공구를 등록하거나,
            <br />
            다른 장비에서 저장한 템플릿을 불러오세요.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {canLoadTemplate ? (
              <button
                type="button"
                onClick={onLoadTemplate}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                템플릿 불러오기
              </button>
            ) : null}
            {canAddTool ? (
              <button
                type="button"
                onClick={onAddTool}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <span className="text-base leading-none">+</span>
                공구 등록
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left">
                      슬롯
                    </th>
                    <th className="px-3 py-2.5 text-left">공구</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center">
                      옵셋
                    </th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center">
                      사용
                    </th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center">
                      설정
                    </th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center">
                      잔여
                    </th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-center">
                      교체
                    </th>
                    {canDeleteOne ? (
                      <th className="whitespace-nowrap px-2 py-2.5 text-center">
                        삭제
                      </th>
                    ) : null}
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
                                    ? "bg-accent-soft text-accent-strong"
                                    : toolMeta?.status === "alarm"
                                      ? "bg-destructive-soft text-destructive"
                                      : "bg-accent-soft text-accent-strong"
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
                        <td className="whitespace-nowrap px-2 py-3 text-center align-middle">
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
                            className="mx-auto w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center font-mono text-[11px] text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
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
                                      ? "bg-destructive"
                                      : health === "warn"
                                        ? "bg-accent/80"
                                        : "bg-primary"
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
                              className="rounded-md border border-primary bg-primary-muted/40 px-2 py-1 text-[11px] font-semibold text-primary-strong hover:bg-primary-soft"
                            >
                              완료
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRequestRemoval(t, slot)}
                              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                canBeginRemoval
                                  ? "border-accent-muted bg-accent-soft text-accent-strong hover:bg-accent-soft"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {canBeginRemoval ? "해제" : "교체"}
                            </button>
                          )}
                        </td>
                        {canDeleteOne ? (
                          <td className="px-2 py-3 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => setPendingDeleteToolNum(toolNum)}
                              className="rounded-md border border-destructive-muted bg-white px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive-soft"
                            >
                              삭제
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              정상
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent/80" />
              주의
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              교체 필요
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="공구를 모두 삭제할까요?"
        description={
          <>
            이 장비에 등록된 공구{" "}
            <span className="font-semibold">{rows.length}개</span>를 모두
            삭제합니다. 사용 통계·교체 이력은 남고, 슬롯 등록만 지워집니다.
            삭제 후 템플릿을 다시 불러올 수 있습니다.
          </>
        }
        confirmLabel={deleting ? "삭제 중…" : "전체 삭제"}
        cancelLabel="취소"
        onConfirm={() => {
          void handleConfirmClear();
        }}
        onCancel={() => {
          if (deleting) return;
          setConfirmClearOpen(false);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteToolNum != null}
        title="이 공구를 삭제할까요?"
        description={
          pendingDeleteToolNum != null ? (
            <>
              슬롯{" "}
              <span className="font-semibold">#{pendingDeleteToolNum}</span>
              {slotMap.get(pendingDeleteToolNum)?.toolName
                ? ` (${slotMap.get(pendingDeleteToolNum)?.toolName})`
                : ""}
              을 삭제합니다. 사용 통계·교체 이력은 남고, 이 슬롯 등록만
              지워집니다.
            </>
          ) : null
        }
        confirmLabel={deleting ? "삭제 중…" : "삭제"}
        cancelLabel="취소"
        onConfirm={() => {
          void handleConfirmDeleteOne();
        }}
        onCancel={() => {
          if (deleting) return;
          setPendingDeleteToolNum(null);
        }}
      />
    </div>
  );
}

export default CncToolStatusPanel;
