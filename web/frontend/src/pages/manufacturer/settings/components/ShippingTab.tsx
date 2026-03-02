import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Truck } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

interface ShippingTabProps {
  userData: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

type LeadTimeRange = {
  minBusinessDays: number;
  maxBusinessDays: number;
};

type DiameterKey = "d6" | "d8" | "d10" | "d12";

const DEFAULT_LEAD_TIMES: Record<DiameterKey, LeadTimeRange> = {
  d6: { minBusinessDays: 1, maxBusinessDays: 2 },
  d8: { minBusinessDays: 1, maxBusinessDays: 2 },
  d10: { minBusinessDays: 4, maxBusinessDays: 7 },
  d12: { minBusinessDays: 4, maxBusinessDays: 7 },
};

const STORAGE_KEY_PREFIX = "abutsfit:manufacturer-shipping-policy:v2:";

const clampPositiveInt = (value?: number, fallback = 1) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

export const ManufacturerShippingTab = ({ userData }: ShippingTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const storageKey = `${STORAGE_KEY_PREFIX}${userData?.email || "guest"}`;
  const lastSavedRef = useRef<string>("");

  const [leadTimes, setLeadTimes] =
    useState<Record<DiameterKey, LeadTimeRange>>(DEFAULT_LEAD_TIMES);
  const [policyLoaded, setPolicyLoaded] = useState(false);

  const organizationType = useMemo(() => {
    const role = String(user?.role || userData?.role || "manufacturer").trim();
    return role || "manufacturer";
  }, [user?.role, userData?.role]);

  const normalizeLeadTimes = (
    raw?: Record<string, Partial<LeadTimeRange>>,
  ): Record<DiameterKey, LeadTimeRange> => {
    const next = { ...DEFAULT_LEAD_TIMES };
    if (!raw || typeof raw !== "object") return next;
    (Object.keys(next) as DiameterKey[]).forEach((key) => {
      const entry = raw[key];
      if (!entry) return;
      const min = clampPositiveInt(
        entry.minBusinessDays,
        next[key].minBusinessDays,
      );
      const max = clampPositiveInt(
        entry.maxBusinessDays,
        next[key].maxBusinessDays,
      );
      next[key] = {
        minBusinessDays: Math.min(min, max),
        maxBusinessDays: Math.max(min, max),
      };
    });
    return next;
  };

  useEffect(() => {
    const load = async () => {
      if (!token) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as Record<
              DiameterKey,
              LeadTimeRange
            >;
            setLeadTimes(normalizeLeadTimes(parsed));
          }
        } catch {
          // ignore
        } finally {
          setPolicyLoaded(true);
        }
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
        const serverLeadTimes = normalizeLeadTimes(
          data?.shippingPolicy?.leadTimes,
        );
        setLeadTimes(serverLeadTimes);
      } catch {
        // ignore
      } finally {
        setPolicyLoaded(true);
      }
    };

    void load();
  }, [organizationType, storageKey, token]);

  useEffect(() => {
    if (token) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(leadTimes));
    } catch {
      // ignore
    }
  }, [leadTimes, storageKey, token]);

  useEffect(() => {
    if (!token || !policyLoaded) return;
    const payloadKey = JSON.stringify(leadTimes);
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
            leadTimes,
          },
        },
      });
      if (!res.ok) {
        lastSavedRef.current = "";
        toast({
          title: "배송 리드타임 저장 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      }
    })();
  }, [leadTimes, organizationType, policyLoaded, toast, token]);

  const handleChange = (
    key: DiameterKey,
    field: keyof LeadTimeRange,
    value: string,
  ) => {
    const numeric = clampPositiveInt(Number(value), leadTimes[key][field]);
    setLeadTimes((prev) => {
      const next = { ...prev };
      const current = next[key];
      const updated = { ...current, [field]: numeric } as LeadTimeRange;
      if (updated.minBusinessDays > updated.maxBusinessDays) {
        if (field === "minBusinessDays") {
          updated.maxBusinessDays = numeric;
        } else {
          updated.minBusinessDays = numeric;
        }
      }
      next[key] = updated;
      return next;
    });
  };

  const diameterLabels: Record<DiameterKey, string> = {
    d6: "6mm",
    d8: "8mm",
    d10: "10mm",
    d12: "12mm",
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Truck className="h-5 w-5" />
          배송 리드타임 설정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-base leading-relaxed text-slate-600">
          직경별 최소/최대 배송 리드타임을 설정하면 의뢰자에게 안내되는 ETA에
          그대로 반영됩니다.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(diameterLabels) as DiameterKey[]).map((key) => {
            const current = leadTimes[key];
            return (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_35px_rgba(15,23,42,0.07)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {diameterLabels[key]}
                    </p>
                  </div>
                  
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${key}-min`}>최소</Label>
                    <Input
                      id={`${key}-min`}
                      type="number"
                      min={0}
                      value={current.minBusinessDays}
                      onChange={(e) =>
                        handleChange(key, "minBusinessDays", e.target.value)
                      }
                      className="text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${key}-max`}>최대</Label>
                    <Input
                      id={`${key}-max`}
                      type="number"
                      min={0}
                      value={current.maxBusinessDays}
                      onChange={(e) =>
                        handleChange(key, "maxBusinessDays", e.target.value)
                      }
                      className="text-base"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
