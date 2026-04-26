import { useEffect, useMemo, useState } from "react";

import {
  useCncToolTemplates,
  type ToolTemplate,
  type ToolTemplateSlot,
} from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolTemplates";

/**
 * CncToolRegistrationModal
 *
 * 단순화된 공구 등록 + 템플릿 흐름.
 *
 * 탭:
 *  1) 직접 등록 — 슬롯 번호(필수) + 공구 이름(선택)만 입력
 *  2) 템플릿 적용 — 저장된 템플릿 선택 후 한 장비 또는 여러 장비에 Merge upsert
 *  3) 템플릿 관리 — 목록/생성/편집/삭제
 *
 * 슬롯 메타는 toolNum + toolName 만 사용한다. (toolType/toolNote/configCount 제거)
 * 사용량/시간은 백엔드가 자동 누적해 추후 빅데이터 기반으로 교체 시기를 알려준다.
 */

interface CncToolRegistrationModalProps {
  /** 현재 모달이 열려 있는 장비 ID (직접 등록 + 기본 선택용) */
  currentMachineId: string;
  onCancel: () => void;
  /** 직접 등록 성공 시 호출 (현재 장비에 슬롯 1개 추가) */
  onAddTool: (payload: {
    toolNum: number;
    toolName?: string;
  }) => Promise<boolean>;
  /** 템플릿 적용 후 현재 장비 슬롯 다시 로드용 콜백 */
  onAfterApply: () => void;
  setError: (msg: string | null) => void;
}

type Tab = "direct" | "apply" | "manage";

export const CncToolRegistrationModal = ({
  currentMachineId,
  onCancel,
  onAddTool,
  onAfterApply,
  setError,
}: CncToolRegistrationModalProps) => {
  const {
    templates,
    machines,
    loadTemplates,
    loadMachines,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
  } = useCncToolTemplates();

  const [tab, setTab] = useState<Tab>("direct");

  // ── 직접 등록 탭 상태 ──
  const [directToolNum, setDirectToolNum] = useState("");
  const [directToolName, setDirectToolName] = useState("");
  const [directSubmitting, setDirectSubmitting] = useState(false);

  const handleDirectSubmit = async () => {
    if (directSubmitting) return;
    const tn = Number(directToolNum);
    if (!Number.isFinite(tn) || tn < 1) {
      setError("슬롯 번호는 1 이상의 정수여야 합니다.");
      return;
    }
    setDirectSubmitting(true);
    const ok = await onAddTool({
      toolNum: tn,
      toolName: directToolName.trim() || undefined,
    });
    setDirectSubmitting(false);
    if (ok) {
      setDirectToolNum("");
      setDirectToolName("");
      onAfterApply();
    }
  };

  // ── 템플릿 적용 탭 상태 ──
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedMachineIds, setSelectedMachineIds] = useState<string[]>(
    currentMachineId ? [currentMachineId] : [],
  );
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  useEffect(() => {
    if (currentMachineId && selectedMachineIds.length === 0) {
      setSelectedMachineIds([currentMachineId]);
    }
  }, [currentMachineId, selectedMachineIds.length]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const toggleMachine = (machineId: string) => {
    setSelectedMachineIds((prev) =>
      prev.includes(machineId)
        ? prev.filter((m) => m !== machineId)
        : [...prev, machineId],
    );
  };

  const handleApply = async () => {
    if (!selectedTemplateId) {
      setError("적용할 템플릿을 선택하세요.");
      return;
    }
    if (selectedMachineIds.length === 0) {
      setError("적용할 장비를 1개 이상 선택하세요.");
      return;
    }
    setApplying(true);
    setApplyResult(null);
    try {
      const results = await applyTemplate(
        selectedTemplateId,
        selectedMachineIds,
      );
      const okCount = results.filter((r) => r.success).length;
      const failCount = results.length - okCount;
      setApplyResult(
        `적용 완료: ${okCount}개 장비 성공${
          failCount > 0 ? `, ${failCount}개 실패` : ""
        }`,
      );
      onAfterApply();
    } catch (e: any) {
      setError(e?.message ?? "템플릿 적용 실패");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 text-sm text-gray-700">
      {/* 탭 헤더 */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "direct", label: "직접 등록" },
          { key: "apply", label: "템플릿 적용" },
          { key: "manage", label: "템플릿 관리" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key as Tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "direct" && (
        <DirectRegistrationTab
          toolNum={directToolNum}
          toolName={directToolName}
          submitting={directSubmitting}
          onChangeToolNum={setDirectToolNum}
          onChangeToolName={setDirectToolName}
          onSubmit={handleDirectSubmit}
          onCancel={onCancel}
        />
      )}

      {tab === "apply" && (
        <ApplyTab
          templates={templates}
          machines={machines}
          selectedTemplate={selectedTemplate}
          selectedTemplateId={selectedTemplateId}
          selectedMachineIds={selectedMachineIds}
          applying={applying}
          applyResult={applyResult}
          onSelectTemplate={setSelectedTemplateId}
          onToggleMachine={toggleMachine}
          onApply={handleApply}
          onCancel={onCancel}
        />
      )}

      {tab === "manage" && (
        <ManageTab
          templates={templates}
          onCreate={async (payload) => {
            try {
              await createTemplate(payload);
            } catch (e: any) {
              setError(e?.message ?? "템플릿 생성 실패");
            }
          }}
          onUpdate={async (id, payload) => {
            try {
              await updateTemplate(id, payload);
            } catch (e: any) {
              setError(e?.message ?? "템플릿 수정 실패");
            }
          }}
          onDelete={async (id) => {
            try {
              await deleteTemplate(id);
            } catch (e: any) {
              setError(e?.message ?? "템플릿 삭제 실패");
            }
          }}
          onReload={() => {
            void loadTemplates();
            void loadMachines();
          }}
        />
      )}
    </div>
  );
};

// ─── 탭 1: 직접 등록 ─────────────────────────────────────────────
const DirectRegistrationTab = ({
  toolNum,
  toolName,
  submitting,
  onChangeToolNum,
  onChangeToolName,
  onSubmit,
  onCancel,
}: {
  toolNum: string;
  toolName: string;
  submitting: boolean;
  onChangeToolNum: (v: string) => void;
  onChangeToolName: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) => (
  <>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
      슬롯 번호와 공구 이름만 입력하면 됩니다. 사용량/시간은 자동으로 누적되어
      충분한 데이터가 모이면 교체 시기를 알려드립니다.
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <div className="text-xs font-semibold text-slate-500">
          슬롯 번호 <span className="text-red-500">*</span>
        </div>
        <input
          type="number"
          min={1}
          value={toolNum}
          onChange={(e) => onChangeToolNum(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="1"
        />
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold text-slate-500">
          공구 이름 (선택)
        </div>
        <input
          type="text"
          value={toolName}
          onChange={(e) => onChangeToolName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="예: 드릴 1.2mm"
        />
      </div>
    </div>
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
      >
        취소
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        공구 등록
      </button>
    </div>
  </>
);

// ─── 탭 2: 템플릿 적용 ────────────────────────────────────────────
const ApplyTab = ({
  templates,
  machines,
  selectedTemplate,
  selectedTemplateId,
  selectedMachineIds,
  applying,
  applyResult,
  onSelectTemplate,
  onToggleMachine,
  onApply,
  onCancel,
}: {
  templates: ToolTemplate[];
  machines: { machineId: string; name: string; status?: string }[];
  selectedTemplate: ToolTemplate | null;
  selectedTemplateId: string;
  selectedMachineIds: string[];
  applying: boolean;
  applyResult: string | null;
  onSelectTemplate: (id: string) => void;
  onToggleMachine: (machineId: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) => (
  <>
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
      저장된 템플릿을 선택해 한 장비 또는 여러 장비에 한 번에 적용합니다. 기존
      슬롯의 사용 통계와 교체 이력은 유지됩니다 (Merge 적용).
    </div>

    {templates.length === 0 ? (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
        저장된 템플릿이 없습니다. "템플릿 관리" 탭에서 먼저 생성하세요.
      </div>
    ) : (
      <>
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">템플릿</div>
          <select
            value={selectedTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">선택하세요</option>
            {templates.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} ({t.slots.length}슬롯)
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="mb-1 text-[11px] font-semibold text-slate-500">
              포함 슬롯
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTemplate.slots.map((s) => (
                <span
                  key={s.toolNum}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  #{s.toolNum}
                  {s.toolName ? ` ${s.toolName}` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">
            적용 대상 장비 (다중 선택 가능)
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
            {machines.length === 0 ? (
              <div className="col-span-3 text-center text-xs text-slate-400">
                장비 없음
              </div>
            ) : (
              machines.map((m) => {
                const checked = selectedMachineIds.includes(m.machineId);
                return (
                  <label
                    key={m.machineId}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer border ${
                      checked
                        ? "border-blue-300 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={checked}
                      onChange={() => onToggleMachine(m.machineId)}
                    />
                    <span className="font-medium">{m.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {applyResult ? (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {applyResult}
          </div>
        ) : null}
      </>
    )}

    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
      >
        닫기
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={applying || !selectedTemplateId}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {applying ? "적용 중..." : "선택 장비에 적용"}
      </button>
    </div>
  </>
);

// ─── 탭 3: 템플릿 관리 ────────────────────────────────────────────
const ManageTab = ({
  templates,
  onCreate,
  onUpdate,
  onDelete,
  onReload,
}: {
  templates: ToolTemplate[];
  onCreate: (payload: {
    name: string;
    description?: string;
    slots: ToolTemplateSlot[];
  }) => Promise<void>;
  onUpdate: (
    id: string,
    payload: {
      name?: string;
      description?: string;
      slots?: ToolTemplateSlot[];
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReload: () => void;
}) => {
  // 편집 중인 템플릿 ID. null = 생성 모드, "" = 미선택, "<id>" = 편집 모드
  const [editingId, setEditingId] = useState<string | null>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState<ToolTemplateSlot[]>([]);

  const startCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setSlots([]);
  };
  const startEdit = (t: ToolTemplate) => {
    setEditingId(t._id);
    setName(t.name);
    setDescription(t.description || "");
    setSlots(t.slots.map((s) => ({ toolNum: s.toolNum, toolName: s.toolName })));
  };
  const reset = () => {
    setEditingId("");
    setName("");
    setDescription("");
    setSlots([]);
  };

  const addSlot = () => {
    const used = new Set(slots.map((s) => s.toolNum));
    let next = 1;
    while (used.has(next)) next += 1;
    setSlots([...slots, { toolNum: next, toolName: "" }]);
  };
  const updateSlot = (
    idx: number,
    patch: Partial<ToolTemplateSlot>,
  ) => {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSlot = (idx: number) => {
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!name.trim()) return;
    const cleaned = slots
      .filter((s) => Number.isFinite(s.toolNum) && s.toolNum >= 1)
      .map((s) => ({
        toolNum: Math.floor(s.toolNum),
        toolName: (s.toolName || "").trim(),
      }));
    if (editingId) {
      await onUpdate(editingId, {
        name: name.trim(),
        description: description.trim(),
        slots: cleaned,
      });
    } else {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        slots: cleaned,
      });
    }
    reset();
    onReload();
  };

  const isEditing = editingId !== "";

  return (
    <div className="space-y-3">
      {/* 템플릿 목록 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500">
            저장된 템플릿
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
          >
            + 새 템플릿
          </button>
        </div>
        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
            저장된 템플릿이 없습니다.
          </div>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {templates.map((t) => (
              <div
                key={t._id}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs border ${
                  editingId === t._id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <span className="font-semibold text-slate-800">{t.name}</span>
                  <span className="ml-2 text-slate-500">
                    {t.slots.length}슬롯
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="rounded px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`"${t.name}" 템플릿을 삭제하시겠습니까?`)) {
                        void onDelete(t._id);
                        if (editingId === t._id) reset();
                      }
                    }}
                    className="rounded px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 편집/생성 폼 */}
      {(isEditing || editingId === null) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-600">
            {editingId ? "템플릿 편집" : "새 템플릿"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500"
              placeholder="템플릿 이름 (예: M4/M5 표준)"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500"
              placeholder="설명 (선택)"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-slate-500">
                슬롯 ({slots.length})
              </div>
              <button
                type="button"
                onClick={addSlot}
                className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
              >
                + 슬롯 추가
              </button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {slots.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 bg-white px-2 py-3 text-center text-[11px] text-slate-400">
                  슬롯을 추가하세요.
                </div>
              ) : (
                slots.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={s.toolNum}
                      onChange={(e) =>
                        updateSlot(idx, {
                          toolNum: Number(e.target.value) || 0,
                        })
                      }
                      className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={s.toolName}
                      onChange={(e) =>
                        updateSlot(idx, { toolName: e.target.value })
                      }
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-blue-500"
                      placeholder="공구 이름 (선택)"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(idx)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-300"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CncToolRegistrationModal;
