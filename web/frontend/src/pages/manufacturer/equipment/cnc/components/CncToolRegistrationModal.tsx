// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  useCncToolTemplates,
  type ToolTemplate,
  type ToolTemplateSlot,
} from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolTemplates";

/**
 * CncToolRegistrationModal
 *
 * 공구 세팅 흐름:
 *  1) add  — 현재 장비에 슬롯 1개 등록
 *  2) save — 현재 장비 슬롯을 그대로 템플릿으로 저장
 *  3) load — 템플릿을 현재 장비에 merge 적용 후, 상태 화면에서 차이만 수정
 */

export type ToolRegistrationMode = "add" | "save" | "load";

interface CncToolRegistrationModalProps {
  mode: ToolRegistrationMode;
  /** 현재 모달이 열려 있는 장비 ID */
  currentMachineId: string;
  /** save 모드: 현재 장비의 슬롯 (toolNum + toolName) */
  currentSlots?: ToolTemplateSlot[];
  onCancel: () => void;
  /** add 성공 시 호출 (현재 장비에 슬롯 1개 추가) */
  onAddTool: (payload: {
    toolNum: number;
    toolName?: string;
  }) => Promise<boolean>;
  /** save/load 후 현재 장비 슬롯 다시 로드·상태 화면 복귀 */
  onAfterApply: () => void;
  setError: (msg: string | null) => void;
}

export const CncToolRegistrationModal = ({
  mode,
  currentMachineId,
  currentSlots = [],
  onCancel,
  onAddTool,
  onAfterApply,
  setError,
}: CncToolRegistrationModalProps) => {
  if (mode === "add") {
    return (
      <AddMode
        onAddTool={onAddTool}
        onCancel={onCancel}
        onAfterApply={onAfterApply}
        setError={setError}
      />
    );
  }
  if (mode === "save") {
    return (
      <SaveMode
        currentSlots={currentSlots}
        onCancel={onCancel}
        onAfterApply={onAfterApply}
        setError={setError}
      />
    );
  }
  return (
    <LoadMode
      currentMachineId={currentMachineId}
      currentSlots={currentSlots}
      onCancel={onCancel}
      onAfterApply={onAfterApply}
      setError={setError}
    />
  );
};

// ─── add: 공구 1개 등록 ───────────────────────────────────────────
const AddMode = ({
  onAddTool,
  onCancel,
  onAfterApply,
  setError,
}: {
  onAddTool: (payload: {
    toolNum: number;
    toolName?: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  onAfterApply: () => void;
  setError: (msg: string | null) => void;
}) => {
  const [toolNum, setToolNum] = useState("");
  const [toolName, setToolName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    const tn = Number(toolNum);
    if (!Number.isFinite(tn) || tn < 1) {
      setError("슬롯 번호는 1 이상의 정수여야 합니다.");
      return;
    }
    setSubmitting(true);
    const ok = await onAddTool({
      toolNum: tn,
      toolName: toolName.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) {
      setToolNum("");
      setToolName("");
      onAfterApply();
    }
  };

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-xs leading-relaxed text-slate-500">
        슬롯 번호와 공구 이름만 입력하면 됩니다. 사용량은 자동 누적되며, 데이터가
        쌓이면 교체 시기를 알려드립니다.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">
            슬롯 번호 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            value={toolNum}
            onChange={(e) => setToolNum(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            placeholder="예: 17"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500">
            공구 이름
            <span className="ml-1 font-normal text-slate-400">(선택)</span>
          </label>
          <input
            type="text"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            placeholder="예: 1.2 BM"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          취소
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? "등록 중…" : "공구 등록"}
        </button>
      </div>
    </div>
  );
};

// ─── save: 현재 장비 슬롯 → 템플릿 ────────────────────────────────
const SaveMode = ({
  currentSlots,
  onCancel,
  onAfterApply,
  setError,
}: {
  currentSlots: ToolTemplateSlot[];
  onCancel: () => void;
  onAfterApply: () => void;
  setError: (msg: string | null) => void;
}) => {
  const { createTemplate } = useCncToolTemplates();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const slots = useMemo(
    () =>
      currentSlots
        .filter((s) => Number.isFinite(s.toolNum) && s.toolNum >= 1)
        .map((s) => ({
          toolNum: Math.floor(s.toolNum),
          toolName: String(s.toolName || "").trim(),
        }))
        .sort((a, b) => a.toolNum - b.toolNum),
    [currentSlots],
  );

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError("템플릿 이름을 입력하세요.");
      return;
    }
    if (slots.length === 0) {
      setError("저장할 슬롯이 없습니다. 먼저 이 장비에 공구를 등록하세요.");
      return;
    }
    setSaving(true);
    setSavedMsg(null);
    try {
      await createTemplate({
        name: name.trim(),
        description: description.trim() || undefined,
        slots,
      });
      setSavedMsg(
        `"${name.trim()}" 템플릿을 저장했습니다. (${slots.length}슬롯)`,
      );
    } catch (e: any) {
      setError(e?.message ?? "템플릿 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-xs leading-relaxed text-slate-500">
        지금 이 장비에 등록된 공구 구성을 그대로 템플릿으로 저장합니다. 다른
        장비에서 불러온 뒤, 다른 부분만 수정하면 됩니다.
      </p>

      {slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
          저장할 슬롯이 없습니다. 먼저 이 장비에 공구를 등록하세요.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                템플릿 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                placeholder="예: M4/M5 표준"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                설명
                <span className="ml-1 font-normal text-slate-400">(선택)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                placeholder="메모"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-500">
              포함 슬롯 ({slots.length})
            </div>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {slots.map((s) => (
                <span
                  key={s.toolNum}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200"
                >
                  #{s.toolNum}
                  {s.toolName ? ` ${s.toolName}` : ""}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {savedMsg ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {savedMsg}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            if (savedMsg) onAfterApply();
            else onCancel();
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {savedMsg ? "닫기" : "취소"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || slots.length === 0 || !name.trim() || Boolean(savedMsg)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? "저장 중…" : "템플릿 저장"}
        </button>
      </div>
    </div>
  );
};

// ─── load: 템플릿 → 현재 장비 ─────────────────────────────────────
const LoadMode = ({
  currentMachineId,
  currentSlots,
  onCancel,
  onAfterApply,
  setError,
}: {
  currentMachineId: string;
  currentSlots: ToolTemplateSlot[];
  onCancel: () => void;
  onAfterApply: () => void;
  setError: (msg: string | null) => void;
}) => {
  const {
    templates,
    applyTemplate,
    updateTemplate,
    deleteTemplate,
    loadTemplates,
  } = useCncToolTemplates();

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ToolTemplate | null>(null);

  const existingSlotCount = currentSlots.filter(
    (s) => Number.isFinite(s.toolNum) && s.toolNum >= 1,
  ).length;
  const hasExistingTools = existingSlotCount > 0;

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const applyNow = async () => {
    if (!selectedTemplateId) {
      setError("적용할 템플릿을 선택하세요.");
      return;
    }
    if (!currentMachineId) {
      setError("적용할 장비를 알 수 없습니다.");
      return;
    }
    if (hasExistingTools) {
      setError("이미 등록된 공구가 있습니다. 모두 삭제한 뒤 불러오세요.");
      return;
    }
    setApplying(true);
    setApplyResult(null);
    try {
      const results = await applyTemplate(selectedTemplateId, [
        currentMachineId,
      ]);
      const ok = results.some((r) => r.success);
      const fail = results.find((r) => !r.success);
      if (!ok) {
        setError(fail?.message ?? "템플릿 적용 실패");
        return;
      }
      const applied = results[0]?.appliedCount;
      setApplyResult(
        applied != null
          ? `이 장비에 ${applied}개 슬롯을 적용했습니다. 다른 부분만 수정하세요.`
          : "이 장비에 템플릿을 적용했습니다. 다른 부분만 수정하세요.",
      );
      onAfterApply();
    } catch (e: any) {
      setError(e?.message ?? "템플릿 적용 실패");
    } finally {
      setApplying(false);
    }
  };

  const handleApplyClick = () => {
    void applyNow();
  };

  const startRename = (t: ToolTemplate) => {
    setRenamingId(t._id);
    setRenameValue(t.name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const next = renameValue.trim();
    if (!next) {
      setError("템플릿 이름은 비어 있을 수 없습니다.");
      return;
    }
    try {
      await updateTemplate(renamingId, { name: next });
      setRenamingId(null);
      setRenameValue("");
    } catch (e: any) {
      setError(e?.message ?? "템플릿 이름 변경 실패");
    }
  };

  const requestDelete = (t: ToolTemplate) => {
    setPendingDelete(t);
    setConfirmDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const t = pendingDelete;
    if (!t) return;
    try {
      await deleteTemplate(t._id);
      if (selectedTemplateId === t._id) {
        setSelectedTemplateId("");
      }
      if (renamingId === t._id) {
        setRenamingId(null);
        setRenameValue("");
      }
      void loadTemplates();
    } catch (e: any) {
      setError(e?.message ?? "템플릿 삭제 실패");
    } finally {
      setConfirmDeleteOpen(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-xs leading-relaxed text-slate-500">
        공구가 하나도 없을 때만 템플릿을 불러올 수 있습니다. 적용 후 이 장비만
        다른 부분만 수정하면 됩니다.
      </p>

      {hasExistingTools ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          이미 등록된 공구가 {existingSlotCount}개 있습니다.{" "}
          <span className="font-semibold">공구 전체 삭제</span> 후 다시
          불러오세요.
        </div>
      ) : null}

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
          저장된 템플릿이 없습니다.
          <br />
          다른 장비에서 공구를 세팅한 뒤 &quot;템플릿으로 저장&quot;하세요.
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-500">
              저장된 템플릿
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
              {templates.map((t) => {
                const selected = selectedTemplateId === t._id;
                const isRenaming = renamingId === t._id;
                return (
                  <div
                    key={t._id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameValue("");
                          }
                        }}
                        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedTemplateId(t._id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="font-semibold">{t.name}</span>
                        <span
                          className={`ml-2 ${
                            selected ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {t.slots.length}슬롯
                        </span>
                      </button>
                    )}
                    <div className="flex shrink-0 gap-0.5">
                      {isRenaming ? (
                        <button
                          type="button"
                          onClick={() => void commitRename()}
                          className={`rounded px-1.5 py-0.5 text-[11px] ${
                            selected
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          확인
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRename(t)}
                          className={`rounded px-1.5 py-0.5 text-[11px] ${
                            selected
                              ? "text-white hover:bg-white/10"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          이름
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => requestDelete(t)}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          selected
                            ? "text-red-300 hover:bg-white/10"
                            : "text-red-600 hover:bg-red-50"
                        }`}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedTemplate ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-slate-500">
                포함 슬롯
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedTemplate.slots.map((s) => (
                  <span
                    key={s.toolNum}
                    className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200"
                  >
                    #{s.toolNum}
                    {s.toolName ? ` ${s.toolName}` : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {applyResult ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {applyResult}
            </div>
          ) : null}
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={handleApplyClick}
          disabled={applying || !selectedTemplateId || hasExistingTools}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {applying ? "적용 중…" : "이 장비에 적용"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="템플릿을 삭제할까요?"
        description={
          pendingDelete ? (
            <>
              <span className="font-semibold">&quot;{pendingDelete.name}&quot;</span>{" "}
              템플릿을 삭제합니다. 이미 적용된 장비 공구는 그대로 둡니다.
            </>
          ) : null
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setPendingDelete(null);
        }}
      />
    </div>
  );
};

export default CncToolRegistrationModal;
