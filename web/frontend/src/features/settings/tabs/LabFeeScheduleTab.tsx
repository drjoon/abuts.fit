// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Banknote, Loader2, Save } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/ui/cn";

type FeeKey =
  | "crown"
  | "bridge"
  | "inlay"
  | "pontic"
  | "customAbutmentDesign"
  | "customAbutmentDesignAndProduction";

type FeeSchedule = Record<FeeKey, number>;
type FeeEnabled = Record<FeeKey, boolean>;

const FEE_KEYS: FeeKey[] = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
];

const DEFAULT_SCHEDULE: FeeSchedule = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  customAbutmentDesign: 10000,
  customAbutmentDesignAndProduction: 35000,
};

const DEFAULT_ENABLED: FeeEnabled = Object.fromEntries(
  FEE_KEYS.map((key) => [key, true]),
) as FeeEnabled;

const LABELS: { key: FeeKey; label: string; hint: string }[] = [
  { key: "crown", label: "크라운", hint: "크라운 1개당" },
  { key: "bridge", label: "브리지", hint: "크라운 1개당" },
  { key: "inlay", label: "인레이", hint: "인레이·온레이 1개당" },
  { key: "pontic", label: "Pontic", hint: "폰틱 1개당" },
  {
    key: "customAbutmentDesign",
    label: "커스텀어벗 디자인",
    hint: "어벗 디자인 1개당",
  },
  {
    key: "customAbutmentDesignAndProduction",
    label: "커스텀어벗 디자인+생산",
    hint: "어벗 디자인 및 생산 1개당",
  },
];

function formatWon(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

function pickSchedule(s: Partial<FeeSchedule> | undefined): FeeSchedule {
  return {
    crown: Number(s?.crown ?? DEFAULT_SCHEDULE.crown),
    bridge: Number(s?.bridge ?? DEFAULT_SCHEDULE.bridge),
    inlay: Number(s?.inlay ?? DEFAULT_SCHEDULE.inlay),
    pontic: Number(s?.pontic ?? DEFAULT_SCHEDULE.pontic),
    customAbutmentDesign: Number(
      s?.customAbutmentDesign ?? DEFAULT_SCHEDULE.customAbutmentDesign,
    ),
    customAbutmentDesignAndProduction: Number(
      s?.customAbutmentDesignAndProduction ??
        DEFAULT_SCHEDULE.customAbutmentDesignAndProduction,
    ),
  };
}

function pickEnabled(e: Partial<FeeEnabled> | undefined): FeeEnabled {
  const out = { ...DEFAULT_ENABLED };
  for (const key of FEE_KEYS) {
    if (typeof e?.[key] === "boolean") out[key] = e[key];
  }
  return out;
}

export const LabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<FeeSchedule>(DEFAULT_SCHEDULE);
  const [enabled, setEnabled] = useState<FeeEnabled>(DEFAULT_ENABLED);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: {
          schedule?: Partial<FeeSchedule>;
          enabled?: Partial<FeeEnabled>;
        };
        message?: string;
      }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "기공비 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      setSchedule(pickSchedule(res.data?.data?.schedule));
      setEnabled(pickEnabled(res.data?.data?.enabled));
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await request<{ message?: string }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "PUT",
        token,
        jsonBody: { schedule, enabled },
      });
      if (!res.ok) {
        toast({
          title: "기공비 저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "기공비를 저장했습니다." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-5 w-5 text-primary-strong" />
          기공비 수가
        </CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          치과 기공의뢰 청구에 사용되는 보철별 기공비입니다. 제공하지 않는
          항목은 체크를 해제하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LABELS.map(({ key, label, hint }) => {
            const isProvided = enabled[key];
            return (
              <div
                key={key}
                className={cn(
                  "rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-opacity",
                  !isProvided && "opacity-55",
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Checkbox
                      id={`fee-enabled-${key}`}
                      checked={isProvided}
                      onCheckedChange={(checked) =>
                        setEnabled((prev) => ({
                          ...prev,
                          [key]: checked === true,
                        }))
                      }
                      className="mt-0.5"
                      aria-label={`${label} 제공`}
                    />
                    <div className="min-w-0">
                      <Label
                        htmlFor={`fee-enabled-${key}`}
                        className="cursor-pointer text-sm font-semibold text-slate-900"
                      >
                        {label}
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isProvided ? hint : "제공하지 않음"}
                      </p>
                    </div>
                  </div>
                  {isProvided ? (
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
                      {formatWon(schedule[key])}
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    id={`fee-${key}`}
                    type="number"
                    min={0}
                    step={1000}
                    value={schedule[key]}
                    disabled={!isProvided}
                    onChange={(e) =>
                      setSchedule((prev) => ({
                        ...prev,
                        [key]: Math.max(
                          0,
                          Math.round(Number(e.target.value) || 0),
                        ),
                      }))
                    }
                    className="h-11 rounded-xl pr-10 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                    원
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <Separator className="bg-slate-200/70" />

        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="h-10 gap-1.5 rounded-xl px-5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
