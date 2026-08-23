// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useRef, useState } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import { CncToolRegistrationModal } from "@/pages/manufacturer/equipment/cnc/components/CncToolRegistrationModal";
import {
  CncToolStatusPanel,
  type ToolLifeRow,
} from "@/pages/manufacturer/equipment/cnc/components/CncToolStatusPanel";
import {
  formatSeconds,
  type MachiningStatEntry,
  type ToolSlot,
} from "@/pages/manufacturer/equipment/cnc/hooks/useCncToolSlots";

interface UseCncToolPanelsParams {
  workUid: string;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
  setError: (msg: string | null) => void;
  setToolHealth: (level: HealthLevel) => void;
  setToolTooltip: (msg: string) => void;
  /** useCncToolSlots 훅에서 제공하는 슬롯 데이터 (옵션, 없으면 슬롯 UI 비활성) */
  toolSlots?: ToolSlot[];
  /** useCncToolSlots 훅에서 제공하는 사용 통계 (옵션) */
  machiningStats?: MachiningStatEntry[];
  /** 공구 해제 요청 함수 (useCncToolSlots.beginToolRemoval) */
  onBeginToolRemoval?: (toolNum: number) => Promise<ToolSlot[] | null>;
  /** 교체 완료 확인 함수 (useCncToolSlots.completeToolReplacement) */
  onCompleteToolReplacement?: (payload: any) => Promise<any>;
  /** 슬롯 메타 수정 함수 (useCncToolSlots.updateToolSlotMeta) */
  onUpdateToolSlotMeta?: (payload: any) => Promise<boolean>;
  /**
   * 신규 공구 슬롯 등록 함수 (useCncToolSlots.addToolSlot).
   * 슬롯 메타는 toolNum(필수) + toolName(선택)만 사용한다.
   */
  onAddTool?: (payload: {
    toolNum: number;
    toolName?: string;
  }) => Promise<boolean>;
  /** 템플릿 적용/등록 후 슬롯 목록 다시 로드 (로드된 슬롯 반환 가능) */
  onReloadToolSlots?: () => Promise<ToolSlot[] | void>;
  /** 공구 1개 삭제 */
  onDeleteTool?: (toolNum: number) => Promise<{
    toolSlots: ToolSlot[];
    toolLife: any[];
    toolingSummary?: any;
  } | null>;
  /** 공구 전체 삭제 */
  onClearAllTools?: () => Promise<{
    toolSlots: ToolSlot[];
    toolLife: any[];
    toolingSummary?: any;
  } | null>;
}

interface ToolingMetaSnapshot {
  toolingSummary?: any;
  replacementHistory?: any[];
  observations?: any[];
}

export const useCncToolPanels = ({
  workUid,
  callRaw,
  ensureCncWriteAllowed,
  setError,
  setToolHealth,
  setToolTooltip,
  toolSlots = [],
  machiningStats = [],
  onBeginToolRemoval,
  onCompleteToolReplacement,
  onUpdateToolSlotMeta,
  onAddTool,
  onReloadToolSlots,
  onDeleteTool,
  onClearAllTools,
}: UseCncToolPanelsParams) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalBody, setModalBody] = useState<JSX.Element | null>(null);

  const toolOffsetSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const toolLifeSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scheduleToolLifeSaveRef = useRef<(() => void) | null>(null);

  // 모달 body JSX가 state에 고정되면 workUid/onAddTool이 stale 될 수 있다.
  const workUidRef = useRef(workUid);
  workUidRef.current = workUid;
  const onAddToolRef = useRef(onAddTool);
  onAddToolRef.current = onAddTool;
  const onReloadToolSlotsRef = useRef(onReloadToolSlots);
  onReloadToolSlotsRef.current = onReloadToolSlots;
  const onDeleteToolRef = useRef(onDeleteTool);
  onDeleteToolRef.current = onDeleteTool;
  const onClearAllToolsRef = useRef(onClearAllTools);
  onClearAllToolsRef.current = onClearAllTools;
  const callRawRef = useRef(callRaw);
  callRawRef.current = callRaw;
  const openAddToolDialogRef = useRef<() => void>(() => {});
  const openSaveTemplateDialogRef = useRef<() => void>(() => {});
  const openLoadTemplateDialogRef = useRef<() => void>(() => {});
  const toolSlotsRef = useRef(toolSlots);
  toolSlotsRef.current = toolSlots;
  const toolLifeRowsRef = useRef<ToolLifeRow[] | null>(null);
  const lastToolHealthLevelRef = useRef<HealthLevel>("unknown");
  const openToolDetailWithSlotsRef = useRef<
    (
      toolLife: any[] | null,
      level: HealthLevel,
      toolingMeta?: ToolingMetaSnapshot,
      slotsOverride?: ToolSlot[],
    ) => void
  >(() => {});

  const [toolLifeOriginal, setToolLifeOriginal] = useState<any[] | null>(null);
  const [toolLifeRows, setToolLifeRows] = useState<any[] | null>(null);
  const [toolLifeDirty, setToolLifeDirty] = useState(false);
  const [toolLifeSaveConfirmOpen, setToolLifeSaveConfirmOpen] = useState(false);
  const [lastToolHealthLevel, setLastToolHealthLevel] =
    useState<HealthLevel>("unknown");
  lastToolHealthLevelRef.current = lastToolHealthLevel;
  const [toolStatusBodySnapshot, setToolStatusBodySnapshot] =
    useState<JSX.Element | null>(null);
  const [toolingMetaSnapshot, setToolingMetaSnapshot] =
    useState<ToolingMetaSnapshot | null>(null);

  const resolveSummaryLevel = (summary?: any): HealthLevel => {
    const level = String(summary?.alertLevel || "").trim();
    if (level === "alarm") return "alarm";
    if (level === "warn") return "warn";
    if (level === "ok") return "ok";
    return "unknown";
  };

  const buildSummaryTooltip = (summary?: any) => {
    const dueTools = Array.isArray(summary?.dueTools) ? summary.dueTools : [];
    if (dueTools.length === 0) return "교체 임박 공구 없음";
    const head = dueTools
      .slice(0, 3)
      .map((item: any) => `#${item.toolNum}`)
      .join(", ");
    const suffix = dueTools.length > 3 ? ` 외 ${dueTools.length - 3}개` : "";
    return `교체 임박 ${head}${suffix}`;
  };

  /**
   * 공구 상태 패널로 복귀.
   * 모달 body에 고정된 stale 클로저 대신 서버/ref 기준으로 다시 연다.
   */
  const reloadToolStatusPanel = async () => {
    const uid = workUidRef.current;
    const fallbackLevel = lastToolHealthLevelRef.current;
    if (!uid) {
      openToolDetailWithSlotsRef.current(
        toolLifeRowsRef.current,
        fallbackLevel,
        undefined,
        toolSlotsRef.current,
      );
      return;
    }
    try {
      const res = await callRawRef.current(uid, "GetToolLifeInfo");
      const data: any = res?.data ?? res;
      const toolLife =
        data?.machineToolLife?.toolLife ??
        data?.machineToolLife?.toolLifeInfo ??
        toolLifeRowsRef.current ??
        [];
      const meta = {
        toolingSummary: data?.machineToolLife?.toolingSummary,
        replacementHistory: data?.machineToolLife?.replacementHistory,
        observations: data?.machineToolLife?.observations,
      };
      const nextLevel = resolveSummaryLevel(meta.toolingSummary);
      setToolHealth(nextLevel);
      setLastToolHealthLevel(nextLevel);
      setToolTooltip(buildSummaryTooltip(meta.toolingSummary));
      openToolDetailWithSlotsRef.current(
        toolLife,
        nextLevel,
        meta,
        toolSlotsRef.current,
      );
    } catch {
      openToolDetailWithSlotsRef.current(
        toolLifeRowsRef.current,
        fallbackLevel,
        undefined,
        toolSlotsRef.current,
      );
    }
  };

  const openToolOffsetEditor = (initialToolNum?: number) => {
    if (!workUid) return;

    const toolNum = initialToolNum ?? 1;
    let geoX = 0;
    let geoY = 0;
    let geoZ = 0;
    let geoR = 0;
    let wearX = 0;
    let wearY = 0;
    let wearZ = 0;
    let wearR = 0;
    let tipL = 0;

    setModalTitle(`툴 오프셋 #${toolNum}`);

    let lastSavedKey = JSON.stringify({
      toolNum,
      geoX,
      geoY,
      geoZ,
      geoR,
      wearX,
      wearY,
      wearZ,
      wearR,
      tipL,
    });

    const saveNow = async (closeAfter: boolean) => {
      if (!workUid) return;

      const nextKey = JSON.stringify({
        toolNum,
        geoX,
        geoY,
        geoZ,
        geoR,
        wearX,
        wearY,
        wearZ,
        wearR,
        tipL,
      });

      if (nextKey === lastSavedKey) {
        if (closeAfter) setModalOpen(false);
        return;
      }

      const ok = await ensureCncWriteAllowed();
      if (!ok) return;

      try {
        const payload = {
          toolGeoOffsetArray: [
            { no: toolNum, x: geoX, y: geoY, z: geoZ, r: geoR },
          ],
          toolWearOffsetArray: [{ x: wearX, y: wearY, z: wearZ, r: wearR }],
          toolTipOffsetArray: [tipL],
        };

        const res = await callRaw(workUid, "UpdateToolOffset", payload);
        const success = !res || res.success !== false;
        if (!success) {
          const msg =
            res?.message ||
            res?.error ||
            "툴 오프셋 업데이트 실패 (백엔드 UpdateToolOffset 응답 확인 필요)";
          throw new Error(msg);
        }

        lastSavedKey = nextKey;
        setToolTooltip(
          `툴 #${toolNum} 오프셋이 업데이트되었습니다. (기하/마모/팁)`,
        );
        if (closeAfter) {
          setModalOpen(false);
        }
      } catch (e: any) {
        const msg = e?.message ?? "툴 오프셋 업데이트 중 오류가 발생했습니다.";
        setError(msg);
        setToolHealth("alarm");
        setToolTooltip(msg);
      }
    };

    const scheduleSave = () => {
      if (toolOffsetSaveTimeoutRef.current) {
        clearTimeout(toolOffsetSaveTimeoutRef.current);
      }
      toolOffsetSaveTimeoutRef.current = setTimeout(() => {
        void saveNow(false);
      }, 800);
    };
    setModalBody(
      <div className="space-y-4 text-sm text-gray-700">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">기하 오프셋</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["X", "Y", "Z", "R"].map((axis) => (
              <div key={axis} className="space-y-1">
                <div className="text-[11px] text-gray-500">{axis}</div>
                <input
                  type="number"
                  defaultValue={0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const n = Number.isFinite(v) ? v : 0;
                    if (axis === "X") geoX = n;
                    if (axis === "Y") geoY = n;
                    if (axis === "Z") geoZ = n;
                    if (axis === "R") geoR = n;
                  }}
                  onBlur={() => {
                    scheduleSave();
                  }}
                  className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-primary focus:border-primary sm:w-16"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">마모 오프셋</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["X", "Y", "Z", "R"].map((axis) => (
              <div key={axis} className="space-y-1">
                <div className="text-[11px] text-gray-500">{axis}</div>
                <input
                  type="number"
                  defaultValue={0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    const n = Number.isFinite(v) ? v : 0;
                    if (axis === "X") wearX = n;
                    if (axis === "Y") wearY = n;
                    if (axis === "Z") wearZ = n;
                    if (axis === "R") wearR = n;
                  }}
                  onBlur={() => {
                    scheduleSave();
                  }}
                  className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-primary focus:border-primary sm:w-16"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-between gap-4 pt-2 sm:flex-row sm:items-end">
          <div className="w-full max-w-[12rem] flex-1 space-y-2">
            <div className="text-xs font-semibold text-gray-500">
              툴 팁 오프셋(길이)
            </div>
            <input
              type="number"
              defaultValue={0}
              onChange={(e) => {
                const v = Number(e.target.value);
                tipL = Number.isFinite(v) ? v : 0;
              }}
              onBlur={() => {
                scheduleSave();
              }}
              className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-primary focus:border-primary sm:w-16"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              onClick={() => {
                if (toolStatusBodySnapshot) {
                  setModalTitle("공구 상태");
                  setModalBody(toolStatusBodySnapshot);
                  return;
                }

                if (toolLifeRows || toolLifeOriginal) {
                  const rows = toolLifeRows ?? toolLifeOriginal ?? [];
                  openToolDetail(
                    rows as any[],
                    lastToolHealthLevel,
                    toolingMetaSnapshot || undefined,
                  );
                  return;
                }

                if (!workUid) {
                  openToolDetail(
                    [],
                    lastToolHealthLevel,
                    toolingMetaSnapshot || undefined,
                  );
                  return;
                }

                void (async () => {
                  try {
                    const res = await callRaw(workUid, "GetToolLifeInfo");
                    const data: any = res?.data ?? res;
                    const toolLife =
                      data?.machineToolLife?.toolLife ??
                      data?.machineToolLife?.toolLifeInfo ??
                      [];
                    openToolDetail(toolLife, lastToolHealthLevel, {
                      toolingSummary: data?.machineToolLife?.toolingSummary,
                      replacementHistory:
                        data?.machineToolLife?.replacementHistory,
                      observations: data?.machineToolLife?.observations,
                    });
                  } catch (e) {
                    openToolDetail(
                      [],
                      lastToolHealthLevel,
                      toolingMetaSnapshot || undefined,
                    );
                  }
                })();
              }}
            >
              돌아가기
            </button>
            <button
              type="button"
              className="bg-primary hover:bg-primary-strong text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              onClick={() => {
                if (toolOffsetSaveTimeoutRef.current) {
                  clearTimeout(toolOffsetSaveTimeoutRef.current);
                }
                void saveNow(true);
              }}
            >
              닫기
            </button>
          </div>
        </div>
      </div>,
    );
    setModalOpen(true);
  };

  const openToolDetail = (
    toolLife: any[],
    level: HealthLevel,
    toolingMeta?: ToolingMetaSnapshot,
  ) => {
    const effectiveMeta = toolingMeta || toolingMetaSnapshot || null;
    const toolingSummary = effectiveMeta?.toolingSummary || null;
    const replacementHistory = Array.isArray(effectiveMeta?.replacementHistory)
      ? effectiveMeta?.replacementHistory
      : [];

    if (!Array.isArray(toolLife)) {
      setToolHealth("unknown");
      setModalTitle("공구 상태");
      setModalBody(
        <div className="space-y-3 text-sm text-gray-700">
          <div className="text-base text-gray-500">공구 정보가 없습니다.</div>
        </div>,
      );
      setModalOpen(true);
      return;
    }

    const initialRows = toolLife.map((t: any, idx: number) => ({
      toolNum: t.toolNum ?? idx + 1,
      useCount: Number(t.useCount ?? 0) || 0,
      configCount: Number(t.configCount ?? 0) || 0,
      warningCount: Number(t.warningCount ?? 0) || 0,
      use: t.use ?? true,
    }));

    const summaryMap = new Map<string, any>(
      (Array.isArray(toolingSummary?.tools) ? toolingSummary.tools : []).map(
        (item: any) => [String(item?.toolNum || ""), item],
      ),
    );

    const openReplacementRecorder = (targetRow: any) => {
      let replacementKind: "normal" | "abnormal" = "normal";
      let replacementNote = "";
      let nextConfigCount =
        targetRow?.configCount != null && targetRow?.configCount !== 0
          ? String(targetRow.configCount)
          : "";

      const toolMeta = summaryMap.get(String(targetRow?.toolNum || ""));
      const recentHistory = replacementHistory
        .filter(
          (item: any) => Number(item?.toolNum) === Number(targetRow?.toolNum),
        )
        .slice(-5)
        .reverse();

      const buildReplacementBody = () => (
        <div className="space-y-4 text-sm text-gray-700">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
            <div className="text-sm font-extrabold text-slate-900">
              공구 #{targetRow?.toolNum}
            </div>
            <div className="text-xs text-slate-600">
              현재 사용 {targetRow?.useCount || 0} / 예상 교체{" "}
              {Math.round(
                Number(
                  toolMeta?.predictedReplacementUseCount ||
                    targetRow?.configCount ||
                    0,
                ),
              ) || 0}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                replacementKind = "normal";
                setModalBody(buildReplacementBody());
              }}
              className={`rounded-xl border px-3 py-3 text-left ${
                replacementKind === "normal"
                  ? "border-primary bg-primary-muted/40 text-primary-strong"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className="font-extrabold">정상 교체</div>
              <div className="mt-1 text-[11px]">예상 수명 도달로 교체</div>
            </button>
            <button
              type="button"
              onClick={() => {
                replacementKind = "abnormal";
                setModalBody(buildReplacementBody());
              }}
              className={`rounded-xl border px-3 py-3 text-left ${
                replacementKind === "abnormal"
                  ? "border-destructive/80 bg-destructive-soft text-destructive"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className="font-extrabold">비정상 교체</div>
              <div className="mt-1 text-[11px]">파손/알람 등 긴급 교체</div>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-500">
              새 설정값(선택)
            </div>
            <input
              type="number"
              defaultValue={nextConfigCount}
              onChange={(e) => {
                nextConfigCount = e.target.value;
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-primary"
              placeholder="기존 설정값 유지"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-500">메모</div>
            <textarea
              rows={4}
              defaultValue={replacementNote}
              onChange={(e) => {
                replacementNote = e.target.value;
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-primary focus:ring-primary"
              placeholder="교체 사유, 파손 위치, 알람 번호 등을 남겨주세요."
            />
          </div>

          {recentHistory.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">
                최근 교체 이력
              </div>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 max-h-40 overflow-auto">
                {recentHistory.map((item: any, idx: number) => (
                  <div
                    key={`${String(item?.createdAt || idx)}`}
                    className="text-xs text-slate-600"
                  >
                    <span className="font-semibold text-slate-800">
                      {item?.kind === "abnormal" ? "비정상" : "정상"}
                    </span>
                    <span className="ml-2">
                      {String(item?.createdAt || "")
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                    <span className="ml-2">
                      사용 {Number(item?.observedUseCount || 0)}
                    </span>
                    {item?.note ? (
                      <div className="mt-1 text-slate-500">{item.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() =>
                openToolDetail(initialRows, level, effectiveMeta || undefined)
              }
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!workUid) return;
                  const ok = await ensureCncWriteAllowed();
                  if (!ok) return;
                  try {
                    const payload = {
                      toolNum: targetRow?.toolNum,
                      kind: replacementKind,
                      note: replacementNote,
                      newConfigCount:
                        nextConfigCount === "" ? null : Number(nextConfigCount),
                      predictedReplacementUseCount:
                        toolMeta?.predictedReplacementUseCount ||
                        targetRow?.configCount ||
                        0,
                    };
                    const res = await callRaw(
                      workUid,
                      "RecordToolReplacement",
                      payload,
                    );
                    const data: any = res?.data ?? res;
                    const nextRows =
                      data?.machineToolLife?.toolLife ??
                      data?.machineToolLife?.toolLifeInfo ??
                      [];
                    const nextMeta = {
                      toolingSummary: data?.machineToolLife?.toolingSummary,
                      replacementHistory:
                        data?.machineToolLife?.replacementHistory,
                      observations: data?.machineToolLife?.observations,
                    };
                    const nextLevel = resolveSummaryLevel(
                      nextMeta.toolingSummary,
                    );
                    setToolHealth(nextLevel);
                    setLastToolHealthLevel(nextLevel);
                    setToolTooltip(
                      buildSummaryTooltip(nextMeta.toolingSummary),
                    );
                    openToolDetail(nextRows, nextLevel, nextMeta);
                  } catch (e: any) {
                    const msg =
                      e?.message ?? "공구 교체 기록 중 오류가 발생했습니다.";
                    setError(msg);
                    setToolHealth("alarm");
                    setToolTooltip(msg);
                  }
                })();
              }}
              className="rounded-lg bg-primary-strong px-4 py-2 text-sm font-medium text-white hover:bg-primary-strong"
            >
              교체 기록 + 초기화
            </button>
          </div>
        </div>
      );

      setModalTitle(`공구 교체 #${targetRow?.toolNum}`);
      setModalBody(buildReplacementBody());
      setModalOpen(true);
    };

    const buildBody = (rows: any[]) => (
      <div className="space-y-3 text-sm text-gray-700">
        {toolingSummary ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700">
                예측 요약
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
                경고 {Number(toolingSummary?.warningCount || 0)}개
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200">
                교체 필요 {Number(toolingSummary?.alarmCount || 0)}개
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-600">
              {buildSummaryTooltip(toolingSummary)}
            </div>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="min-w-0 max-h-[60vh] overflow-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-[11px] sm:text-xs table-fixed">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2.5 text-center w-14">툴번호</th>
                  <th className="px-2 py-2.5 text-center w-14">옵셋</th>
                  <th className="px-2 py-2.5 text-center w-16">사용횟수</th>
                  <th className="px-2 py-2.5 text-center w-16">설정값</th>
                  <th className="px-2 py-2.5 text-center w-16">잔여(%)</th>
                  <th className="px-2 py-2.5 text-center w-20">교체</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t: any, idx: number) => {
                  const use = t.useCount ?? 0;
                  const cfg = t.configCount ?? 0;
                  const toolMeta = summaryMap.get(String(t.toolNum ?? idx + 1));
                  const ratio =
                    Number(toolMeta?.predictedReplacementUseCount || 0) > 0
                      ? use /
                        Number(toolMeta?.predictedReplacementUseCount || 0)
                      : cfg > 0
                        ? use / cfg
                        : 0;

                  let rowLevel: HealthLevel = "unknown";
                  if (toolMeta?.status === "alarm") rowLevel = "alarm";
                  else if (toolMeta?.status === "warn") rowLevel = "warn";
                  else if (toolMeta?.status === "ok") rowLevel = "ok";
                  else if (cfg > 0) {
                    if (ratio >= 1) rowLevel = "alarm";
                    else if (ratio >= 0.95) rowLevel = "warn";
                    else rowLevel = "ok";
                  }

                  const levelColor =
                    rowLevel === "alarm"
                      ? "bg-destructive-soft"
                      : rowLevel === "warn"
                        ? "bg-accent-soft"
                        : rowLevel === "ok"
                          ? "bg-primary-soft"
                          : "bg-gray-50";

                  const remainPercent =
                    cfg > 0 ? Math.max(0, 1 - ratio) * 100 : 0;

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-gray-50/70 ${levelColor}`}
                    >
                      <td className="px-2 py-2.5 text-center text-gray-800 font-semibold">
                        <div>{t.toolNum ?? idx + 1}</div>
                        {toolMeta?.status === "warn" ||
                        toolMeta?.status === "alarm" ? (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            {toolMeta?.status === "alarm"
                              ? "교체필요"
                              : "교체임박"}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            openToolOffsetEditor(t.toolNum ?? idx + 1)
                          }
                          className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-primary-muted bg-primary-soft text-[11px] text-primary-strong hover:bg-primary-soft hover:border-primary/70"
                        >
                          수정
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-gray-400">
                        <input
                          type="number"
                          defaultValue={use}
                          disabled
                          className="w-full bg-gray-50 border border-gray-200 rounded-md px-1.5 py-1 text-[11px] text-center cursor-not-allowed"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-gray-600">
                        <input
                          type="number"
                          defaultValue={cfg}
                          step={1000}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const next = [...rows];
                            next[idx] = {
                              ...next[idx],
                              configCount: Number.isFinite(v) ? v : 0,
                            };
                            setToolLifeRows(next);
                            setToolLifeDirty(true);
                            setModalBody(buildBody(next));
                          }}
                          onBlur={() => {
                            scheduleToolLifeSaveRef.current?.();
                          }}
                          className="w-full bg-white border border-gray-200 rounded-md px-1 py-0.5 text-[11px] text-center focus:ring-primary focus:border-primary"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-gray-800">
                        {cfg > 0 ? `${remainPercent.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => openReplacementRecorder(t)}
                          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          교체
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-base text-gray-500">공구 정보가 없습니다.</div>
        )}
      </div>
    );

    const body = buildBody(initialRows);

    setToolingMetaSnapshot(effectiveMeta || null);
    setToolLifeOriginal(toolLife);
    setToolLifeRows(initialRows);
    setToolLifeDirty(false);
    setToolHealth(level);
    setLastToolHealthLevel(level);
    setToolTooltip(buildSummaryTooltip(toolingSummary));
    setModalTitle("공구 상태");
    setModalBody(body);
    setToolStatusBodySnapshot(body);
    setModalOpen(true);
  };

  const persistToolLifeChanges = async (closeModal: boolean) => {
    if (
      !workUid ||
      !toolLifeRows ||
      toolLifeRows.length === 0 ||
      !toolLifeOriginal ||
      toolLifeOriginal.length === 0
    ) {
      setToolLifeSaveConfirmOpen(false);
      setToolLifeDirty(false);
      if (closeModal) setModalOpen(false);
      return;
    }
    const ok = await ensureCncWriteAllowed();
    if (!ok) {
      return;
    }
    try {
      // Mode2 DLL 예제(Form1.cs) 패턴과 동일하게,
      // 원본 MachineToolLife 객체를 기준으로 일부 필드만 수정된 항목만 전송한다.
      const changedList: any[] = [];

      for (let idx = 0; idx < toolLifeRows.length; idx++) {
        const row = toolLifeRows[idx];
        const orig = toolLifeOriginal[idx];
        if (!orig) continue;

        const nextUseCountRaw = Number(row.useCount ?? 0) || 0;
        let nextConfigCount = Number(row.configCount ?? 0) || 0;
        let nextWarningCount = Number(row.warningCount ?? 0) || 0;

        // DLL 쪽 제약을 안전하게 만족시키기 위해 값 보정
        const nextUseCount = Math.max(0, nextUseCountRaw);
        if (nextConfigCount < nextUseCount) {
          nextConfigCount = nextUseCount;
        }
        if (nextWarningCount < 0) {
          nextWarningCount = 0;
        }
        if (nextWarningCount > 0) {
          // 경고 카운트는 사용/설정 범위 내에 있도록 클램핑
          if (nextWarningCount < nextUseCount) {
            nextWarningCount = nextUseCount;
          }
          if (nextWarningCount > nextConfigCount) {
            nextWarningCount = nextConfigCount;
          }
        }
        const nextUse =
          typeof row.use === "boolean" ? row.use : (orig.use ?? true);

        const hasDiff =
          nextUseCount !== (orig.useCount ?? 0) ||
          nextConfigCount !== (orig.configCount ?? 0) ||
          nextWarningCount !== (orig.warningCount ?? 0) ||
          nextUse !== (orig.use ?? true);

        if (!hasDiff) continue;

        changedList.push({
          ...orig,
          toolNum: row.toolNum ?? orig.toolNum ?? idx + 1,
          useCount: nextUseCount,
          configCount: nextConfigCount,
          warningCount: nextWarningCount,
          use: nextUse,
        });
      }

      if (changedList.length === 0) {
        setToolLifeSaveConfirmOpen(false);
        setToolLifeDirty(false);
        if (closeModal) setModalOpen(false);
        return;
      }

      const res = await callRaw(workUid, "UpdateToolLife", changedList);
      const success = !res || res.success !== false;
      if (!success) {
        const msg =
          res?.message ||
          res?.error ||
          "툴 수명 업데이트 실패 (백엔드 UpdateToolLife 응답 확인 필요)";
        throw new Error(msg);
      }

      const data: any = res?.data ?? res;
      const nextRows =
        data?.machineToolLife?.toolLife ??
        data?.machineToolLife?.toolLifeInfo ??
        [];
      const nextMeta = {
        toolingSummary: data?.machineToolLife?.toolingSummary,
        replacementHistory: data?.machineToolLife?.replacementHistory,
        observations: data?.machineToolLife?.observations,
      };
      const nextLevel = resolveSummaryLevel(nextMeta.toolingSummary);

      setToolTooltip(buildSummaryTooltip(nextMeta.toolingSummary));
      setToolHealth(nextLevel);
      setLastToolHealthLevel(nextLevel);
      setToolLifeDirty(false);
      setToolLifeSaveConfirmOpen(false);
      setToolingMetaSnapshot(nextMeta);

      if (Array.isArray(nextRows) && nextRows.length > 0) {
        const nextOrig = nextRows.map((row: any, idx: number) => ({
          ...(toolLifeOriginal?.[idx] || {}),
          toolNum: row.toolNum ?? idx + 1,
          useCount: row.useCount ?? 0,
          configCount: row.configCount ?? 0,
          warningCount: row.warningCount ?? 0,
          use: typeof row.use === "boolean" ? row.use : true,
        }));
        setToolLifeOriginal(nextOrig);
        setToolLifeRows(nextOrig);
      }

      if (closeModal) {
        setModalOpen(false);
      }
    } catch (e: any) {
      const msg = e?.message ?? "툴 수명 업데이트 중 오류가 발생했습니다.";
      setError(msg);
      setToolHealth("alarm");
      setToolTooltip(msg);
      setToolLifeSaveConfirmOpen(false);
      setToolLifeDirty(false);
      if (closeModal) setModalOpen(false);
    }
  };

  const handleToolLifeSaveConfirm = async () => {
    await persistToolLifeChanges(true);
  };

  // ── 3단계 공구 교체 워크플로우 UI ────────────────────────────────────────────

  /**
   * Step 1: 공구 해제 확인 모달
   * "공구 해제" 버튼 클릭 시 표시. BeginToolRemoval API를 호출한다.
   * 이후 작업자는 장비에서 실제 공구를 제거한 뒤 Step 2로 진행한다.
   */
  const openRemovalConfirm = (targetRow: any, slot: ToolSlot | null) => {
    const toolNum = targetRow?.toolNum;
    const slotName = slot?.toolName ? `"${slot.toolName}"` : `#${toolNum}`;
    const isAlreadyRemoving = slot?.replacementStatus === "removing";

    const body = (
      <div className="space-y-4 text-sm text-gray-700">
        {/* 슬롯 정보 요약 */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
          <div className="text-sm font-extrabold text-slate-900">
            공구 {slotName} 해제
          </div>
          <div className="text-xs text-slate-600">
            사용 {targetRow?.useCount ?? 0}회
          </div>
        </div>

        {isAlreadyRemoving ? (
          <div className="rounded-xl border border-accent-muted bg-accent-soft px-4 py-3 text-xs text-accent-strong">
            <span className="font-semibold">이미 해제 요청됨.</span>{" "}
            {slot?.removalRequestedByName
              ? `${slot.removalRequestedByName}가 `
              : ""}
            장비에서 공구를 분리 중입니다.
            <br />
            장비에서 실제 공구 교체가 완료됐으면{" "}
            <span className="font-semibold">교체 완료 기록</span>을 진행하세요.
          </div>
        ) : (
          <div className="rounded-xl border border-accent-muted bg-accent-soft px-4 py-3 text-xs text-accent-strong">
            웹앱에서 해제 요청 후{" "}
            <span className="font-semibold">장비에서 직접 공구를 교체</span>
            하세요.
            <br />
            교체 완료 후 다시 웹앱에서{" "}
            <span className="font-semibold">교체 완료 기록</span>을 눌러 완료
            처리합니다.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              void reloadToolStatusPanel();
            }}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            취소
          </button>
          {/* 이미 removing 상태면 바로 Step2(교체완료)로 이동 */}
          {isAlreadyRemoving ? (
            <button
              type="button"
              onClick={() => openCompleteReplacement(targetRow, slot)}
              className="rounded-lg bg-primary-strong px-4 py-2 text-sm font-medium text-white hover:bg-primary-strong"
            >
              교체 완료 기록
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!onBeginToolRemoval) return;
                  const nextSlots = await onBeginToolRemoval(toolNum);
                  if (nextSlots) {
                    toolSlotsRef.current = nextSlots;
                    // 해제 요청 성공 → Step2 안내 화면으로 전환
                    openRemovalPending(targetRow, toolNum);
                  }
                })();
              }}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              공구 해제 요청
            </button>
          )}
        </div>
      </div>
    );

    setModalTitle(`공구 해제 · #${toolNum}`);
    setModalBody(body);
    setModalOpen(true);
  };

  /**
   * Step 1.5: 해제 요청 완료 → 장비에서 실제 교체 진행 안내 화면
   */
  const openRemovalPending = (targetRow: any, toolNum: number) => {
    const body = (
      <div className="space-y-4 text-sm text-gray-700">
        <div className="rounded-xl border border-accent-muted bg-accent-soft px-5 py-4 space-y-2 text-center">
          <div className="text-2xl">🔧</div>
          <div className="text-sm font-extrabold text-accent-strong">
            장비에서 공구를 교체하세요
          </div>
          <div className="text-xs text-accent-strong leading-relaxed">
            웹앱에서 공구 해제 요청이 완료됐습니다.
            <br />
            지금 장비에서 공구 #{toolNum}을 실제로 교체하세요.
            <br />
            교체 완료 후 아래 버튼을 눌러 완료 처리합니다.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              void reloadToolStatusPanel();
            }}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => openCompleteReplacement(targetRow, null)}
            className="rounded-lg bg-primary-strong px-4 py-2 text-sm font-medium text-white hover:bg-primary-strong"
          >
            교체 완료 기록 →
          </button>
        </div>
      </div>
    );

    setModalTitle(`장비 교체 진행 중 · #${toolNum}`);
    setModalBody(body);
    setModalOpen(true);
  };

  /**
   * Step 2: 교체 완료 기록 모달
   * 공구 정보(이름/타입/메모), 교체 종류, 메모를 입력받고
   * CompleteToolReplacement API를 호출한다.
   */
  const openCompleteReplacement = (targetRow: any, slot: ToolSlot | null) => {
    const toolNum = targetRow?.toolNum;
    const toolMeta = summaryMapForSlot?.get(String(toolNum ?? ""));

    let replacementKind: "normal" | "abnormal" = "normal";
    let replacementNote = "";
    let newToolName = slot?.toolName ?? "";

    const buildBody = () => (
      <div className="space-y-4 text-sm text-gray-700">
        {/* 현재 슬롯 상태 요약 */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
          <div className="text-sm font-extrabold text-slate-900">
            공구 #{toolNum} 교체 완료 기록
          </div>
          <div className="text-xs text-slate-600">
            교체 전 사용 {targetRow?.useCount ?? 0}회 · 예상 교체{" "}
            {Math.round(
              Number(
                toolMeta?.predictedReplacementUseCount ||
                  targetRow?.configCount ||
                  0,
              ),
            ) || 0}
            회
          </div>
        </div>

        {/* 교체 종류 선택 */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">교체 종류</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                replacementKind = "normal";
                setModalBody(buildBody());
              }}
              className={`rounded-xl border px-3 py-3 text-left ${
                replacementKind === "normal"
                  ? "border-primary bg-primary-muted/40 text-primary-strong"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className="font-extrabold">정상 교체</div>
              <div className="mt-1 text-[11px]">예상 수명 도달로 교체</div>
            </button>
            <button
              type="button"
              onClick={() => {
                replacementKind = "abnormal";
                setModalBody(buildBody());
              }}
              className={`rounded-xl border px-3 py-3 text-left ${
                replacementKind === "abnormal"
                  ? "border-destructive/80 bg-destructive-soft text-destructive"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <div className="font-extrabold">비정상 교체</div>
              <div className="mt-1 text-[11px]">파손/알람 등 긴급 교체</div>
            </button>
          </div>
        </div>

        {/* 공구 메타 업데이트 (선택) — 이름만 입력 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500">
            새 공구 이름{" "}
            <span className="text-slate-400 font-normal">
              (선택 — 공구가 바뀌었을 때)
            </span>
          </div>
          <input
            type="text"
            defaultValue={newToolName}
            onChange={(e) => {
              newToolName = e.target.value;
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-primary"
            placeholder="공구 이름 (예: 드릴 1.2mm)"
          />
        </div>

        {/* 메모 */}
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500">메모</div>
          <textarea
            rows={3}
            defaultValue={replacementNote}
            onChange={(e) => {
              replacementNote = e.target.value;
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-primary focus:ring-primary"
            placeholder="교체 사유, 파손 위치, 알람 번호 등을 남겨주세요."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => openRemovalConfirm(targetRow, slot)}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!onCompleteToolReplacement) return;
                const payload = {
                  toolNum,
                  kind: replacementKind,
                  note: replacementNote,
                  predictedReplacementUseCount:
                    toolMeta?.predictedReplacementUseCount ||
                    targetRow?.configCount ||
                    0,
                  toolName: newToolName,
                };
                const data = await onCompleteToolReplacement(payload);
                if (data) {
                  // 교체 완료 후 공구 상태 화면으로 복귀
                  const nextRows =
                    data?.machineToolLife?.toolLife ??
                    data?.machineToolLife?.toolLifeInfo ??
                    [];
                  const nextMeta = {
                    toolingSummary: data?.machineToolLife?.toolingSummary,
                    replacementHistory:
                      data?.machineToolLife?.replacementHistory,
                    observations: data?.machineToolLife?.observations,
                  };
                  const nextLevel = resolveSummaryLevel(
                    nextMeta.toolingSummary,
                  );
                  const nextSlots = Array.isArray(data?.toolSlots)
                    ? (data.toolSlots as ToolSlot[])
                    : undefined;
                  if (nextSlots) {
                    toolSlotsRef.current = nextSlots;
                  }
                  setToolHealth(nextLevel);
                  setLastToolHealthLevel(nextLevel);
                  setToolTooltip(buildSummaryTooltip(nextMeta.toolingSummary));
                  openToolDetailWithSlots(
                    nextRows,
                    nextLevel,
                    nextMeta,
                    nextSlots,
                  );
                }
              })();
            }}
            className="rounded-lg bg-primary-strong px-4 py-2 text-sm font-medium text-white hover:bg-primary-strong"
          >
            교체 완료 확인 ✓
          </button>
        </div>
      </div>
    );

    setModalTitle(`교체 완료 기록 · #${toolNum}`);
    setModalBody(buildBody());
    setModalOpen(true);
  };

  // summaryMap — openCompleteReplacement에서 사용
  let summaryMapForSlot: Map<string, any> | null = null;

  /**
   * 공구 상태 테이블 + 슬롯 교체 상태 배지를 함께 표시하는 openToolDetail 확장 버전.
   * toolSlots 데이터가 없으면 기존 openToolDetail과 동일하게 동작한다.
   */
  const openToolDetailWithSlots = (
    toolLife: any[] | null,
    level: HealthLevel,
    toolingMeta?: ToolingMetaSnapshot,
    slotsOverride?: ToolSlot[],
  ) => {
    const effectiveMeta = toolingMeta || toolingMetaSnapshot || null;
    const toolingSummary = effectiveMeta?.toolingSummary || null;
    const slotsForPanel = slotsOverride ?? toolSlotsRef.current;

    const baseRows: ToolLifeRow[] = Array.isArray(toolLife)
      ? toolLife.map((t: any, idx: number) => ({
          toolNum: t.toolNum ?? idx + 1,
          useCount: Number(t.useCount ?? 0) || 0,
          configCount: Number(t.configCount ?? 0) || 0,
          warningCount: Number(t.warningCount ?? 0) || 0,
          use: t.use ?? true,
        }))
      : (toolLifeRowsRef.current ?? []);

    // 템플릿 적용으로 슬롯만 생긴 경우에도 목록에 보이도록 합친다.
    const rowMap = new Map(baseRows.map((r) => [r.toolNum, r]));
    for (const slot of slotsForPanel) {
      const tn = Number(slot?.toolNum);
      if (!Number.isFinite(tn) || tn < 1) continue;
      if (rowMap.has(tn)) continue;
      rowMap.set(tn, {
        toolNum: tn,
        useCount: 0,
        configCount: 0,
        warningCount: 0,
        use: true,
      });
    }
    const rows = Array.from(rowMap.values()).sort(
      (a, b) => a.toolNum - b.toolNum,
    );
    toolLifeRowsRef.current = rows;

    // summaryMap 갱신 (openCompleteReplacement에서 참조)
    summaryMapForSlot = new Map<string, any>(
      (Array.isArray(toolingSummary?.tools) ? toolingSummary.tools : []).map(
        (item: any) => [String(item?.toolNum || ""), item],
      ),
    );

    const renderPanel = (panelRows: ToolLifeRow[]) => (
      <CncToolStatusPanel
        rows={panelRows}
        toolSlots={slotsForPanel}
        toolingSummary={toolingSummary}
        canAddTool={Boolean(onAddToolRef.current)}
        canBeginRemoval={Boolean(onBeginToolRemoval)}
        onAddTool={() => openAddToolDialogRef.current()}
        onSaveAsTemplate={() => openSaveTemplateDialogRef.current()}
        onLoadTemplate={() => openLoadTemplateDialogRef.current()}
        onDeleteTool={
          onDeleteToolRef.current
            ? async (toolNum) => {
                const del = onDeleteToolRef.current;
                if (!del) return false;
                const result = await del(toolNum);
                if (!result) return false;
                toolSlotsRef.current = result.toolSlots;
                const nextLevel = resolveSummaryLevel(result.toolingSummary);
                openToolDetailWithSlotsRef.current(
                  result.toolLife,
                  nextLevel,
                  {
                    toolingSummary: result.toolingSummary,
                  },
                  result.toolSlots,
                );
                return true;
              }
            : undefined
        }
        onClearAllTools={
          onClearAllToolsRef.current
            ? async () => {
                const clear = onClearAllToolsRef.current;
                if (!clear) return false;
                const result = await clear();
                if (!result) return false;
                toolSlotsRef.current = result.toolSlots;
                const nextLevel = resolveSummaryLevel(result.toolingSummary);
                openToolDetailWithSlotsRef.current(
                  result.toolLife,
                  nextLevel,
                  {
                    toolingSummary: result.toolingSummary,
                  },
                  result.toolSlots,
                );
                return true;
              }
            : undefined
        }
        onOpenOffset={(toolNum) => openToolOffsetEditor(toolNum)}
        onConfigChange={(index, configCount) => {
          const next = panelRows.map((row, i) =>
            i === index ? { ...row, configCount } : row,
          );
          toolLifeRowsRef.current = next;
          setToolLifeRows(next);
          setToolLifeDirty(true);
          setModalBody(renderPanel(next));
        }}
        onConfigBlur={() => {
          scheduleToolLifeSaveRef.current?.();
        }}
        onRequestRemoval={(row, slot) => openRemovalConfirm(row, slot)}
        onCompleteReplacement={(row, slot) =>
          openCompleteReplacement(row, slot)
        }
      />
    );

    setToolingMetaSnapshot(effectiveMeta || null);
    if (Array.isArray(toolLife)) {
      setToolLifeOriginal(rows);
      setToolLifeRows(rows);
    }
    setToolLifeDirty(false);
    setToolHealth(level);
    setLastToolHealthLevel(level);
    setToolTooltip(buildSummaryTooltip(toolingSummary));
    setModalTitle("공구 상태");
    setModalBody(renderPanel(rows));
    setToolStatusBodySnapshot(renderPanel(rows));
    setModalOpen(true);
  };
  openToolDetailWithSlotsRef.current = openToolDetailWithSlots;

  /**
   * 사용 통계 모달
   * 슬롯별 사용 시간 · 사용 횟수 · 교체 주기를 표시한다.
   */
  const openUsageStatsModal = () => {
    const statsMap = new Map<number, MachiningStatEntry>();
    for (const s of machiningStats) {
      statsMap.set(s.toolNum, s);
    }

    // 공구 슬롯은 있는데 아직 통계가 없는 경우도 0값으로 노출
    for (const slot of toolSlots) {
      const toolNum = Number(slot?.toolNum || 0);
      if (!Number.isFinite(toolNum) || toolNum <= 0) continue;
      if (statsMap.has(toolNum)) continue;
      statsMap.set(toolNum, {
        toolNum,
        totalJobCount: 0,
        totalMachiningSeconds: 0,
        currentJobCount: 0,
        currentMachiningSeconds: 0,
        lastJobAt: null,
        dailyBuckets: [],
      });
    }

    const displayStats = Array.from(statsMap.values()).sort(
      (a, b) => a.toolNum - b.toolNum,
    );
    const totalStat = displayStats.find((s) => s.toolNum === 0) ?? null;
    const slotStats = displayStats.filter((s) => s.toolNum !== 0);

    const toolingSummary = toolingMetaSnapshot?.toolingSummary;
    const summaryMap = new Map<string, any>(
      (Array.isArray(toolingSummary?.tools) ? toolingSummary.tools : []).map(
        (item: any) => [String(item?.toolNum || ""), item],
      ),
    );
    const lifeMap = new Map<number, ToolLifeRow>(
      (Array.isArray(toolLifeRows) ? toolLifeRows : []).map((row: any) => [
        Number(row?.toolNum || 0),
        row,
      ]),
    );
    const replacementHistory = Array.isArray(
      toolingMetaSnapshot?.replacementHistory,
    )
      ? toolingMetaSnapshot.replacementHistory
      : [];
    const recentHistory = [...replacementHistory].sort(
      (a: any, b: any) =>
        new Date(b?.createdAt || 0).getTime() -
        new Date(a?.createdAt || 0).getTime(),
    );

    const formatDate = (value: unknown) =>
      value ? String(value).slice(0, 10) : "—";

    const body = (
      <div className="space-y-4 text-sm text-slate-700">
        <div className="space-y-1 text-xs leading-relaxed text-slate-500">
          <p>
            슬롯별 공구 사용 시간과 교체 주기입니다. 현재 장착 이후 값은 교체
            완료 시 리셋됩니다.
          </p>
          <p>
            교체 주기는 과거 교체 이력의 평균 사용 횟수이며, 이력이 없으면 설정
            값을 사용합니다. 공구별 횟수·시간은 NC에 등장한 툴번호(예: T0707 →
            #7) 기준으로 합산합니다.
          </p>
        </div>

        {totalStat ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-slate-400">
                누계 사용시간
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                {formatSeconds(totalStat.totalMachiningSeconds)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-slate-400">
                현재 사용시간
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                {formatSeconds(totalStat.currentMachiningSeconds)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-slate-400">
                누계 사용건수
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                {totalStat.totalJobCount.toLocaleString()}건
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-slate-400">
                총 교체 횟수
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                {replacementHistory.length.toLocaleString()}회
              </div>
            </div>
          </div>
        ) : null}

        {slotStats.length === 0 && !totalStat ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
            사용 통계 데이터가 없습니다.
          </div>
        ) : slotStats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
            등록된 공구 슬롯이 없습니다.
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="max-h-[48vh] min-w-0 overflow-auto">
              <table className="w-full min-w-[920px] text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center">툴#</th>
                    <th className="px-2 py-2.5 text-left">공구명</th>
                    <th className="px-2 py-2.5 text-center">사용시간</th>
                    <th className="px-2 py-2.5 text-center">누계시간</th>
                    <th className="px-2 py-2.5 text-center">사용횟수</th>
                    <th className="px-2 py-2.5 text-center">교체주기</th>
                    <th className="px-2 py-2.5 text-center">잔여</th>
                    <th className="px-2 py-2.5 text-center">교체횟수</th>
                    <th className="px-2 py-2.5 text-center">마지막 교체</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slotStats.map((stat) => {
                    const slot = toolSlots.find(
                      (s) => s.toolNum === stat.toolNum,
                    );
                    const meta = summaryMap.get(String(stat.toolNum));
                    const life = lifeMap.get(stat.toolNum);
                    const useCount = Number(
                      life?.useCount ?? meta?.useCount ?? stat.currentJobCount,
                    );
                    const cycle = Math.round(
                      Number(
                        meta?.avgReplacementUseCount ||
                          meta?.predictedReplacementUseCount ||
                          life?.configCount ||
                          0,
                      ),
                    );
                    const remaining =
                      cycle > 0
                        ? Math.max(0, cycle - useCount)
                        : Number(meta?.remainingUseCount || 0);
                    const replaceCount = Number(meta?.replacementCount || 0);
                    const lastReplaced =
                      slot?.lastReplacedAt || meta?.lastReplacementAt || null;

                    return (
                      <tr key={stat.toolNum} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-slate-800">
                          {stat.toolNum}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-left text-slate-700">
                          {slot?.toolName || "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-800">
                          {formatSeconds(stat.currentMachiningSeconds)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-700">
                          {formatSeconds(stat.totalMachiningSeconds)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-800">
                          {useCount.toLocaleString()}
                          {cycle > 0 ? (
                            <span className="text-slate-400">
                              {" "}
                              / {cycle.toLocaleString()}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-700">
                          {cycle > 0 ? `${cycle.toLocaleString()}회` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-700">
                          {cycle > 0 ? remaining.toLocaleString() : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-mono text-slate-700">
                          {replaceCount.toLocaleString()}회
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center text-[10px] text-slate-400">
                          {formatDate(lastReplaced)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {recentHistory.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              최근 교체 이력
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {/* 약 6행 높이까지 보이고, 이후는 내부 스크롤 */}
              <ul className="max-h-[13.5rem] divide-y divide-slate-100 overflow-y-auto">
                {recentHistory.map((item: any, idx: number) => (
                  <li
                    key={`${String(item?.toolNum || 0)}-${String(item?.createdAt || idx)}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs text-slate-600"
                  >
                    <span className="font-semibold text-slate-800">
                      #{item?.toolNum}
                    </span>
                    <span
                      className={
                        item?.kind === "abnormal"
                          ? "font-medium text-destructive"
                          : "font-medium text-primary-strong"
                      }
                    >
                      {item?.kind === "abnormal" ? "비정상" : "정상"}
                    </span>
                    <span className="font-mono text-slate-500">
                      {String(item?.createdAt || "")
                        .slice(0, 16)
                        .replace("T", " ")}
                    </span>
                    <span>
                      사용 {Number(item?.observedUseCount || 0).toLocaleString()}
                      회
                    </span>
                    {item?.createdByName ? (
                      <span className="text-slate-400">
                        {item.createdByName}
                      </span>
                    ) : null}
                    {item?.note ? (
                      <span className="w-full text-slate-400 sm:w-auto">
                        {item.note}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              void reloadToolStatusPanel();
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            돌아가기
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            닫기
          </button>
        </div>
      </div>
    );

    setModalTitle("사용 통계");
    setModalBody(body);
    setModalOpen(true);
  };

  /**
   * 공구 상태 화면으로 복귀.
   * 템플릿 적용 등으로 슬롯이 바뀌었을 수 있어 GetToolSlots로 먼저 맞춘다.
   */
  const returnToToolStatus = async () => {
    const uid = workUidRef.current;
    let slotsOverride: ToolSlot[] | undefined;
    if (uid) {
      try {
        const res = await callRawRef.current(uid, "GetToolSlots");
        const slots: ToolSlot[] = Array.isArray(res?.data?.toolSlots)
          ? res.data.toolSlots
          : [];
        toolSlotsRef.current = slots;
        slotsOverride = slots;
      } catch {
        // 슬롯 조회 실패 시에도 상태 화면은 연다
      }
      if (onReloadToolSlotsRef.current) {
        try {
          const reloaded = await onReloadToolSlotsRef.current();
          if (Array.isArray(reloaded)) {
            toolSlotsRef.current = reloaded;
            slotsOverride = reloaded;
          }
        } catch {
          // ignore
        }
      }
    }
    const fallbackLevel = lastToolHealthLevelRef.current;
    if (!uid) {
      openToolDetailWithSlotsRef.current(
        toolLifeRowsRef.current,
        fallbackLevel,
        undefined,
        slotsOverride ?? toolSlotsRef.current,
      );
      return;
    }
    try {
      const res = await callRawRef.current(uid, "GetToolLifeInfo");
      const data: any = res?.data ?? res;
      const toolLife =
        data?.machineToolLife?.toolLife ??
        data?.machineToolLife?.toolLifeInfo ??
        toolLifeRowsRef.current ??
        [];
      const meta = {
        toolingSummary: data?.machineToolLife?.toolingSummary,
        replacementHistory: data?.machineToolLife?.replacementHistory,
        observations: data?.machineToolLife?.observations,
      };
      const nextLevel = resolveSummaryLevel(meta.toolingSummary);
      setToolHealth(nextLevel);
      setLastToolHealthLevel(nextLevel);
      setToolTooltip(buildSummaryTooltip(meta.toolingSummary));
      openToolDetailWithSlotsRef.current(
        toolLife,
        nextLevel,
        meta,
        slotsOverride ?? toolSlotsRef.current,
      );
    } catch {
      openToolDetailWithSlotsRef.current(
        toolLifeRowsRef.current,
        fallbackLevel,
        undefined,
        slotsOverride ?? toolSlotsRef.current,
      );
    }
  };

  /**
   * 공구 추가 / 템플릿 저장 / 템플릿 불러오기.
   *
   * 흐름: 장비에서 세팅 → 템플릿으로 저장 → 다른 장비에서 불러오기 → 차이만 수정.
   * 슬롯 메타는 toolNum(필수) + toolName(선택)만 사용한다.
   */
  const openAddToolDialog = () => {
    if (!onAddToolRef.current) return;

    setModalTitle("공구 추가");
    setModalBody(
      <CncToolRegistrationModal
        mode="add"
        currentMachineId={workUidRef.current}
        onCancel={() => {
          void returnToToolStatus();
        }}
        onAddTool={async ({ toolNum, toolName }) => {
          const add = onAddToolRef.current;
          if (!add) return false;
          return add({ toolNum, toolName });
        }}
        onAfterApply={() => {
          void returnToToolStatus();
        }}
        setError={setError}
      />,
    );
    setModalOpen(true);
  };
  openAddToolDialogRef.current = openAddToolDialog;

  const openSaveTemplateDialog = () => {
    const slots = (toolSlotsRef.current || []).map((s) => ({
      toolNum: Number(s.toolNum),
      toolName: String(s.toolName || ""),
    }));

    setModalTitle("템플릿으로 저장");
    setModalBody(
      <CncToolRegistrationModal
        mode="save"
        currentMachineId={workUidRef.current}
        currentSlots={slots}
        onCancel={() => {
          void returnToToolStatus();
        }}
        onAddTool={async () => false}
        onAfterApply={() => {
          void returnToToolStatus();
        }}
        setError={setError}
      />,
    );
    setModalOpen(true);
  };
  openSaveTemplateDialogRef.current = openSaveTemplateDialog;

  const openLoadTemplateDialog = () => {
    // 등록 기준은 슬롯(toolSlots)만. toolLife 잔여 행만으로 막으면
    // 빈 화면인데도 "이미 등록됨" 오류가 나는 모순이 생긴다.
    const slots = (toolSlotsRef.current || []).map((s) => ({
      toolNum: Number(s.toolNum),
      toolName: String(s.toolName || ""),
    }));
    if (slots.length > 0) {
      setError("이미 등록된 공구가 있습니다. 모두 삭제한 뒤 불러오세요.");
      return;
    }

    setModalTitle("템플릿 불러오기");
    setModalBody(
      <CncToolRegistrationModal
        mode="load"
        currentMachineId={workUidRef.current}
        currentSlots={slots}
        onCancel={() => {
          void returnToToolStatus();
        }}
        onAddTool={async () => false}
        onAfterApply={() => {
          void returnToToolStatus();
        }}
        setError={setError}
      />,
    );
    setModalOpen(true);
  };
  openLoadTemplateDialogRef.current = openLoadTemplateDialog;

  scheduleToolLifeSaveRef.current = () => {
    if (toolLifeSaveTimeoutRef.current) {
      clearTimeout(toolLifeSaveTimeoutRef.current);
    }
    toolLifeSaveTimeoutRef.current = setTimeout(() => {
      void persistToolLifeChanges(false);
    }, 800);
  };

  return {
    modalOpen,
    modalTitle,
    modalBody,
    toolLifeRows,
    toolLifeDirty,
    toolLifeSaveConfirmOpen,
    setModalOpen,
    setModalTitle,
    setModalBody,
    setToolLifeRows,
    setToolLifeDirty,
    setToolLifeSaveConfirmOpen,
    openToolDetail,
    openToolOffsetEditor,
    handleToolLifeSaveConfirm,
    // 슬롯 교체 워크플로우 + 사용 통계 모달
    openToolDetailWithSlots,
    openUsageStatsModal,
  };
};
