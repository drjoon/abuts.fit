import { useRef, useState } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";
import { CncToolRegistrationModal } from "@/pages/manufacturer/equipment/cnc/components/CncToolRegistrationModal";
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
  /** useCncToolSlots 훅에서 제공하는 가공 통계 (옵션) */
  machiningStats?: MachiningStatEntry[];
  /** 공구 해제 요청 함수 (useCncToolSlots.beginToolRemoval) */
  onBeginToolRemoval?: (toolNum: number) => Promise<boolean>;
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

  const [toolLifeOriginal, setToolLifeOriginal] = useState<any[] | null>(null);
  const [toolLifeRows, setToolLifeRows] = useState<any[] | null>(null);
  const [toolLifeDirty, setToolLifeDirty] = useState(false);
  const [toolLifeSaveConfirmOpen, setToolLifeSaveConfirmOpen] = useState(false);
  const [lastToolHealthLevel, setLastToolHealthLevel] =
    useState<HealthLevel>("unknown");
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
    if (dueTools.length === 0) return "공구 수명, 교체 확인";
    const head = dueTools
      .slice(0, 3)
      .map((item: any) => `#${item.toolNum}`)
      .join(", ");
    const suffix = dueTools.length > 3 ? ` 외 ${dueTools.length - 3}개` : "";
    return `교체 임박 ${head}${suffix}`;
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
          <div className="grid grid-cols-4 gap-2">
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
                  className="w-16 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">마모 오프셋</div>
          <div className="grid grid-cols-4 gap-2">
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
                  className="w-16 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 pt-2">
          <div className="flex-1 space-y-2 max-w-[12rem]">
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
              className="w-16 bg-white border border-gray-200 rounded-md px-2 py-1 text-[11px] focus:ring-blue-500 focus:border-blue-500"
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
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
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
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
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
                  ? "border-rose-300 bg-rose-50 text-rose-700"
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
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
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
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-blue-500 focus:ring-blue-500"
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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-100 bg-white shadow-sm">
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
                      ? "bg-red-50"
                      : rowLevel === "warn"
                        ? "bg-amber-50"
                        : rowLevel === "ok"
                          ? "bg-emerald-50"
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
                          className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-[11px] text-blue-700 hover:bg-blue-100 hover:border-blue-300"
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
                          className="w-full bg-white border border-gray-200 rounded-md px-1 py-0.5 text-[11px] text-center focus:ring-blue-500 focus:border-blue-500"
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
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
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-800">
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
            onClick={() => openToolDetailWithSlots(null, lastToolHealthLevel)}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            취소
          </button>
          {/* 이미 removing 상태면 바로 Step2(교체완료)로 이동 */}
          {isAlreadyRemoving ? (
            <button
              type="button"
              onClick={() => openCompleteReplacement(targetRow, slot)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              교체 완료 기록
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!onBeginToolRemoval) return;
                  const ok = await onBeginToolRemoval(toolNum);
                  if (ok) {
                    // 해제 요청 성공 → Step2 안내 화면으로 전환
                    openRemovalPending(targetRow, toolNum);
                  }
                })();
              }}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-2 text-center">
          <div className="text-2xl">🔧</div>
          <div className="text-sm font-extrabold text-amber-900">
            장비에서 공구를 교체하세요
          </div>
          <div className="text-xs text-amber-700 leading-relaxed">
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
            onClick={() => openToolDetailWithSlots(null, lastToolHealthLevel)}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => openCompleteReplacement(targetRow, null)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
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
                  ? "border-rose-300 bg-rose-50 text-rose-700"
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
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
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
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-300 focus:border-blue-500 focus:ring-blue-500"
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
                  setToolHealth(nextLevel);
                  setLastToolHealthLevel(nextLevel);
                  setToolTooltip(buildSummaryTooltip(nextMeta.toolingSummary));
                  openToolDetailWithSlots(nextRows, nextLevel, nextMeta);
                }
              })();
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
  ) => {
    const effectiveMeta = toolingMeta || toolingMetaSnapshot || null;
    const toolingSummary = effectiveMeta?.toolingSummary || null;

    const rows = Array.isArray(toolLife)
      ? toolLife.map((t: any, idx: number) => ({
          toolNum: t.toolNum ?? idx + 1,
          useCount: Number(t.useCount ?? 0) || 0,
          configCount: Number(t.configCount ?? 0) || 0,
          warningCount: Number(t.warningCount ?? 0) || 0,
          use: t.use ?? true,
        }))
      : (toolLifeRows ?? []);

    // summaryMap 갱신 (openCompleteReplacement에서 참조)
    summaryMapForSlot = new Map<string, any>(
      (Array.isArray(toolingSummary?.tools) ? toolingSummary.tools : []).map(
        (item: any) => [String(item?.toolNum || ""), item],
      ),
    );

    const slotMap = new Map<number, ToolSlot>(
      toolSlots.map((s) => [s.toolNum, s]),
    );

    const buildSlotTable = () => (
      <div className="space-y-3 text-sm text-gray-700">
        {/* 공구 추가 버튼 (onAddTool 콜백이 제공된 경우에만 노출) */}
        {onAddTool ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openAddToolDialog}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <span className="text-base leading-none">+</span> 공구 추가
            </button>
          </div>
        ) : null}

        {/* 요약 배너 */}
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

        {/* 교체 대기 중인 슬롯 알림 */}
        {toolSlots.some((s) => s.replacementStatus !== "mounted") ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 space-y-1">
            <div className="font-semibold">교체 진행 중인 공구</div>
            {toolSlots
              .filter((s) => s.replacementStatus !== "mounted")
              .map((s) => (
                <div key={s.toolNum} className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${s.replacementStatus === "removing" ? "bg-amber-400" : "bg-red-500"}`}
                  />
                  <span>
                    #{s.toolNum}
                    {s.toolName ? ` · ${s.toolName}` : ""}
                    {" — "}
                    {s.replacementStatus === "removing"
                      ? "해제 요청됨"
                      : "교체 대기"}
                  </span>
                </div>
              ))}
          </div>
        ) : null}

        {/* 공구 테이블 */}
        {rows.length > 0 ? (
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-[11px] sm:text-xs table-fixed">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2.5 text-center w-14">툴#</th>
                  <th className="px-2 py-2.5 text-left">공구</th>
                  <th className="px-2 py-2.5 text-center w-14">옵셋</th>
                  <th className="px-2 py-2.5 text-center w-16">사용</th>
                  <th className="px-2 py-2.5 text-center w-16">설정</th>
                  <th className="px-2 py-2.5 text-center w-16">잔여</th>
                  <th className="px-2 py-2.5 text-center w-20">교체</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t: any, idx: number) => {
                  const use = t.useCount ?? 0;
                  const cfg = t.configCount ?? 0;
                  const toolMeta = summaryMapForSlot?.get(
                    String(t.toolNum ?? idx + 1),
                  );
                  const slot = slotMap.get(t.toolNum ?? idx + 1) ?? null;
                  const isRemoving = slot?.replacementStatus === "removing";
                  const isRemoved = slot?.replacementStatus === "removed";

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

                  const levelBg =
                    isRemoving || isRemoved
                      ? "bg-amber-50"
                      : rowLevel === "alarm"
                        ? "bg-red-50"
                        : rowLevel === "warn"
                          ? "bg-amber-50"
                          : rowLevel === "ok"
                            ? "bg-emerald-50"
                            : "bg-gray-50";

                  const remainPercent =
                    cfg > 0 ? Math.max(0, 1 - ratio) * 100 : 0;

                  return (
                    <tr key={idx} className={`hover:bg-gray-50/70 ${levelBg}`}>
                      <td className="px-2 py-2.5 text-center text-gray-800 font-semibold">
                        <div>{t.toolNum ?? idx + 1}</div>
                        {(toolMeta?.status === "warn" ||
                          toolMeta?.status === "alarm") &&
                        !isRemoving &&
                        !isRemoved ? (
                          <div className="mt-0.5 text-[9px] font-semibold text-slate-500">
                            {toolMeta?.status === "alarm"
                              ? "교체필요"
                              : "교체임박"}
                          </div>
                        ) : null}
                        {isRemoving ? (
                          <div className="mt-0.5 text-[9px] font-semibold text-amber-600">
                            해제중
                          </div>
                        ) : null}
                        {isRemoved ? (
                          <div className="mt-0.5 text-[9px] font-semibold text-red-600">
                            교체대기
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-left">
                        <div className="text-slate-800 font-medium truncate max-w-[90px]">
                          {slot?.toolName || (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400" />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            openToolOffsetEditor(t.toolNum ?? idx + 1)
                          }
                          className="inline-flex items-center justify-center px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-[11px] text-blue-700 hover:bg-blue-100"
                        >
                          수정
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-gray-500 text-[11px]">
                        {use}
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
                            setModalBody(buildSlotTable());
                          }}
                          onBlur={() => {
                            scheduleToolLifeSaveRef.current?.();
                          }}
                          className="w-full bg-white border border-gray-200 rounded-md px-1 py-0.5 text-[11px] text-center focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-gray-800 text-[11px]">
                        {cfg > 0 ? `${remainPercent.toFixed(0)}%` : "-"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {/* 교체 진행 중이면 "교체 완료" 버튼, 아니면 "해제 요청" 버튼 */}
                        {isRemoving || isRemoved ? (
                          <button
                            type="button"
                            onClick={() => openCompleteReplacement(t, slot)}
                            className="inline-flex items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            완료
                          </button>
                        ) : onBeginToolRemoval ? (
                          <button
                            type="button"
                            onClick={() => openRemovalConfirm(t, slot)}
                            className="inline-flex items-center justify-center rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-100"
                          >
                            해제
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openRemovalConfirm(t, slot)}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            교체
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // 빈 상태: 공구 등록 안내 + CTA 버튼
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center space-y-3">
            <div className="text-3xl">🔧</div>
            <div className="text-base font-semibold text-slate-800">
              등록된 공구가 없습니다
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">
              슬롯 번호와 공구 정보를 입력해 등록하면
              <br />
              교체 워크플로우와 가공 통계를 사용할 수 있습니다.
            </div>
            {onAddTool ? (
              <button
                type="button"
                onClick={openAddToolDialog}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <span className="text-base leading-none">+</span> 공구 등록
                시작하기
              </button>
            ) : null}
          </div>
        )}
      </div>
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
    setModalBody(buildSlotTable());
    setToolStatusBodySnapshot(buildSlotTable());
    setModalOpen(true);
  };

  /**
   * 가공 통계 모달 (machiningStats 탭)
   * 슬롯별 누적/현재 가공 건수와 시간을 표시한다.
   */
  const openMachiningStatsModal = () => {
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

    const body = (
      <div className="space-y-4 text-sm text-gray-700">
        <div className="text-xs text-slate-500 space-y-1">
          <div>
            슬롯별 누적 가공 건수 및 시간. 현재 장착 이후 통계는 교체 완료 시
            리셋됩니다.
          </div>
          <div>
            ※ 공구별 통계는 의뢰 1건의 전체 소요시간을 장착된 각 공구에 동일
            합산하는 방식입니다. 따라서 공구별 합계는 전체(툴#0)보다 클 수 있습니다.
          </div>
        </div>

        {displayStats.length === 0 ? (
          <div className="text-base text-gray-400 text-center py-8">
            가공 통계 데이터가 없습니다.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-auto max-h-[60vh]">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2.5 text-center w-12">툴#</th>
                  <th className="px-2 py-2.5 text-left">공구명</th>
                  <th className="px-2 py-2.5 text-center">누계건수</th>
                  <th className="px-2 py-2.5 text-center">누계시간</th>
                  <th className="px-2 py-2.5 text-center">현재건수</th>
                  <th className="px-2 py-2.5 text-center">현재시간</th>
                  <th className="px-2 py-2.5 text-center">마지막</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayStats.map((stat) => {
                  const slot = toolSlots.find(
                    (s) => s.toolNum === stat.toolNum,
                  );
                  return (
                    <tr key={stat.toolNum} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-center font-semibold text-gray-800 whitespace-nowrap">
                        {stat.toolNum === 0 ? "전체" : stat.toolNum}
                      </td>
                      <td className="px-2 py-2.5 text-left text-slate-700 whitespace-nowrap">
                        {slot?.toolName || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-slate-800 whitespace-nowrap">
                        {stat.totalJobCount.toLocaleString()}건
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-slate-700 whitespace-nowrap">
                        {formatSeconds(stat.totalMachiningSeconds)}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-blue-700 whitespace-nowrap">
                        {stat.currentJobCount.toLocaleString()}건
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-blue-600 whitespace-nowrap">
                        {formatSeconds(stat.currentMachiningSeconds)}
                      </td>
                      <td className="px-2 py-2.5 text-center text-slate-400 text-[10px] whitespace-nowrap">
                        {stat.lastJobAt
                          ? String(stat.lastJobAt).slice(0, 10)
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => openToolDetailWithSlots(null, lastToolHealthLevel)}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
          >
            돌아가기
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            닫기
          </button>
        </div>
      </div>
    );

    setModalTitle("가공 통계");
    setModalBody(body);
    setModalOpen(true);
  };

  /**
   * 공구 등록 모달 — 단순화 + 템플릿 기반.
   *
   * 슬롯 메타는 toolNum(필수) + toolName(선택)만 사용한다.
   * 사용량/시간은 백엔드가 자동 누적해 충분한 데이터가 모이면 교체 시기를 예측한다.
   *
   * 모달은 3개 탭을 가진다:
   *  1) 직접 등록 — 현재 장비에 슬롯 1개 추가
   *  2) 템플릿 적용 — 저장된 템플릿을 1개 이상 장비에 Merge upsert
   *  3) 템플릿 관리 — 템플릿 생성/편집/삭제
   *
   * onAddTool은 toolNum + toolName만 전달한다 (toolType/toolNote/configCount 제거).
   */
  const openAddToolDialog = () => {
    if (!onAddTool) return;

    const closeAndReturn = async () => {
      // 등록/적용 후 공구 상태 화면을 다시 그리기 위해 현재 데이터를 재조회한다.
      try {
        const res = await callRaw(workUid, "GetToolLifeInfo");
        const data: any = res?.data ?? res;
        const toolLife =
          data?.machineToolLife?.toolLife ??
          data?.machineToolLife?.toolLifeInfo ??
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
        openToolDetailWithSlots(toolLife, nextLevel, meta);
      } catch {
        openToolDetailWithSlots(null, lastToolHealthLevel);
      }
    };

    setModalTitle("공구 등록");
    setModalBody(
      <CncToolRegistrationModal
        currentMachineId={workUid}
        onCancel={() => openToolDetailWithSlots(null, lastToolHealthLevel)}
        onAddTool={async ({ toolNum, toolName }) => {
          return onAddTool({ toolNum, toolName });
        }}
        onAfterApply={() => {
          void closeAndReturn();
        }}
        setError={setError}
      />,
    );
    setModalOpen(true);
  };

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
    // 슬롯 교체 워크플로우 + 통계 모달
    openToolDetailWithSlots,
    openMachiningStatsModal,
  };
};
