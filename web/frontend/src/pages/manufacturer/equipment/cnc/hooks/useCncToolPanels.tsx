import { useRef, useState } from "react";

import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";

interface UseCncToolPanelsParams {
  workUid: string;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
  setError: (msg: string | null) => void;
  setToolHealth: (level: HealthLevel) => void;
  setToolTooltip: (msg: string) => void;
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
            "툴 오프셋 업데이트 실패 (Hi-Link UpdateToolOffset 응답 확인 필요)";
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
          "툴 수명 업데이트 실패 (Hi-Link UpdateToolLife 응답 확인 필요)";
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
  };
};
