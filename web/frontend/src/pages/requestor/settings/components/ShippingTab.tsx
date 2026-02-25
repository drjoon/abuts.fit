import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

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
  const { toast } = useToast();
  const storageKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;
  const lastSavedRef = useRef<string>("");

  const { token, user } = useAuthStore();

  const [weeklyBatchDays, setWeeklyBatchDays] = useState<string[]>([
    getRandomWeekday(),
  ]);

  const organizationType = useMemo(() => {
    const role = String(user?.role || userData?.role || "requestor").trim();
    return role || "requestor";
  }, [user?.role, userData?.role]);

  const [policyLoaded, setPolicyLoaded] = useState(false);

  const normalizeWeeklyBatchDays = (raw: string[]) =>
    Array.from(
      new Set(
        raw
          .map((day) => String(day).trim())
          .filter((day) => WEEKDAY_OPTIONS.includes(day as any)),
      ),
    );

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setPolicyLoaded(true);
        return;
      }
      try {
        const res = await request<any>({
          path: `/api/organizations/me?organizationType=${encodeURIComponent(
            organizationType,
          )}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setPolicyLoaded(true);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        const serverDays = normalizeWeeklyBatchDays(
          data?.shippingPolicy?.weeklyBatchDays || [],
        );
        if (serverDays.length > 0) {
          setWeeklyBatchDays(serverDays);
          setPolicyLoaded(true);
          return;
        }
        const businessNumberRaw = String(
          data?.extracted?.businessNumber ||
            data?.organization?.businessNumber ||
            data?.businessNumber ||
            "",
        ).trim();
        const digits = businessNumberRaw.replace(/\D/g, "");
        if (!digits) {
          setPolicyLoaded(true);
          return;
        }
        let idx = 0;
        try {
          idx = Number(((BigInt(digits) % 5n) + 5n) % 5n);
        } catch {
          const n = Number(digits);
          if (!Number.isFinite(n)) return;
          idx = ((n % 5) + 5) % 5;
        }
        const map = ["mon", "tue", "wed", "thu", "fri"] as const;
        setWeeklyBatchDays((prev) => (prev.length > 0 ? prev : [map[idx]]));
        setPolicyLoaded(true);
      } catch {
        // ignore
      } finally {
        setPolicyLoaded(true);
      }
    };

    void load();
  }, [organizationType, token]);

  useEffect(() => {
    if (token) return;
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
  }, [storageKey, token]);

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
    if (token) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ weeklyBatchDays }));
    } catch {
      // ignore
    }
  }, [storageKey, token, weeklyBatchDays]);

  useEffect(() => {
    if (!token || !policyLoaded) return;
    const normalized = normalizeWeeklyBatchDays(weeklyBatchDays);
    const payloadKey = JSON.stringify(normalized);
    if (payloadKey === lastSavedRef.current) return;
    lastSavedRef.current = payloadKey;
    void (async () => {
      const res = await request({
        path: `/api/organizations/me?organizationType=${encodeURIComponent(
          organizationType,
        )}`,
        method: "PUT",
        token,
        jsonBody: {
          organizationType,
          shippingPolicy: {
            weeklyBatchDays: normalized,
          },
        },
      });
      if (!res.ok) {
        lastSavedRef.current = "";
        toast({
          title: "배송 설정 저장 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    })();
  }, [organizationType, policyLoaded, toast, token, weeklyBatchDays]);

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
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
          <Label className="text-xl uppercase tracking-[0.3em] text-slate-500">
            묶음 요일
          </Label>
          <p className="text-base leading-relaxed text-slate-600 pt-2">
            선택한 요일 오후 2시까지 모인 제품을 한 박스로 묶어 발송합니다.
            <br />
            묶음 요일은 여러 개를 선택할 수 있습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 pt-2">
            {(["mon", "tue", "wed", "thu", "fri"] as const).map((day) => {
              const active = weeklyBatchDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-xl text-base font-medium border transition-all ${
                    active
                      ? "bg-sky-500 text-white border-sky-500"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800"
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
