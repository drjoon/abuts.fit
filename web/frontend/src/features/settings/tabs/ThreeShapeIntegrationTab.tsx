// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/integrations/threeShape.controller.js
// - docs/integrations/3shape-partner-application.md
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
import { Badge } from "@/components/ui/badge";
import { Link2, RefreshCcw, Unplug } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SettingsCardSkeleton } from "@/features/components/SettingsSkeletons";
import { formatKstDateTimeToKo } from "@/shared/date/kst";

type ThreeShapeIntegrationStatus = {
  provider: "3shape";
  status: "disconnected" | "pending" | "connected" | "error" | string;
  externalAccountEmail: string;
  externalAccountId: string;
  lastSyncAt: string | null;
  lastError: string;
  connectedAt: string | null;
};

type ThreeShapeApiBody = {
  success?: boolean;
  message?: string;
  data?: ThreeShapeIntegrationStatus;
};

const statusLabel = (status: string) => {
  switch (status) {
    case "connected":
      return "연결됨";
    case "pending":
      return "승인 대기";
    case "error":
      return "오류";
    case "disconnected":
    default:
      return "미연결";
  }
};

const statusVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "connected") return "default";
  if (status === "error") return "destructive";
  if (status === "pending") return "secondary";
  return "outline";
};

export const ThreeShapeIntegrationTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [integration, setIntegration] =
    useState<ThreeShapeIntegrationStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<ThreeShapeApiBody>({
        path: "/api/integrations/3shape",
        method: "GET",
        token,
      });
      if (!res.ok) {
        toast({
          title: "3Shape 연동 조회 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const data = res.data?.data || null;
      setIntegration(data);
      if (data?.externalAccountEmail) {
        setEmail(String(data.externalAccountEmail));
      }
    } catch (error) {
      toast({
        title: "3Shape 연동 조회 실패",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = async () => {
    if (!token) return;
    const nextEmail = email.trim();
    if (!nextEmail || !password) {
      toast({
        title: "입력 필요",
        description: "Communicate 이메일과 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await request<ThreeShapeApiBody>({
        path: "/api/integrations/3shape/connect",
        method: "POST",
        token,
        jsonBody: { email: nextEmail, password },
      });
      if (!res.ok) {
        toast({
          title: "연결 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      setIntegration(res.data?.data || null);
      setPassword("");
      toast({
        title: "3Shape 연동",
        description: res.data?.message || "계정이 저장되었습니다.",
      });
    } catch (error) {
      toast({
        title: "연결 실패",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await request<ThreeShapeApiBody>({
        path: "/api/integrations/3shape/disconnect",
        method: "POST",
        token,
      });
      if (!res.ok) {
        toast({
          title: "해제 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      setIntegration(res.data?.data || null);
      setPassword("");
      toast({
        title: "연동 해제",
        description: res.data?.message || "3Shape 연동이 해제되었습니다.",
      });
    } catch (error) {
      toast({
        title: "해제 실패",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await request<ThreeShapeApiBody>({
        path: "/api/integrations/3shape/sync",
        method: "POST",
        token,
      });
      if (!res.ok) {
        toast({
          title: "동기화 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "동기화",
        description: res.data?.message || "동기화가 완료되었습니다.",
      });
      await load();
    } catch (error) {
      toast({
        title: "동기화 실패",
        description: error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <SettingsCardSkeleton />;
  }

  const status = String(integration?.status || "disconnected");

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-slate-200/80">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">3Shape Communicate</CardTitle>
              <CardDescription className="mt-1">
                TRIOS에서 기공소 Communicate 계정으로 보낸 구강스캔을 기공의뢰
                수신함으로 가져옵니다. 치과는 Unite/Communicate에서 이 계정
                이메일로 전송하면 됩니다.
              </CardDescription>
            </div>
            <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="three-shape-email">Communicate 이메일</Label>
              <Input
                id="three-shape-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lab@example.com"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="three-shape-password">비밀번호</Label>
              <Input
                id="three-shape-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={saving}
              />
            </div>
          </div>

          {integration?.lastSyncAt ? (
            <p className="text-xs text-muted-foreground">
              마지막 동기화: {formatKstDateTimeToKo(integration.lastSyncAt)}
            </p>
          ) : null}
          {integration?.lastError ? (
            <p className="text-xs text-destructive">{integration.lastError}</p>
          ) : null}
          {status === "pending" ? (
            <p className="text-xs text-amber-700">
              3Shape 파트너 API 승인 전까지는 계정만 저장됩니다. 승인 후 자동으로
              수신이 활성화됩니다.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleConnect()}
              disabled={saving}
            >
              <Link2 className="mr-1.5 h-4 w-4" />
              {status === "connected" || status === "pending"
                ? "계정 다시 연결"
                : "계정 연결"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSync()}
              disabled={saving || syncing || status !== "connected"}
            >
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              지금 동기화
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleDisconnect()}
              disabled={saving || status === "disconnected"}
            >
              <Unplug className="mr-1.5 h-4 w-4" />
              연결 해제
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
