import { useState } from "react";

import { useToast } from "@/shared/hooks/use-toast";
import type { HealthLevel } from "@/pages/manufacturer/equipment/cnc/components/MachineCard";

interface UseCncTempPanelParams {
  callRaw: (uid: string, dataType: string, payload?: any) => Promise<any>;
  setError: (msg: string | null) => void;
  setTempHealth: (uid: string, level: HealthLevel) => void;
  setTempTooltip: (uid: string, msg: string) => void;
}

export const useCncTempPanel = ({
  callRaw,
  setError,
  setTempHealth,
  setTempTooltip,
}: UseCncTempPanelParams) => {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<JSX.Element | null>(null);
  const { toast } = useToast();

  const openTempDetail = async (uid: string) => {
    if (!uid) return;
    try {
      const res = await callRaw(uid, "GetMotorTemperature");
      const data: any = res?.data ?? res;
      const temps: { name: string; temperature: number }[] =
        data?.machineMotorTemperature?.tempInfo ?? [];

      let maxTemp = -Infinity;
      if (Array.isArray(temps)) {
        for (const t of temps) {
          const tempVal =
            typeof t?.temperature === "number"
              ? t.temperature
              : typeof t?.temperature === "string"
              ? Number(t.temperature)
              : NaN;
          if (!Number.isNaN(tempVal) && tempVal > maxTemp) {
            maxTemp = tempVal;
          }
        }
      }

      let level: HealthLevel = "unknown";
      if (maxTemp !== -Infinity) {
        // 온도 헬스 정책:
        // - 모든 모터 온도가 40℃ 이하이면 초록색(정상)
        // - 하나라도 40℃ 초과이면 빨간색(주의/경고)
        level = maxTemp > 40 ? "alarm" : "ok";
      }

      setTempHealth(uid, level);
      setTempTooltip(
        uid,
        maxTemp === -Infinity
          ? "온도 정보를 가져올 수 없습니다."
          : `최대 온도 ${maxTemp.toFixed(1)}℃`
      );

      if (maxTemp === -Infinity) {
        toast({
          title: "온도 정보 없음",
          description: "장비 전원이 꺼져있거나 연결이 끊어져 있습니다.",
          variant: "destructive",
        });
      }

      const axes = ["X", "Z", "Y", "C", "A", "S"];
      const grouped = axes.map((axis) => {
        const ch1 = temps.find((t) => t?.name === `${axis}1`);
        const ch2 = temps.find((t) => t?.name === `${axis}2`);

        const toNum = (v: any): number | null => {
          const n =
            typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
          return Number.isNaN(n) ? null : n;
        };

        return {
          axis,
          t1: ch1 ? toNum(ch1.temperature) : null,
          t2: ch2 ? toNum(ch2.temperature) : null,
        };
      });

      const hasAxisPairData = grouped.some((g) => g.t1 != null || g.t2 != null);

      setBody(
        <div className="space-y-3 text-sm text-gray-700">
          {Array.isArray(temps) && temps.length > 0 ? (
            <div className="max-h-[60vh] overflow-auto pr-1">
              {hasAxisPairData ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {grouped.map(({ axis, t1, t2 }) => (
                    <div
                      key={axis}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-white shadow-sm border border-gray-100"
                    >
                      <div className="text-base sm:text-lg font-semibold text-gray-800">
                        {axis}
                      </div>
                      <div className="flex items-baseline gap-3 sm:gap-4 text-lg sm:text-xl font-bold text-gray-900">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                            1
                          </span>
                          <span
                            className={
                              t1 == null
                                ? "text-gray-400"
                                : t1 > 40
                                ? "text-red-500"
                                : "text-emerald-500"
                            }
                          >
                            {t1 != null ? `${t1.toFixed(1)}℃` : "-"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end leading-tight">
                          <span className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                            2
                          </span>
                          <span
                            className={
                              t2 == null
                                ? "text-gray-400"
                                : t2 > 40
                                ? "text-red-500"
                                : "text-emerald-500"
                            }
                          >
                            {t2 != null ? `${t2.toFixed(1)}℃` : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {temps.map((t, idx) => {
                    const n = Number(t?.temperature);
                    const valid = Number.isFinite(n);
                    return (
                      <div
                        key={`${String(t?.name || "T")}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-white shadow-sm border border-gray-100"
                      >
                        <span className="text-sm font-semibold text-gray-700">
                          {String(t?.name || `T${idx + 1}`)}
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            !valid
                              ? "text-gray-400"
                              : n > 40
                              ? "text-red-500"
                              : "text-emerald-500"
                          }`}
                        >
                          {valid ? `${n.toFixed(1)}℃` : "-"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">온도 정보가 없습니다.</div>
          )}
        </div>
      );
      setOpen(true);
    } catch (e: any) {
      const msg = e?.message ?? "온도 상세 조회 중 오류";
      const lower = String(msg).toLowerCase();
      const likelyOffline =
        lower.includes("getmotortemperature failed") ||
        lower.includes("mode2 add/update failed") ||
        lower.includes("timeout") ||
        lower.includes("econn") ||
        lower.includes("offline") ||
        lower.includes("no response");

      setError(msg);
      setTempHealth(uid, "alarm");
      setTempTooltip(uid, msg);

      toast({
        title: likelyOffline ? "장비 오프라인" : "온도 조회 실패",
        description: likelyOffline
          ? "장비 전원이 꺼져있거나 연결이 끊어져 있습니다."
          : msg,
        variant: "destructive",
      });
    }
  };

  return {
    tempModalOpen: open,
    tempModalBody: body,
    setTempModalOpen: setOpen,
    openTempDetail,
  };
};
