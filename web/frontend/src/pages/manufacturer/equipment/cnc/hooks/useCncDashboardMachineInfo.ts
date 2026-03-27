import { useCallback, useState } from "react";

import { apiFetch } from "@/shared/api/apiClient";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Params {
  token: string | null;
  toast: (args: any) => void;
}

interface MachineInfoAlarm {
  type: number;
  no: number;
  headType?: number | null;
  message?: string | null;
  displayText?: string | null;
  source?: string | null;
}

export function useCncDashboardMachineInfo({ token, toast }: Params) {
  const [machineInfoOpen, setMachineInfoOpen] = useState(false);
  const [machineInfoLoading, setMachineInfoLoading] = useState(false);
  const [machineInfoError, setMachineInfoError] = useState<string | null>(null);
  const [machineInfoProgram, setMachineInfoProgram] = useState<any | null>(
    null,
  );
  const [machineInfoAlarms, setMachineInfoAlarms] = useState<
    MachineInfoAlarm[]
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
        const res = await apiFetch({
          path: `/api/machines/${encodeURIComponent(uid)}/info`,
          method: "GET",
          token,
        });
        const body: any = res.data ?? {};
        if (!res.ok || body?.success === false) {
          throw new Error(
            body?.message ||
              body?.error ||
              `장비 정보 조회 실패 (HTTP ${res.status})`,
          );
        }

        const data = body?.data ?? {};
        const active = data?.activeProgram ?? null;
        const curInfo = active
          ? {
              mainProgramName:
                active?.MainProgramName ?? active?.mainProgramName ?? null,
              mainProgramComment:
                active?.MainProgramComment ??
                active?.mainProgramComment ??
                null,
              subProgramName:
                active?.SubProgramName ?? active?.subProgramName ?? null,
              subProgramComment:
                active?.SubProgramComment ?? active?.subProgramComment ?? null,
            }
          : null;

        setMachineInfoProgram(curInfo);
        setMachineInfoAlarms(Array.isArray(data?.alarms) ? data.alarms : []);
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

      await wait(1200);

      const infoRes = await apiFetch({
        path: `/api/machines/${encodeURIComponent(machineInfoUid)}/info`,
        method: "GET",
        token,
      });
      const infoBody: any = infoRes.data ?? {};
      if (!infoRes.ok || infoBody?.success === false) {
        throw new Error(
          infoBody?.message ||
            infoBody?.error ||
            `장비 정보 조회 실패 (HTTP ${infoRes.status})`,
        );
      }

      const data = infoBody?.data ?? {};
      const active = data?.activeProgram ?? null;
      const curInfo = active
        ? {
            mainProgramName:
              active?.MainProgramName ?? active?.mainProgramName ?? null,
            mainProgramComment:
              active?.MainProgramComment ?? active?.mainProgramComment ?? null,
            subProgramName:
              active?.SubProgramName ?? active?.subProgramName ?? null,
            subProgramComment:
              active?.SubProgramComment ?? active?.subProgramComment ?? null,
          }
        : null;
      const nextAlarms = Array.isArray(data?.alarms) ? data.alarms : [];

      setMachineInfoProgram(curInfo);
      setMachineInfoAlarms(nextAlarms);

      if (nextAlarms.length > 0) {
        toast({
          title: "장비 리셋 요청 완료",
          description:
            "리셋 신호는 전송됐지만 알람이 아직 남아 있습니다. 장비 상태를 확인한 뒤 관리자 조치가 필요할 수 있습니다.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "장비 리셋 요청 완료",
          description: "알람 재조회 결과, 현재 남은 알람이 없습니다.",
        });
      }
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
