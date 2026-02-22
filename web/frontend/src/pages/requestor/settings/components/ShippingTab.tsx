import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

interface ShippingTabProps {
  userData: {
    name: string;
    email: string;
    role?: string;
  } | null;
}

const STORAGE_KEY_PREFIX = "abutsfit:shipping-policy:v1:";
const MIN_WAIT_DAYS = 1;
const MAX_WAIT_DAYS = 2;
const DEFAULT_MAX_WAIT_DAYS = 2;

const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri"] as const;

const getRandomWeekday = () =>
  WEEKDAY_OPTIONS[Math.floor(Math.random() * WEEKDAY_OPTIONS.length)];

const clampWaitDays = (value: number | undefined | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_MAX_WAIT_DAYS;
  }
  return Math.min(MAX_WAIT_DAYS, Math.max(MIN_WAIT_DAYS, Math.round(value)));
};

export const ShippingTab = ({ userData }: ShippingTabProps) => {
  const storageKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;

  const { token, user } = useAuthStore();

  const [shippingMode, setShippingMode] = useState<
    "countBased" | "weeklyBased"
  >("countBased");
  const [option, setOption] = useState<"count3" | "monThu">("count3");
  const [autoBatchThreshold, setAutoBatchThreshold] = useState(10);
  const [maxWaitDays, setMaxWaitDays] = useState(DEFAULT_MAX_WAIT_DAYS);
  const [weeklyBatchDays, setWeeklyBatchDays] = useState<string[]>([
    getRandomWeekday(),
  ]);

  const mockHeaders = useMemo(() => {
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "requestor") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization": (user as any)?.organization || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role, userData]);

  const [computedWeeklyDay, setComputedWeeklyDay] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const res = await request<any>({
          path: "/api/requestor-organizations/me",
          method: "GET",
          token,
          headers: mockHeaders,
        });
        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        const businessNumberRaw = String(
          data?.extracted?.businessNumber ||
            data?.organization?.businessNumber ||
            data?.businessNumber ||
            "",
        ).trim();
        const digits = businessNumberRaw.replace(/\D/g, "");
        if (!digits) return;
        let idx = 0;
        try {
          idx = Number(((BigInt(digits) % 5n) + 5n) % 5n);
        } catch {
          const n = Number(digits);
          if (!Number.isFinite(n)) return;
          idx = ((n % 5) + 5) % 5;
        }
        const map = ["mon", "tue", "wed", "thu", "fri"] as const;
        setComputedWeeklyDay(map[idx]);
      } catch {
        // ignore
      }
    };

    void load();
  }, [mockHeaders, token]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        shippingMode?: "countBased" | "weeklyBased";
        option?: "count3" | "monThu";
        autoBatchThreshold?: number;
        maxWaitDays?: number;
        weeklyBatchDays?: string[];
      };
      if (
        parsed.shippingMode === "countBased" ||
        parsed.shippingMode === "weeklyBased"
      ) {
        setShippingMode(parsed.shippingMode);
      }
      if (parsed.option === "count3" || parsed.option === "monThu") {
        setOption(parsed.option);
      }
      if (typeof parsed.autoBatchThreshold === "number") {
        setAutoBatchThreshold(parsed.autoBatchThreshold);
      }
      if (typeof parsed.maxWaitDays === "number") {
        setMaxWaitDays(clampWaitDays(parsed.maxWaitDays));
      }
      if (Array.isArray(parsed.weeklyBatchDays)) {
        setWeeklyBatchDays(parsed.weeklyBatchDays);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (!computedWeeklyDay) return;
    setWeeklyBatchDays((prev) => {
      if (prev.includes(computedWeeklyDay)) return prev;
      return [...prev, computedWeeklyDay];
    });
  }, [computedWeeklyDay, storageKey]);

  const toggleDay = (day: string) => {
    setWeeklyBatchDays((prev) => {
      const exists = prev.includes(day);
      if (exists) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  };

  useEffect(() => {
    try {
      const payload = {
        shippingMode,
        option,
        autoBatchThreshold,
        maxWaitDays,
        weeklyBatchDays,
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    autoBatchThreshold,
    maxWaitDays,
    option,
    shippingMode,
    storageKey,
    weeklyBatchDays,
  ]);

  const dayLabels: Record<string, string> = {
    mon: "월",
    tue: "화",
    wed: "수",
    thu: "목",
    fri: "금",
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Truck className="h-5 w-5" />
          배송 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-lg">
        {/* 배송 방식 선택 */}
        <div className="space-y-3 border-b pb-6">
          <Label className="text-lg font-semibold">배송 방식 선택</Label>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="shipping-mode"
                value="countBased"
                checked={shippingMode === "countBased"}
                onChange={() => setShippingMode("countBased")}
                className="h-4 w-4 rounded-full border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-base font-medium">
                옵션 A: 정해진 수량이 모이면 자동 묶음 배송
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="shipping-mode"
                value="weeklyBased"
                checked={shippingMode === "weeklyBased"}
                onChange={() => setShippingMode("weeklyBased")}
                className="h-4 w-4 rounded-full border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-base font-medium">
                옵션 B: 주간 묶음 요일
              </span>
            </label>
          </div>
        </div>

        {/* 옵션 A: n개 모이면 자동 묶음 */}
        {shippingMode === "countBased" && (
          <div className="space-y-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <Label className="text-lg font-semibold text-blue-900">
              옵션 A: 정해진 수량이 모이면 자동 묶음 배송
            </Label>
            <div className="text-base text-blue-800 leading-relaxed">
              생산 완료되어 발송 대기 중인 제품이 설정한 개수 이상 모이면 한
              박스로 묶어 출고합니다.
            </div>
            <div className="text-base text-blue-800 leading-relaxed">
              출고 기준: 의뢰일 +1영업일 (불가피 시 +2영업일).
            </div>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={autoBatchThreshold}
                  onChange={(e) =>
                    setAutoBatchThreshold(Number(e.target.value) || 1)
                  }
                  className="w-20 px-3 py-2 text-base border border-slate-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <span className="text-base font-medium text-blue-900">
                  개 이상 모이면 출고
                </span>
              </label>
              <label className="flex items-center gap-3">
                <span className="text-base font-medium text-blue-900">
                  최대
                </span>
                <input
                  type="number"
                  min={MIN_WAIT_DAYS}
                  max={MAX_WAIT_DAYS}
                  value={maxWaitDays}
                  onChange={(e) => {
                    const nextValue = clampWaitDays(Number(e.target.value));
                    setMaxWaitDays(nextValue);
                  }}
                  className="w-20 px-3 py-2 text-base border border-slate-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <span className="text-base font-medium text-blue-900">
                  영업일 대기
                </span>
              </label>
            </div>
          </div>
        )}

        {/* 옵션 B: 주간 묶음 요일 */}
        {shippingMode === "weeklyBased" && (
          <div className="space-y-3 p-4 rounded-lg bg-green-50 border border-green-200">
            <Label className="text-lg font-semibold text-green-900">
              옵션 B: 주간 묶음 요일
            </Label>
            <p className="text-base text-green-800 leading-relaxed">
              선택한(녹색) 요일에 도착할 수 있도록 직전 영업일 오후 3시(운송장
              입력) 마감까지 발송 대기 중인 제품을 한 박스에 담아 출고하며, 오후
              4시에 택배사가 수거합니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["mon", "tue", "wed", "thu", "fri"] as const).map((day) => {
                const active = weeklyBatchDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-lg text-base font-medium border-2 transition-all ${
                      active
                        ? "bg-green-600 text-white border-green-600 shadow-lg"
                        : "bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {dayLabels[day]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="hidden" aria-hidden />
      </CardContent>
    </Card>
  );
};
