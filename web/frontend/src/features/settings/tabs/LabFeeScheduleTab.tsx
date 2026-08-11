// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";

type FeeSchedule = {
  crown: number;
  bridge: number;
  inlay: number;
  pontic: number;
};

const LABELS: { key: keyof FeeSchedule; label: string }[] = [
  { key: "crown", label: "크라운" },
  { key: "bridge", label: "브리지" },
  { key: "inlay", label: "인레이" },
  { key: "pontic", label: "Pontic" },
];

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-5 w-5" />
          기공비 수가
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {LABELS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`fee-${key}`}>{label} (원)</Label>
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
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/70 pt-4">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
