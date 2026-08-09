// related files:
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
// - web/backend/modules/devops/designDeadline.routes.js
// - web/backend/controllers/devops/designDeadline.controller.js
// - web/frontend/rules.md
import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

const DEFAULT_CLAIM_HOURS = 3;
const MIN_CLAIM_HOURS = 1;
const MAX_CLAIM_HOURS = 24;

export const DevopsDesignDeadlineTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [claimHours, setClaimHours] = useState(String(DEFAULT_CLAIM_HOURS));
  const savedRef = useRef(String(DEFAULT_CLAIM_HOURS));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const res = await request<{
          success?: boolean;
          data?: { designDeadlineSettings?: { claimHours?: number } };
        }>({
          path: "/api/devops/design-deadline",
          method: "GET",
          token,
        });
        if (!res.ok || !mounted) return;
        const hours = Number(
          res.data?.data?.designDeadlineSettings?.claimHours ??
            DEFAULT_CLAIM_HOURS,
        );
        const next = String(
          Number.isFinite(hours) ? hours : DEFAULT_CLAIM_HOURS,
        );
        savedRef.current = next;
        setClaimHours(next);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  const parsed = Number(claimHours);
  const valid =
    Number.isFinite(parsed) &&
    parsed >= MIN_CLAIM_HOURS &&
    parsed <= MAX_CLAIM_HOURS &&
    Number.isInteger(parsed);
  const dirty = claimHours !== savedRef.current;

  const handleSave = async () => {
    if (!token || !valid) return;
    setSaving(true);
    try {
      const res = await request<{
        success?: boolean;
        data?: { designDeadlineSettings?: { claimHours?: number } };
        message?: string;
      }>({
        path: "/api/devops/design-deadline",
        method: "PUT",
        token,
        jsonBody: { designDeadlineSettings: { claimHours: parsed } },
      });
      if (!res.ok) {
        toast({
          title: "저장 실패",
          description: res.data?.message || "마감 설정을 저장하지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      const saved = String(
        res.data?.data?.designDeadlineSettings?.claimHours ?? parsed,
      );
      savedRef.current = saved;
      setClaimHours(saved);
      toast({ title: "저장됨", description: "디자인 마감 설정을 저장했습니다." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="app-glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          디자인 마감 설정
        </CardTitle>
        <CardDescription>
          지정 디자이너가 「수락」으로 잡은 뒤, 이 시간 안에 작업하지 않으면
          다른 디자이너에게 다시 공개됩니다. (기본 {DEFAULT_CLAIM_HOURS}시간)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="design-claim-hours">수락 후 마감 (시간)</Label>
          <Input
            id="design-claim-hours"
            type="number"
            min={MIN_CLAIM_HOURS}
            max={MAX_CLAIM_HOURS}
            step={1}
            disabled={loading || saving}
            value={claimHours}
            onChange={(e) => setClaimHours(e.target.value)}
            className={cn(!valid && claimHours !== "" && "border-destructive")}
          />
          <p className="text-xs text-muted-foreground">
            {MIN_CLAIM_HOURS}–{MAX_CLAIM_HOURS}시간. 마감 30분 전부터 디자이너
            화면에 경고가 표시됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={loading || saving || !dirty || !valid}
            onClick={() => void handleSave()}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
