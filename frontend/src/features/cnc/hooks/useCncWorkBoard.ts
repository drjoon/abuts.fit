import { useState, useEffect, useRef } from "react";
import { Machine } from "@/features/cnc/types";
import { useToast } from "@/hooks/use-toast";

const callRawHelper = async (
  uid: string,
  dataType: string,
  payload: any = {}
) => {
  const res = await fetch(`/api/core/machines/${encodeURIComponent(uid)}/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, dataType, payload }),
  });
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

export const useCncWorkBoard = (
  workUid: string,
  machines: Machine[],
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void
) => {
  const [opStatus, setOpStatus] = useState<any | null>(null);
  const [motorTemp, setMotorTemp] = useState<any | null>(null);
  const [toolSummary, setToolSummary] = useState<{
    needReplace: number;
    total: number;
  } | null>(null);
  const [programSummary, setProgramSummary] = useState<{
    current?: any;
    list?: any[];
  } | null>(null);
  const [scanStatus, setScanStatus] = useState<
    "idle" | "running" | "ok" | "error"
  >("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const workBoardErrorShownRef = useRef(false);
  const { toast } = useToast();

  const refreshWorkBoard = async () => {
    const targetUid = workUid || (machines[0]?.hiLinkUid ?? "");
    if (!targetUid) {
      setError("먼저 장비를 등록하고 선택해 주세요.");
      return;
    }

    setLoading(true);
    setScanStatus("running");
    setScanError(null);
    setError(null);

    try {
      const [opRes, progListRes, progActRes] = await Promise.all([
        callRawHelper(targetUid, "GetOPStatus"),
        callRawHelper(targetUid, "GetProgListInfo").catch(() => null),
        callRawHelper(targetUid, "GetActivateProgInfo").catch(() => null),
      ]);

      setOpStatus(opRes?.data ?? opRes);

      const pl = (progListRes && (progListRes.data ?? progListRes)) as any;
      const progList = pl?.machineProgramListInfo?.programArray ?? [];
      const act = (progActRes && (progActRes.data ?? progActRes)) as any;
      const current = act?.machineCurrentProgInfo ?? null;
      setProgramSummary({
        current,
        list: Array.isArray(progList) ? progList : [],
      });

      setScanStatus("ok");
    } catch (e: any) {
      const message = e?.message ?? "작업 상태 보드 갱신 중 오류";
      console.warn("refreshWorkBoard error", message, e);
      setScanStatus("error");
      setScanError(message);
      if (!workBoardErrorShownRef.current) {
        workBoardErrorShownRef.current = true;
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // 선택된 작업 장비(workUid)가 변경될 때마다 해당 UID 기준으로 한 번씩 전체 워크보드를 자동 갱신
  // React.StrictMode 개발 모드의 이중 마운트에서도 동일 UID에 대해 중복 호출되지 않도록 마지막 자동 갱신 UID를 기억한다.
  const lastAutoRefreshUidRef = useRef<string | null>(null);
  useEffect(() => {
    const targetUid = workUid || (machines[0]?.hiLinkUid ?? "");
    if (!targetUid) return;
    if (lastAutoRefreshUidRef.current === targetUid) return;
    lastAutoRefreshUidRef.current = targetUid;
    void refreshWorkBoard();
  }, [workUid, machines.length]);

  // 모터 온도만 별도로 갱신
  const fetchMotorTemp = async () => {
    const targetUid = workUid || (machines[0]?.hiLinkUid ?? "");
    if (!targetUid) return;
    try {
      const tempRes = await callRawHelper(targetUid, "GetMotorTemperature");
      setMotorTemp(tempRes?.data ?? tempRes);
    } catch (e: any) {
      setError(e?.message ?? "모터 온도 조회 중 오류");
    }
  };

  // 툴 수명 정보만 별도로 갱신
  const fetchToolLife = async () => {
    const targetUid = workUid || (machines[0]?.hiLinkUid ?? "");
    if (!targetUid) return;
    try {
      const toolRes = await callRawHelper(targetUid, "GetToolLifeInfo");
      const toolData = (toolRes && (toolRes.data ?? toolRes)) as any;
      const toolLife = toolData?.machineToolLife?.toolLife ?? [];
      let needReplace = 0;
      if (Array.isArray(toolLife)) {
        toolLife.forEach((t: any) => {
          const use = Number(t?.useCount ?? 0);
          const config = Number(t?.configCount ?? 0) || 0;
          const warn = Number(t?.warningCount ?? 0) || 0;
          if (config > 0 && (use >= config || use >= warn)) needReplace += 1;
        });
      }
      setToolSummary({
        needReplace,
        total: Array.isArray(toolLife) ? toolLife.length : 0,
      });
    } catch (e: any) {
      setError(e?.message ?? "툴 정보 조회 중 오류");
    }
  };

  // 프로그램 목록 및 현재 프로그램만 별도로 갱신
  const fetchProgramList = async () => {
    const targetUid = workUid || (machines[0]?.hiLinkUid ?? "");
    if (!targetUid) return;
    try {
      const [progListRes, progActRes] = await Promise.all([
        callRawHelper(targetUid, "GetProgListInfo").catch(() => null),
        callRawHelper(targetUid, "GetActivateProgInfo").catch(() => null),
      ]);

      const pl = (progListRes && (progListRes.data ?? progListRes)) as any;
      const progList = pl?.machineProgramListInfo?.programArray ?? [];
      const act = (progActRes && (progActRes.data ?? progActRes)) as any;
      const current = act?.machineCurrentProgInfo ?? null;

      setProgramSummary({
        current,
        list: Array.isArray(progList) ? progList : [],
      });
    } catch (e: any) {
      setError(e?.message ?? "프로그램 목록 조회 중 오류");
    }
  };

  const togglePanelIO = async (ioUid: string) => {
    if (!workUid || !opStatus || !Array.isArray(opStatus?.ioInfo)) return;
    const target = opStatus.ioInfo.find((io: any) => io?.IOUID === ioUid);
    if (!target) return;

    const nextStatus = ((target.Status ?? target.status ?? 0) + 1) % 2;
    const payload = { ...target, Status: nextStatus };

    try {
      await callRawHelper(workUid, "UpdateOPStatus", payload);
      setOpStatus((prev: any) => {
        if (!prev || !Array.isArray(prev.ioInfo)) return prev;
        return {
          ...prev,
          ioInfo: prev.ioInfo.map((io: any) =>
            io?.IOUID === ioUid ? { ...io, Status: nextStatus } : io
          ),
        };
      });
    } catch (e: any) {
      setError(e?.message ?? "패널 IO 업데이트 중 오류");
    }
  };

  return {
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
  };
};
