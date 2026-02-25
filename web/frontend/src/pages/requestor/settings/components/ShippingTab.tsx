import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri"] as const;

const getRandomWeekday = () =>
  WEEKDAY_OPTIONS[Math.floor(Math.random() * WEEKDAY_OPTIONS.length)];

export const ShippingTab = ({ userData }: ShippingTabProps) => {
  const storageKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;

  const { token, user } = useAuthStore();

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

  const organizationType = useMemo(() => {
    const role = String(user?.role || userData?.role || "requestor").trim();
    return role || "requestor";
  }, [user?.role, userData?.role]);

  const [computedWeeklyDay, setComputedWeeklyDay] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const res = await request<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
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
  }, [mockHeaders, organizationType, token]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        weeklyBatchDays?: string[];
      };
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
      localStorage.setItem(storageKey, JSON.stringify({ weeklyBatchDays }));
    } catch {
      // ignore
    }
  }, [storageKey, weeklyBatchDays]);

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
        <div className="space-y-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <Label className="text-lg font-semibold text-green-900">
            주간 묶음 요일
          </Label>
          <p className="text-base text-green-800 leading-relaxed">
            선택한(녹색) 요일에 도착할 수 있도록 직전 영업일 오후 3시(운송장
            입력) 마감까지 발송 대기 중인 제품을 한 박스에 담아 발송하며, 오후
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
        <div className="hidden" aria-hidden />
      </CardContent>
    </Card>
  );
};
