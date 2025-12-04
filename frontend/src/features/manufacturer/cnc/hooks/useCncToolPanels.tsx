import { useState } from "react";

import type { HealthLevel } from "@/features/manufacturer/cnc/components/MachineCard";

interface UseCncToolPanelsParams {
  workUid: string;
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  ensureCncWriteAllowed: () => Promise<boolean>;
  setError: (msg: string | null) => void;
  setToolHealth: (level: HealthLevel) => void;
  setToolTooltip: (msg: string) => void;
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

  const [toolLifeOriginal, setToolLifeOriginal] = useState<any[] | null>(null);
  const [toolLifeRows, setToolLifeRows] = useState<any[] | null>(null);
  const [toolLifeDirty, setToolLifeDirty] = useState(false);
  const [toolLifeSaveConfirmOpen, setToolLifeSaveConfirmOpen] = useState(false);
  const [lastToolHealthLevel, setLastToolHealthLevel] =
    useState<HealthLevel>("unknown");
  const [toolStatusBodySnapshot, setToolStatusBodySnapshot] =
    useState<JSX.Element | null>(null);

  const openToolOffsetEditor = (initialToolNum?: number) => {
    if (!workUid) return;

    let toolNum = initialToolNum ?? 1;
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
                  openToolDetail(rows as any[], lastToolHealthLevel);
                  return;
                }

                if (!workUid) {
                  openToolDetail([], lastToolHealthLevel);
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
                    openToolDetail(toolLife, lastToolHealthLevel);
                  } catch (e) {
                    openToolDetail([], lastToolHealthLevel);
                  }
                })();
              }}
            >
              돌아가기
            </button>
            <button
              type="button"
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              onClick={async () => {
                if (!workUid) return;

                const ok = await ensureCncWriteAllowed();
                if (!ok) return;

                try {
                  const payload = {
                    toolGeoOffsetArray: [
                      { no: toolNum, x: geoX, y: geoY, z: geoZ, r: geoR },
                    ],
                    toolWearOffsetArray: [
                      { x: wearX, y: wearY, z: wearZ, r: wearR },
                    ],
                    toolTipOffsetArray: [tipL],
                  };

                  const res = await callRaw(
                    workUid,
                    "UpdateToolOffset",
                    payload
                  );
                  const success = !res || res.success !== false;
                  if (!success) {
                    const msg =
                      res?.message ||
                      res?.error ||
                      "툴 오프셋 업데이트 실패 (Hi-Link UpdateToolOffset 응답 확인 필요)";
                    throw new Error(msg);
                  }

                  setToolTooltip(
                    `툴 #${toolNum} 오프셋이 업데이트되었습니다. (기하/마모/팁)`
                  );
                  setModalOpen(false);
                } catch (e: any) {
                  const msg =
                    e?.message ?? "툴 오프셋 업데이트 중 오류가 발생했습니다.";
                  setError(msg);
                  setToolHealth("alarm");
                  setToolTooltip(msg);
                }
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    );
    setModalOpen(true);
  };

  const openToolDetail = (toolLife: any[], level: HealthLevel) => {
    if (!Array.isArray(toolLife)) {
      setToolHealth("unknown");
      setModalTitle("공구 상태");
      setModalBody(
        <div className="space-y-3 text-sm text-gray-700">
          <div className="text-base text-gray-500">공구 정보가 없습니다.</div>
        </div>
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

    const buildBody = (rows: any[]) => (
      <div className="space-y-2 text-sm text-gray-700">
        {rows.length > 0 ? (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-[11px] sm:text-xs table-fixed">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2.5 text-center w-12">툴번호</th>
                  <th className="px-2 py-2.5 text-center w-14">옵셋</th>
                  <th className="px-2 py-2.5 text-center w-16">사용횟수</th>
                  <th className="px-2 py-2.5 text-center w-16">설정값</th>
                  <th className="px-2 py-2.5 text-center w-16">잔여(%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t: any, idx: number) => {
                  const use = t.useCount ?? 0;
                  const cfg = t.configCount ?? 0;
                  const ratio = cfg > 0 ? use / cfg : 0;

                  let rowLevel: HealthLevel = "unknown";
                  if (cfg > 0) {
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
                        {t.toolNum ?? idx + 1}
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
                          className="w-full bg-white border border-gray-200 rounded-md px-1 py-0.5 text-[11px] text-center focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-gray-800">
                        {cfg > 0 ? `${remainPercent.toFixed(0)}%` : "-"}
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

    setToolLifeOriginal(toolLife);
    setToolLifeRows(initialRows);
    setToolLifeDirty(false);
    setToolHealth(level);
    setLastToolHealthLevel(level);
    setModalTitle("공구 상태");
    setModalBody(body);
    setToolStatusBodySnapshot(body);
    setModalOpen(true);
  };

  const handleToolLifeSaveConfirm = async () => {
    if (
      !workUid ||
      !toolLifeRows ||
      toolLifeRows.length === 0 ||
      !toolLifeOriginal ||
      toolLifeOriginal.length === 0
    ) {
      setToolLifeSaveConfirmOpen(false);
      setToolLifeDirty(false);
      setModalOpen(false);
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
          typeof row.use === "boolean" ? row.use : orig.use ?? true;

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
        setModalOpen(false);
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

      const msg = "툴 수명 설정값이 저장되었습니다.";
      setToolTooltip(msg);
      setToolHealth("ok");
      setToolLifeDirty(false);
      setToolLifeSaveConfirmOpen(false);
      setModalOpen(false);
    } catch (e: any) {
      const msg = e?.message ?? "툴 수명 업데이트 중 오류가 발생했습니다.";
      setError(msg);
      setToolHealth("alarm");
      setToolTooltip(msg);
      setToolLifeSaveConfirmOpen(false);
      setToolLifeDirty(false);
      setModalOpen(false);
    }
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
