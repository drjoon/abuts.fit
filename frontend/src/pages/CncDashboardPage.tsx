import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Machine } from "@/features/cnc/types";
import { useCncMachines } from "@/features/cnc/hooks/useCncMachines";
import { useCncWorkBoard } from "@/features/cnc/hooks/useCncWorkBoard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Plus, Settings, Trash, X } from "lucide-react";

export const CncDashboardPage = () => {
  const {
    machines,
    setMachines,
    loading,
    setLoading,
    error,
    setError,
    form,
    setForm,
    addModalOpen,
    setAddModalOpen,
    addModalMode,
    setAddModalMode,
    handleChange,
    handleEditMachine,
    handleDeleteMachine,
    handleAddMachine,
  } = useCncMachines();

  const [workUid, setWorkUid] = useState<string>("");
  useEffect(() => {
    if (machines.length > 0 && !workUid) {
      setWorkUid(machines[0].hiLinkUid);
    }
  }, [machines, workUid]);

  const {
    opStatus,
    motorTemp,
    toolSummary,
    programSummary,
    scanStatus,
    scanError,
    refreshWorkBoard,
    fetchMotorTemp,
    fetchToolLife,
    fetchProgramList,
    setOpStatus,
    togglePanelIO,
  } = useCncWorkBoard(workUid, machines, setLoading, setError);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalBody, setModalBody] = useState<JSX.Element | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const callRawHelper = async (
    hiLinkUid: string,
    dataType: string,
    payload: any = {}
  ) => {
    const res = await fetch(
      `/api/core/machines/${encodeURIComponent(hiLinkUid)}/raw`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: hiLinkUid, dataType, payload }),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.success === false) {
      const msg =
        body?.message ||
        body?.error ||
        `${dataType} 호출 실패 (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return body;
  };

  // 선택된 장비(workUid)가 바뀔 때마다 해당 장비의 상태를 한 번만 조회
  useEffect(() => {
    if (!workUid) return;
    void refreshStatusFor(workUid);
  }, [workUid]);

  const openProgramDetail = async (prog: any) => {
    if (!workUid || !prog) return;
    try {
      const headType = prog.headType ?? 0;
      const programNo = prog.programNo ?? prog.no;
      if (programNo == null) return;
      const payload = { machineProgramData: { headType, programNo } };
      const res = await callRawHelper(workUid, "GetProgDataInfo", payload);
      const data: any = res?.data ?? res;
      const body = data?.machineProgramData ?? data;
      setModalTitle(`프로그램 #${programNo} 상세`);
      setModalBody(
        <div className="space-y-2 text-sm">
          <div className="text-base text-gray-500">
            Head: {headType === 1 ? "SUB" : "MAIN"}, Program: #{programNo}
          </div>
          <pre className="max-h-[60vh] overflow-auto bg-gray-100 text-gray-800 p-4 rounded-lg border whitespace-pre-wrap text-sm">
            {JSON.stringify(body, null, 2)}
          </pre>
        </div>
      );
      setModalOpen(true);
    } catch (e: any) {
      setError(e?.message ?? "프로그램 상세 조회 중 오류");
    }
  };

  const openToolDetail = async () => {
    if (!workUid) return;
    try {
      const res = await callRawHelper(workUid, "GetToolLifeInfo");
      const data: any = res?.data ?? res;
      const toolLife =
        data?.machineToolLife?.toolLife ??
        data?.machineToolLife?.toolLifeInfo ??
        [];
      setModalTitle("공구 상태 상세");
      setModalBody(
        <div className="text-lg space-y-4">
          <div className="text-base text-gray-500">
            총 {Array.isArray(toolLife) ? toolLife.length : 0}개 공구
          </div>
          {Array.isArray(toolLife) && toolLife.length > 0 ? (
            <div className="max-h-[60vh] overflow-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-base">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">No</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      사용횟수
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      설정값
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      경고값
                    </th>
                    <th className="px-4 py-2 text-center font-semibold">
                      사용
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {toolLife.map((t: any, idx: number) => (
                    <tr
                      key={idx}
                      className="border-t border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2">{t?.toolNum}</td>
                      <td className="px-4 py-2 text-right">{t?.useCount}</td>
                      <td className="px-4 py-2 text-right">{t?.configCount}</td>
                      <td className="px-4 py-2 text-right">
                        {t?.warningCount}
                      </td>
                      <td
                        className={`px-4 py-2 text-center font-semibold ${
                          t?.use ? "text-green-600" : "text-gray-400"
                        }`}
                      >
                        {t?.use ? "ON" : "OFF"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-base text-gray-500">공구 정보가 없습니다.</div>
          )}
        </div>
      );
      setModalOpen(true);
    } catch (e: any) {
      setError(e?.message ?? "공구 상세 조회 중 오류");
    }
  };

  const { toast } = useToast();

  const [isPausedAll, setIsPausedAll] = useState(false);
  const [machineManagerOpen, setMachineManagerOpen] = useState(false);

  // 장비 추가/수정 모달
  const handleAddMachineFromModal = async () => {
    await handleAddMachine();
  };

  // 에러 상태가 변경될 때 앱 공용 토스트로 표시
  useEffect(() => {
    if (!error) return;
    toast({
      title: "CNC 에러",
      description: error,
      variant: "destructive",
    });
  }, [error, toast]);

  const emergencyToggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = isPausedAll
        ? "/api/core/machines/resume-all"
        : "/api/core/machines/pause-all";
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.message || (isPausedAll ? "재시작 실패" : "일시중단 실패")
        );
      }
      setIsPausedAll(!isPausedAll);
      toast({
        title: isPausedAll ? "재시작 실행" : "일시중단 실행",
        description: isPausedAll
          ? "모든 장비에 연속운전 신호를 전송했습니다."
          : "모든 장비에 정지 신호를 전송했습니다.",
        variant: "destructive",
      });
    } catch (e: any) {
      const message =
        e?.message ?? (isPausedAll ? "재시작 중 오류" : "일시중단 중 오류");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Hi-Link UID 기준으로 상태를 리프레시한다.
  const refreshStatusFor = async (hiLinkUid: string) => {
    try {
      const res = await fetch(
        `/api/core/machines/${encodeURIComponent(hiLinkUid)}/status`
      );
      if (!res.ok) {
        throw new Error("상태 조회 실패");
      }
      const data = await res.json();

      setMachines((prev) => {
        return prev.map((m) =>
          m.hiLinkUid === hiLinkUid
            ? {
                ...m,
                status: data.status ?? "Unknown",
                lastUpdated: new Date().toLocaleTimeString(),
                lastCommand: "status",
                lastError: null,
              }
            : m
        );
      });
    } catch (e: any) {
      const message = e?.message ?? "알 수 없는 오류";
      setError(message);
      setMachines((prev) =>
        prev.map((m) =>
          m.hiLinkUid === hiLinkUid
            ? { ...m, lastCommand: "status", lastError: message }
            : m
        )
      );
    }
  };

  const getMachineStatusChip = (status: string) => {
    const s = (status || "").toUpperCase();

    let color = "bg-gray-400"; // 기본: Unknown → 회색

    if (["RUN", "RUNNING", "ONLINE", "OK"].some((k) => s.includes(k))) {
      color = "bg-green-500"; // 정상/가공 중
    } else if (["WARN", "WARNING"].some((k) => s.includes(k))) {
      color = "bg-orange-400"; // 경고
    } else if (["ALARM", "ERROR", "FAULT"].some((k) => s.includes(k))) {
      color = "bg-red-500"; // 에러/알람
    } else if (["STOP", "IDLE"].some((k) => s.includes(k))) {
      color = "bg-yellow-500"; // 정지/대기
    }

    return <div className={`w-4 h-4 rounded-full ${color} shadow-inner`}></div>;
  };

  const getOpStatusText = (status: string) => {
    switch (status) {
      case "RUNNING":
      case "Run":
        return "가동 중";
      case "IDLE":
      case "Stop":
        return "대기/정지";
      case "ALARM":
      case "Alarm":
        return "알람";
      default:
        return status || "확인불가";
    }
  };

  const sendControlCommand = async (
    uid: string,
    action: "start" | "stop" | "reset"
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/core/machines/${encodeURIComponent(uid)}/${action}`,
        {
          method: "POST",
        }
      );
      if (!res.ok) {
        throw new Error(`${action} 실패`);
      }
      await refreshStatusFor(uid);
    } catch (e: any) {
      const message = e?.message ?? "알 수 없는 오류";
      setError(message);
      setMachines((prev) =>
        prev.map((m) =>
          m.hiLinkUid === uid
            ? { ...m, lastCommand: action, lastError: message }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await handleDeleteMachine(deleteTarget.name);
    toast({
      title: "장비 삭제",
      description: `${deleteTarget.name} 장비가 삭제되었습니다.`,
    });
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 to-blue-100 text-gray-800 p-4 sm:p-6 lg:p-8">
      <main className="bg-white/60 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <div className="flex flex-wrap gap-2 mb-3 sm:mb-0">
            {machines.length === 0 ? (
              <h2 className="text-2xl font-bold text-gray-800">작업 모니터</h2>
            ) : (
              machines.map((m) => {
                const isActive =
                  (workUid || machines[0]?.hiLinkUid) === m.hiLinkUid;
                const statusLabel = getOpStatusText(m.status);
                return (
                  <button
                    key={m.hiLinkUid}
                    type="button"
                    onClick={() => setWorkUid(m.hiLinkUid)}
                    className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-2 shadow-sm transition-colors ${
                      isActive
                        ? "bg-blue-600 border-blue-700 text-white"
                        : "bg-white/80 border-gray-300 text-gray-800 hover:bg-gray-100"
                    }`}
                  >
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-xs opacity-80">{statusLabel}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 sm:mt-0">
            <button
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-md"
              onClick={emergencyToggle}
              disabled={loading}
            >
              {isPausedAll ? "전체 재시작" : "전체 일시중단"}
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-gray-600 text-white text-sm font-semibold hover:bg-gray-700 transition-colors shadow-md"
              onClick={() => setMachineManagerOpen(true)}
            >
              장비 관리
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-md"
              onClick={refreshWorkBoard}
              disabled={loading || machines.length === 0}
            >
              {scanStatus === "running" ? "갱신 중..." : "상태 새로고침"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {(() => {
            if (scanStatus === "running" && !opStatus) {
              return (
                <div className="col-span-full text-center py-16 text-xl text-gray-500">
                  장비 상태를 불러오는 중...
                </div>
              );
            }
            if (scanError && !opStatus) {
              return (
                <div className="col-span-full text-center py-16 text-red-600 bg-red-50 rounded-lg">
                  <p className="text-xl font-bold">오류: {scanError}</p>
                  <p className="mt-2">
                    장비 상태를 가져올 수 없습니다. 장비 연결을 확인하세요.
                  </p>
                </div>
              );
            }
            if (!opStatus) {
              return (
                <div className="col-span-full text-center py-16 text-xl text-gray-500">
                  <p>선택된 장비가 없거나, 장비 정보를 불러올 수 없습니다.</p>
                </div>
              );
            }

            const activeUid = workUid || machines[0]?.hiLinkUid;
            const m = machines.find((x) => x.hiLinkUid === activeUid);
            const status = m?.status ?? "Unknown";
            const statusLabel = getOpStatusText(status);

            return (
              <>
                {/* Status Card */}
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <h3 className="font-bold text-xl mb-4 text-gray-700">
                    장비 상태
                  </h3>
                  <div className="flex items-center space-x-4">
                    {getMachineStatusChip(status)}
                    <span className="text-4xl font-bold text-gray-800">
                      {statusLabel}
                    </span>
                  </div>
                  <div className="text-base text-gray-500 mt-3">
                    <p>UID: {activeUid ?? "-"}</p>
                    <p>갱신: {m?.lastUpdated ?? "-"}</p>
                  </div>
                </div>

                {/* Active Program Card */}
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 lg:col-span-2">
                  <h3 className="font-bold text-xl mb-4 text-gray-700">
                    활성 프로그램
                  </h3>
                  {programSummary?.current ? (
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        #{programSummary.current.programNo}
                      </p>
                      <p className="text-lg text-gray-600 mt-1">
                        {programSummary.current.comment}
                      </p>
                      {/* <div className="w-full bg-gray-200 rounded-full h-4 mt-4">
                        <div className="bg-blue-500 h-4 rounded-full" style={{ width: `${programSummary.current.progress ?? 0}%` }}></div>
                      </div> */}
                    </div>
                  ) : (
                    <p className="text-lg text-gray-400">없음</p>
                  )}
                </div>

                {/* Tool Summary Card */}
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-xl text-gray-700">
                      공구 상태
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        className="px-2 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100"
                        onClick={() => void fetchToolLife()}
                      >
                        정보 갱신
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100"
                        onClick={openToolDetail}
                      >
                        상세 보기
                      </button>
                    </div>
                  </div>
                  {toolSummary ? (
                    <div className="flex items-baseline space-x-3">
                      <p>
                        <span className="text-4xl font-bold">
                          {toolSummary.total}
                        </span>
                        <span className="text-xl ml-1">개</span>
                      </p>
                      {toolSummary.needReplace > 0 && (
                        <p
                          className={`text-xl font-semibold ${
                            toolSummary.needReplace > 0
                              ? "text-red-500"
                              : "text-gray-500"
                          }`}
                        >
                          ({toolSummary.needReplace}개 교체 필요)
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-lg text-gray-400">정보 없음</p>
                  )}
                </div>

                {/* Program List Card */}
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 lg:col-span-3">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-xl text-gray-700">
                      프로그램 목록
                    </h3>
                    <button
                      type="button"
                      className="px-3 py-1 rounded-full border border-gray-300 text-gray-600 text-xs hover:bg-gray-100"
                      onClick={() => void fetchProgramList()}
                    >
                      목록 갱신
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto text-sm sm:text-base pr-2 space-y-4">
                    {programSummary?.current ? (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 mb-1">
                          현재 가공중
                        </div>
                        <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                          <span className="font-semibold text-emerald-700">
                            #{programSummary.current.programNo} -{" "}
                            {programSummary.current.comment}
                          </span>
                          <span className="text-xs text-emerald-600">
                            {programSummary.current.headType === 1
                              ? "SUB"
                              : "MAIN"}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {(() => {
                      const list = programSummary?.list ?? [];
                      if (!Array.isArray(list) || list.length === 0) {
                        return (
                          <p className="text-gray-400 text-sm">프로그램 없음</p>
                        );
                      }

                      const currentNo = programSummary?.current?.programNo;
                      const currentHead = programSummary?.current?.headType;

                      const rest = list.filter((p: any) => {
                        if (currentNo == null) return true;
                        return !(
                          p.programNo === currentNo || p.no === currentNo
                        );
                      });

                      if (rest.length === 0) return null;

                      const [nextProg, ...queued] = rest;

                      return (
                        <div className="space-y-3">
                          {nextProg && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 mb-1">
                                다음 가공 예정
                              </div>
                              <button
                                type="button"
                                className="w-full flex justify-between items-center p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-200"
                                onClick={() => openProgramDetail(nextProg)}
                              >
                                <span className="font-semibold text-gray-800">
                                  #{nextProg.no ?? nextProg.programNo} -{" "}
                                  {nextProg.comment}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {nextProg.headType === 1 ? "SUB" : "MAIN"}
                                </span>
                              </button>
                            </div>
                          )}

                          {queued.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 mb-1">
                                대기중
                              </div>
                              <ul className="space-y-1">
                                {queued.map((p: any, i: number) => (
                                  <li key={i}>
                                    <button
                                      type="button"
                                      className="w-full flex justify-between items-center p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                                      onClick={() => openProgramDetail(p)}
                                    >
                                      <span className="text-gray-800">
                                        #{p.no ?? p.programNo} - {p.comment}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {p.headType === 1 ? "SUB" : "MAIN"}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Motor Temp Card */}
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-xl text-gray-700">
                      모터 온도
                    </h3>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-full border border-gray-300 text-gray-600 text-xs hover:bg-gray-100"
                      onClick={() => void fetchMotorTemp()}
                    >
                      온도 갱신
                    </button>
                  </div>
                  <div className="space-y-3 text-lg">
                    {motorTemp?.machineMotorTemperature?.tempInfo?.map(
                      (t: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-600">{t.name}</span>
                          <span
                            className={`font-bold ${
                              t.temperature >= 70
                                ? "text-red-500"
                                : t.temperature >= 50
                                ? "text-yellow-500"
                                : "text-gray-800"
                            }`}
                          >
                            {t.temperature}°C
                          </span>
                        </div>
                      )
                    ) ?? <p className="text-gray-400">정보 없음</p>}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </main>

      {machineManagerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-full max-w-4xl transform transition-all">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">장비 관리</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setAddModalMode("create");
                    setForm({ name: "", hiLinkUid: "", ip: "" });
                    setAddModalOpen(true);
                  }}
                  className="text-blue-500 hover:text-blue-600 p-1 rounded-full transition-colors"
                  aria-label="장비 추가"
                >
                  <Plus size={24} />
                </button>
                <button
                  onClick={() => setMachineManagerOpen(false)}
                  className="text-gray-500 hover:text-gray-800 p-1 rounded-full transition-colors"
                  aria-label="닫기"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[70vh] overflow-y-auto p-1">
              {machines.map((m) => (
                <div
                  key={m.hiLinkUid}
                  className="bg-white p-3 rounded-xl shadow-md flex flex-col justify-between hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-base text-gray-800">
                      {m.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {getMachineStatusChip(m.status)}
                      <button
                        onClick={() => handleEditMachine(m)}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded-full transition-colors"
                        aria-label="장비 수정"
                      >
                        <Settings size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(m);
                          setDeleteConfirmOpen(true);
                        }}
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full transition-colors"
                        aria-label="장비 삭제"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {machines.length === 0 && (
                <p className="col-span-full text-center text-gray-500 py-16">
                  등록된 장비가 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen && !!deleteTarget}
        title="장비 삭제 확인"
        description={
          deleteTarget && (
            <span>
              정말로 <span className="font-semibold">{deleteTarget.name}</span>{" "}
              장비를 삭제하시겠습니까?
            </span>
          )
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      {addModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">
              {addModalMode === "edit" ? "장비 정보 수정" : "새 장비 추가"}
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-lg font-medium mb-2 text-gray-700">
                  장비 이름
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-lg px-4 py-3 text-lg focus:ring-blue-500 focus:border-blue-500 transition"
                  disabled={addModalMode === "edit"}
                  placeholder="예: M1"
                />
              </div>
              <div>
                <label className="block text-lg font-medium mb-2 text-gray-700">
                  Hi-Link UID
                </label>
                <input
                  type="text"
                  value={form.hiLinkUid}
                  onChange={(e) => handleChange("hiLinkUid", e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-lg px-4 py-3 text-lg focus:ring-blue-500 focus:border-blue-500 transition"
                  placeholder="예: M3 (Hi-Link UID)"
                />
              </div>
              <div>
                <label className="block text-lg font-medium mb-2 text-gray-700">
                  IP 주소
                </label>
                <input
                  type="text"
                  value={form.ip}
                  onChange={(e) => handleChange("ip", e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-lg px-4 py-3 text-lg focus:ring-blue-500 focus:border-blue-500 transition"
                  placeholder="예: 172.22.60.30"
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-8">
              <button
                onClick={() => setAddModalOpen(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddMachineFromModal}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                disabled={loading}
              >
                {loading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-3xl transform transition-all">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">{modalTitle}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-4xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-2">{modalBody}</div>
          </div>
        </div>
      )}
    </div>
  );
};
