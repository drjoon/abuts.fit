import { useCallback, useState } from "react";

import { apiFetch } from "@/lib/apiClient";

interface Params {
  token: string | null;
  toast: (args: any) => void;
}

export function useCncDashboardMachineInfo({ token, toast }: Params) {
  const [machineInfoOpen, setMachineInfoOpen] = useState(false);
  const [machineInfoLoading, setMachineInfoLoading] = useState(false);
  const [machineInfoError, setMachineInfoError] = useState<string | null>(null);
  const [machineInfoProgram, setMachineInfoProgram] = useState<any | null>(null);
  const [machineInfoAlarms, setMachineInfoAlarms] = useState<
    { type: number; no: number }[]
  >([]);
  const [machineInfoUid, setMachineInfoUid] = useState<string | null>(null);
  const [machineInfoClearing, setMachineInfoClearing] = useState(false);

  const openMachineInfo = useCallback(
    async (uid: string) => {
      if (!uid) return;
      setMachineInfoOpen(true);
      setMachineInfoUid(uid);
      setMachineInfoLoading(true);
      setMachineInfoError(null);
      setMachineInfoProgram(null);
      setMachineInfoAlarms([]);

      try {
        const fetchRawDirect = async (dataType: string, payload: any = null) => {
          const res = await apiFetch({
            path: `/api/machines/${encodeURIComponent(uid)}/raw`,
            method: "POST",
            token,
            jsonBody: {
              uid,
              dataType,
              payload,
              bypassCooldown: true,
            },
          });
          const body = res.data ?? {};
          if (!res.ok || (body as any)?.success === false) {
            const msg =
              (body as any)?.message ||
              (body as any)?.error ||
              `${dataType} 호출 실패 (HTTP ${res.status})`;
            throw new Error(msg);
          }
          return body;
        };

        const [progMainRes, progSubRes, alarmRes] = await Promise.all([
          fetchRawDirect("GetActivateProgInfo", 1),
          fetchRawDirect("GetActivateProgInfo", 2),
          apiFetch({
            path: `/api/machines/${encodeURIComponent(uid)}/alarm`,
            method: "POST",
            token,
            jsonBody: { headType: 1 },
          }).then((res) => {
            const body = res.data ?? {};
            if (!res.ok || (body as any)?.success === false) {
              const msg =
                (body as any)?.message ||
                (body as any)?.error ||
                `alarm 호출 실패 (HTTP ${res.status})`;
              throw new Error(msg);
            }
            return body;
          }),
        ]);

        const pickProg = (res: any) => {
          const raw = res && (res.data ?? res);
          const data = raw?.data ?? raw;
          return (
            data?.machineCurrentProgInfo ??
            (data &&
            (data.mainProgramName ||
              data.subProgramName ||
              data.MainProgramName ||
              data.SubProgramName)
              ? {
                  mainProgramName:
                    data.mainProgramName ?? data.MainProgramName ?? null,
                  mainProgramComment:
                    data.mainProgramComment ?? data.MainProgramComment ?? null,
                  subProgramName:
                    data.subProgramName ?? data.SubProgramName ?? null,
                  subProgramComment:
                    data.subProgramComment ?? data.SubProgramComment ?? null,
                }
              : null)
          );
        };

        const mainInfo = pickProg(progMainRes);
        const subInfo = pickProg(progSubRes);

        const curInfo = {
          mainProgramName: mainInfo?.mainProgramName ?? null,
          mainProgramComment: mainInfo?.mainProgramComment ?? null,
          subProgramName:
            subInfo?.subProgramName ??
            subInfo?.mainProgramName ??
            null,
          subProgramComment:
            subInfo?.subProgramComment ?? subInfo?.mainProgramComment ?? null,
        };

        const hasAny =
          curInfo.mainProgramName || curInfo.subProgramName || mainInfo || subInfo;
        if (!hasAny) {
          throw new Error(
            "GetActivateProgInfo 응답이 비어있습니다.(쿨다운/프록시/브리지 설정 확인)",
          );
        }
        setMachineInfoProgram(curInfo);

        const a = (alarmRes && (alarmRes.data ?? alarmRes)) as any;
        const list = a?.alarms;
        setMachineInfoAlarms(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setMachineInfoError(e?.message ?? "알 수 없는 오류");
      } finally {
        setMachineInfoLoading(false);
      }
    },
    [token],
  );

  const clearMachineAlarms = useCallback(async () => {
    if (!token || !machineInfoUid) return;
    setMachineInfoClearing(true);
    try {
      const res = await apiFetch({
        path: `/api/machines/${encodeURIComponent(machineInfoUid)}/alarm/clear`,
        method: "POST",
        token,
        jsonBody: {},
      });
      const body: any = res.data ?? {};
      if (!res.ok || body?.success === false) {
        throw new Error(
          body?.message || body?.error || `알람 해제 실패 (HTTP ${res.status})`,
        );
      }

      await openMachineInfo(machineInfoUid);
    } catch (e: any) {
      toast({
        title: "알람 해제 실패",
        description: e?.message || "알람 해제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setMachineInfoClearing(false);
    }
  }, [machineInfoUid, openMachineInfo, toast, token]);

  return {
    machineInfoOpen,
    setMachineInfoOpen,
    machineInfoLoading,
    machineInfoError,
    machineInfoClearing,
    machineInfoProgram,
    machineInfoAlarms,
    openMachineInfo,
    clearMachineAlarms,
  };
}
