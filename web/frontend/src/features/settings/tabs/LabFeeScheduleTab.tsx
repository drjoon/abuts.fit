// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
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
  | "retainer"
  | "removableTemp3"
  | "removableTemp6"
  | "customAbutmentDesign"
  | "customAbutmentDesignAndProduction";

type FeeSchedule = Record<FeeKey, number>;
type FeeEnabled = Record<FeeKey, boolean>;

const FEE_KEYS: FeeKey[] = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "retainer",
  "removableTemp3",
  "removableTemp6",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
];

const DEFAULT_SCHEDULE: FeeSchedule = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
  customAbutmentDesign: 10000,
  customAbutmentDesignAndProduction: 35000,
};

const DEFAULT_ENABLED: FeeEnabled = Object.fromEntries(
  FEE_KEYS.map((key) => [key, true]),
) as FeeEnabled;

const DEFAULT_REMAKE: FeeSchedule = {
  crown: 0,
  bridge: 0,
  inlay: 0,
  pontic: 0,
  retainer: 0,
  removableTemp3: 0,
  removableTemp6: 0,
  customAbutmentDesign: 0,
  customAbutmentDesignAndProduction: 0,
};

const LABELS: { key: FeeKey; label: string; hint: string }[] = [
  { key: "crown", label: "크라운", hint: "크라운 1개당" },
  { key: "bridge", label: "브리지", hint: "크라운 1개당" },
  { key: "inlay", label: "인레이", hint: "인레이·온레이 1개당" },
  { key: "pontic", label: "Pontic", hint: "폰틱 1개당" },
  { key: "retainer", label: "유지장치", hint: "1세트당" },
];

const REMOVABLE_TEMP_TIERS: { key: "removableTemp3" | "removableTemp6"; label: string }[] = [
  { key: "removableTemp3", label: "3치 이하" },
  { key: "removableTemp6", label: "6치 이하" },
];

function pickSchedule(s: Partial<FeeSchedule> | undefined): FeeSchedule {
  const out = { ...DEFAULT_SCHEDULE };
  for (const key of FEE_KEYS) {
    const n = Math.round(Number(s?.[key] ?? DEFAULT_SCHEDULE[key]));
    out[key] = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SCHEDULE[key];
  }
  return out;
}

function pickEnabled(e: Partial<FeeEnabled> | undefined): FeeEnabled {
  const out = { ...DEFAULT_ENABLED };
  for (const key of FEE_KEYS) {
    if (typeof e?.[key] === "boolean") out[key] = e[key];
  }
  return out;
}

function pickRemake(s: Partial<FeeSchedule> | undefined): FeeSchedule {
  const out = { ...DEFAULT_REMAKE };
  for (const key of FEE_KEYS) {
    const n = Math.max(0, Math.round(Number(s?.[key] ?? DEFAULT_REMAKE[key])));
    out[key] = Number.isFinite(n) ? n : DEFAULT_REMAKE[key];
  }
  return out;
}

export const LabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<FeeSchedule>(DEFAULT_SCHEDULE);
  const [remake, setRemake] = useState<FeeSchedule>(DEFAULT_REMAKE);
  const [enabled, setEnabled] = useState<FeeEnabled>(DEFAULT_ENABLED);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: {
          schedule?: Partial<FeeSchedule>;
          remake?: Partial<FeeSchedule>;
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
      setRemake(pickRemake(res.data?.data?.remake));
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
        jsonBody: { schedule, remake, enabled },
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
                <div className="mb-3 flex min-w-0 items-start gap-2.5">
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <Label
                      htmlFor={`fee-${key}`}
                      className="mb-1 block text-center text-[11px] font-medium text-slate-600"
                    >
                      원가
                    </Label>
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
                        className="h-10 rounded-xl px-2 pr-7 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
                        원
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Label
                      htmlFor={`fee-remake-${key}`}
                      className="mb-1 block text-center text-[11px] font-medium text-amber-800"
                    >
                      리메이크
                    </Label>
                    <div className="relative">
                      <Input
                        id={`fee-remake-${key}`}
                        type="number"
                        min={0}
                        step={1000}
                        value={remake[key]}
                        disabled={!isProvided}
                        onChange={(e) =>
                          setRemake((prev) => ({
                            ...prev,
                            [key]: Math.max(
                              0,
                              Math.round(Number(e.target.value) || 0),
                            ),
                          }))
                        }
                        className="h-10 rounded-xl border-amber-200/80 px-2 pr-7 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
                        원
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {(() => {
            const isProvided =
              enabled.removableTemp3 || enabled.removableTemp6;
            return (
              <div
                className={cn(
                  "rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-opacity sm:col-span-2",
                  !isProvided && "opacity-55",
                )}
              >
                <div className="mb-3 flex min-w-0 items-start gap-2.5">
                  <Checkbox
                    id="fee-enabled-removable-temp"
                    checked={isProvided}
                    onCheckedChange={(checked) =>
                      setEnabled((prev) => ({
                        ...prev,
                        removableTemp3: checked === true,
                        removableTemp6: checked === true,
                      }))
                    }
                    className="mt-0.5"
                    aria-label="임시치아 제공"
                  />
                  <div className="min-w-0">
                    <Label
                      htmlFor="fee-enabled-removable-temp"
                      className="cursor-pointer text-sm font-semibold text-slate-900"
                    >
                      임시치아
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isProvided ? "치아 수 구간별 수가" : "제공하지 않음"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REMOVABLE_TEMP_TIERS.map(({ key, label }) => (
                    <div key={key} className="min-w-0">
                      <p className="mb-2 text-center text-[11px] font-semibold text-slate-700">
                        {label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <Label
                            htmlFor={`fee-${key}`}
                            className="mb-1 block text-center text-[11px] font-medium text-slate-600"
                          >
                            원가
                          </Label>
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
                              className="h-10 rounded-xl px-2 pr-7 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
                              원
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <Label
                            htmlFor={`fee-remake-${key}`}
                            className="mb-1 block text-center text-[11px] font-medium text-amber-800"
                          >
                            리메이크
                          </Label>
                          <div className="relative">
                            <Input
                              id={`fee-remake-${key}`}
                              type="number"
                              min={0}
                              step={1000}
                              value={remake[key]}
                              disabled={!isProvided}
                              onChange={(e) =>
                                setRemake((prev) => ({
                                  ...prev,
                                  [key]: Math.max(
                                    0,
                                    Math.round(Number(e.target.value) || 0),
                                  ),
                                }))
                              }
                              className="h-10 rounded-xl border-amber-200/80 px-2 pr-7 text-right tabular-nums disabled:cursor-not-allowed disabled:bg-slate-50"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted-foreground">
                              원
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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
