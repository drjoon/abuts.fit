import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Machine } from "@/pages/manufacturer/equipment/cnc/types";
import { useToast } from "@/shared/hooks/use-toast";

export const useCncWorkBoard = (
  workUid: string,
  machines: Machine[],
  setLoading: (l: boolean) => void,
  setError: (e: string | null) => void,
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>,
) => {
  const { toast } = useToast();
  const { token } = useAuthStore();

  const shouldSilenceBridgeDownError = (msg: string) => {
    const t = String(msg || "").toLowerCase();
    return (
      t.includes("proxy failed") ||
      t.includes("raw proxy") ||
      t.includes("bridge proxy") ||
      t.includes("programs/active")
    );
  };

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
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<
    { status: "ok" | "error"; message?: string | null; at: string }[]
  >([]);
  const workBoardErrorShownRef = useRef(false);

  const refreshWorkBoard = async () => {
    if (!workUid) return;
    const targetUid = workUid || (machines[0]?.uid ?? "");
    if (!targetUid) {
      setError("먼저 장비를 등록하고 선택해 주세요.");
      return;
    }

    const targetMachine = machines.find((m) => m.uid === targetUid);
    const isConfigured = !!(
      targetMachine?.ip && Number(targetMachine?.port || 0) > 0
    );
    if (!isConfigured) {
      setOpStatus(null);
      setProgramSummary(null);
      setScanStatus("idle");
      setScanError(null);
      return;
    }

    setLoading(true);
    setScanStatus("running");
    setScanError(null);
    setError(null);

    try {
      // GetOPStatus와 GetProgListInfo만 병렬 처리 (필수 정보)
      const [opRes, listRes] = await Promise.all([
        callRaw(targetUid, "GetOPStatus"),
        callRaw(targetUid, "GetProgListInfo", 1), // 1=메인
      ]);

      setOpStatus(opRes?.data ?? opRes);

      const pl = (listRes && (listRes.data ?? listRes)) as any;
      const progList = pl?.machineProgramListInfo?.programArray ?? [];

      // 현재 프로그램은 progList에서 active 상태인 것을 찾기 (API 호출 제거)
      const current = Array.isArray(progList)
        ? progList.find(
            (p: any) => p?.active === true || p?.status === "ACTIVE",
          )
        : null;

      setProgramSummary({
        current,
        list: Array.isArray(progList) ? progList : [],
      });

      const now = new Date();
      const ts = now.toLocaleTimeString();
      setLastScanAt(ts);
      setScanHistory((prev) => {
        const next = [
          {
            status: "ok" as const,
            message: null,
            at: ts,
          },
          ...prev,
        ];
        return next.slice(0, 5);
      });
      setScanStatus("ok");
    } catch (e: any) {
      const message = e?.message ?? "작업 상태 보드 갱신 중 오류";
      console.warn("refreshWorkBoard error", message, e);
      setScanStatus("error");
      setScanError(message);
      const now = new Date();
      const ts = now.toLocaleTimeString();
      setLastScanAt(ts);
      setScanHistory((prev) => {
        const next = [
          {
            status: "error" as const,
            message,
            at: ts,
          },
          ...prev,
        ];
        return next.slice(0, 5);
      });
      if (shouldSilenceBridgeDownError(message)) {
        return;
      }

      if (!workBoardErrorShownRef.current) {
        workBoardErrorShownRef.current = true;
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const targetUid = workUid || (machines[0]?.uid ?? "");
    if (!targetUid) return;
    void refreshWorkBoard();
  }, [workUid, machines.length]);

  const fetchMotorTemp = async () => {
    if (!workUid) return;
    try {
      const res = await callRaw(workUid, "GetMotorTemperature");
      setMotorTemp(res?.data ?? res);
    } catch (e: any) {
      setError(e?.message ?? "모터 온도 조회 중 오류");
    }
  };

  const fetchToolLife = async () => {
    if (!workUid) return;
    try {
      const res = await callRaw(workUid, "GetToolLifeInfo");
      const toolData = (res && (res.data ?? res)) as any;
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

  const fetchProgramList = async () => {
    if (!workUid) return;
    try {
      const listRes = await callRaw(workUid, "GetProgListInfo", 1); // 1=메인

      const pl = (listRes && (listRes.data ?? listRes)) as any;
      const progList = pl?.machineProgramListInfo?.programArray ?? [];
      const current = Array.isArray(progList)
        ? progList.find(
            (p: any) => p?.active === true || p?.status === "ACTIVE",
          )
        : null;

      setProgramSummary({
        current,
        list: Array.isArray(progList) ? progList : [],
      });
    } catch (e: any) {
      const msg = e?.message ?? "프로그램 목록 조회 중 오류";
      if (shouldSilenceBridgeDownError(msg)) {
        return;
      }
      setError(msg);
    }
  };

  const togglePanelIO = async (ioUid: string) => {
    if (!workUid || !opStatus || !Array.isArray(opStatus?.ioInfo)) return;
    const target = opStatus.ioInfo.find((io: any) => io?.IOUID === ioUid);
    if (!target) return;

    const nextStatus = ((target.Status ?? target.status ?? 0) + 1) % 2;
    const payload = { ...target, Status: nextStatus };

    try {
      await callRaw(workUid, "UpdateOPStatus", payload);
      setOpStatus((prev: any) => {
        if (!prev || !Array.isArray(prev.ioInfo)) return prev;
        return {
          ...prev,
          ioInfo: prev.ioInfo.map((io: any) =>
            io?.IOUID === ioUid ? { ...io, Status: nextStatus } : io,
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
    lastScanAt,
    scanHistory,
    refreshWorkBoard,
    fetchMotorTemp,
    fetchToolLife,
    fetchProgramList,
    setOpStatus,
    togglePanelIO,
  };
};
