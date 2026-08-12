// related files:
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
// - web/frontend/src/pages/devops/components/PracticeTransferAutoMatchTab.tsx
// - web/backend/modules/devops/designDeadline.routes.js
// - web/backend/controllers/devops/designDeadline.controller.js
// - web/frontend/rules.md
import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

const DEFAULT_CLAIM_HOURS = 3;
const MIN_CLAIM_HOURS = 1;
const MAX_CLAIM_HOURS = 24;

/** 기공 자동매칭 탭 상단 — 디자인 수락 후 마감(시간) 요약 설정 */
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
      toast({ title: "저장됨", description: "마감 설정을 저장했습니다." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="app-glass-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 shrink-0" />
            수락 후 마감
          </div>
          <p className="text-xs text-muted-foreground">
            수락 후 이 시간 안에 미작업 시 재공개 · {MIN_CLAIM_HOURS}–
            {MAX_CLAIM_HOURS}시간 (기본 {DEFAULT_CLAIM_HOURS}시간, 마감 30분 전
            경고)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="design-claim-hours"
            type="number"
            min={MIN_CLAIM_HOURS}
            max={MAX_CLAIM_HOURS}
            step={1}
            disabled={loading || saving}
            value={claimHours}
            onChange={(e) => setClaimHours(e.target.value)}
            aria-label="수락 후 마감 시간"
            className={cn(
              "h-9 w-[4.5rem] tabular-nums",
              !valid && claimHours !== "" && "border-destructive",
            )}
          />
          <span className="text-sm text-muted-foreground">시간</span>
          <Button
            type="button"
            size="sm"
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
