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
import { Banknote, Loader2, Save } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { Separator } from "@/components/ui/separator";

type FeeSchedule = {
  crown: number;
  bridge: number;
  inlay: number;
  pontic: number;
  customAbutmentDesign: number;
};

const LABELS: { key: keyof FeeSchedule; label: string; hint: string }[] = [
  { key: "crown", label: "크라운", hint: "단일 크라운" },
  { key: "bridge", label: "브리지", hint: "브리지 단위" },
  { key: "inlay", label: "인레이", hint: "인레이·온레이" },
  { key: "pontic", label: "Pontic", hint: "폰틱 (어벗 없음)" },
  {
    key: "customAbutmentDesign",
    label: "커스텀어벗 디자인",
    hint: "디자인만. 생산비 별도",
  },
];

function formatWon(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

export const LabFeeScheduleTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<FeeSchedule>({
    crown: 60000,
    bridge: 60000,
    inlay: 50000,
    pontic: 40000,
    customAbutmentDesign: 10000,
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{
        data?: { schedule?: Partial<FeeSchedule> };
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
      const s = res.data?.data?.schedule || {};
      setSchedule({
        crown: Number(s.crown ?? 60000),
        bridge: Number(s.bridge ?? 60000),
        inlay: Number(s.inlay ?? 50000),
        pontic: Number(s.pontic ?? 40000),
        customAbutmentDesign: Number(s.customAbutmentDesign ?? 10000),
      });
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
        jsonBody: { schedule },
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
          치과 기공의뢰 청구에 사용되는 보철별 기공비입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-primary-muted/70 bg-primary-soft/30 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-slate-700">
            등록 치과에 기공의뢰를 보낼 때 아래 수가가 적용됩니다. 어벗 소매가는
            별도입니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LABELS.map(({ key, label, hint }) => (
            <div
              key={key}
              className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <Label
                    htmlFor={`fee-${key}`}
                    className="text-sm font-semibold text-slate-900"
                  >
                    {label}
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold tabular-nums text-slate-600">
                  {formatWon(schedule[key])}
                </span>
              </div>
              <div className="relative">
                <Input
                  id={`fee-${key}`}
                  type="number"
                  min={0}
                  step={1000}
                  value={schedule[key]}
                  onChange={(e) =>
                    setSchedule((prev) => ({
                      ...prev,
                      [key]: Math.max(
                        0,
                        Math.round(Number(e.target.value) || 0),
                      ),
                    }))
                  }
                  className="h-11 rounded-xl pr-10 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  원
                </span>
              </div>
            </div>
          ))}
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
