// related files:
// - web/frontend/src/shared/practice/requestStagePresets.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/components/practice/PracticeRequestStagePresetDialog.tsx
// - web/frontend/src/pages/practice/components/PracticeTransferArrivalSettingsTab.tsx
// - 2026-09-07: 기공의뢰 단계 인라인 편집(전체치열 모달·설정). 카드형 별도 모달 UX 축소.
// - 2026-09-07: 단계 행 드래그 정렬(화살표 제거).
// - 2026-09-07: 단계별 도착 일수 UI 제거 — 재도착일은 매번 직접 지정.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";
import {
  MAX_STAGES_PER_PRESET,
  normalizeRequestStages,
  type PracticeRequestStage,
} from "@/shared/practice/requestStagePresets";
import { DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS } from "@/shared/practice/labArrivalDefaults";
import { GripVertical, Plus, Trash2 } from "lucide-react";

type Props = {
  stages: PracticeRequestStage[];
  onChange: (next: PracticeRequestStage[]) => void;
  className?: string;
  /** compact=한 줄 요약만(읽기). edit=단계 이름 인라인 */
  mode?: "compact" | "edit";
};

const emptyStage = (): PracticeRequestStage => ({
  name: "",
  // 스키마 호환용 기본값. UI에서는 편집하지 않음(재도착일 수동 지정).
  arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
});

const STAGE_DRAG_MIME = "application/x-request-stage-index";

/** 단계 요약: 인상 → 교합채득 → … */
export function formatRequestStageSummary(
  stages: PracticeRequestStage[] | null | undefined,
): string {
  const list = normalizeRequestStages(stages);
  if (list.length === 0) return "";
  return list.map((s) => s.name).join(" → ");
}

/**
 * 기공의뢰 단계 목록 — 카드 스택 대신 컴팩트 행.
 * 전체치열 모달·설정 다이얼로그 공통.
 */
export function PracticeRequestStageInlineEditor({
  stages,
  onChange,
  className,
  mode = "edit",
}: Props) {
  const list = Array.isArray(stages) ? stages : [];
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (mode === "compact") {
    const summary = formatRequestStageSummary(list);
    if (!summary) {
      return (
        <p className={cn("text-[11px] text-slate-400", className)}>
          단계 없음
        </p>
      );
    }
    return (
      <p
        className={cn("text-[12px] leading-snug text-slate-600", className)}
        title={summary}
      >
        {summary}
      </p>
    );
  }

  const updateRow = (index: number, patch: Partial<PracticeRequestStage>) => {
    onChange(
      list.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    if (list.length >= MAX_STAGES_PER_PRESET) return;
    onChange([...list, emptyStage()]);
  };

  const removeRow = (index: number) => {
    onChange(list.filter((_, i) => i !== index));
  };

  const moveRow = (from: number, to: number) => {
    if (
      from < 0 ||
      to < 0 ||
      from >= list.length ||
      to >= list.length ||
      from === to
    ) {
      return;
    }
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const clearDrag = () => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {list.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400">
          단계를 추가하세요
        </p>
      ) : (
        list.map((row, index) => {
          const isDragging = dragFromIndex === index;
          const isDropTarget =
            dragFromIndex != null &&
            dragOverIndex === index &&
            dragFromIndex !== index;
          return (
            <div
              key={`stage-row-${index}`}
              className={cn(
                "flex items-center gap-1 rounded-lg border border-transparent px-0.5 py-0.5 transition-colors",
                isDragging && "opacity-50",
                isDropTarget && "border-primary/40 bg-primary-soft/40",
              )}
              onDragOver={(e) => {
                if (dragFromIndex == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverIndex !== index) setDragOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw =
                  e.dataTransfer.getData(STAGE_DRAG_MIME) ||
                  String(dragFromIndex ?? "");
                const from = Number(raw);
                clearDrag();
                if (!Number.isFinite(from)) return;
                moveRow(from, index);
              }}
            >
              <button
                type="button"
                draggable
                className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                aria-label={`${index + 1}번 단계 드래그`}
                title="드래그하여 순서 변경"
                onDragStart={(e) => {
                  e.dataTransfer.setData(STAGE_DRAG_MIME, String(index));
                  e.dataTransfer.effectAllowed = "move";
                  setDragFromIndex(index);
                  setDragOverIndex(null);
                }}
                onDragEnd={clearDrag}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-slate-400">
                {index + 1}
              </span>
              <Input
                className="h-8 min-w-0 flex-1 rounded-lg px-2 text-sm"
                value={row.name}
                placeholder="단계 이름"
                onChange={(e) => updateRow(index, { name: e.target.value })}
              />
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeRow(index)}
                aria-label="단계 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-center gap-1 rounded-lg text-slate-500"
        disabled={list.length >= MAX_STAGES_PER_PRESET}
        onClick={addRow}
      >
        <Plus className="h-3.5 w-3.5" />
        단계 추가
      </Button>
    </div>
  );
}
