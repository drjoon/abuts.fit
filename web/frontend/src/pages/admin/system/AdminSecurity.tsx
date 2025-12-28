import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Shield,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle,
  Key,
  Server,
  Database,
  Network,
} from "lucide-react";

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case "high":
      return <Badge variant="destructive">높음</Badge>;
    case "medium":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          보통
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          낮음
        </Badge>
      );
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "blocked":
      return <Badge variant="destructive">차단됨</Badge>;
    case "allowed":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          허용됨
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const AdminSecurity = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: true,
    loginNotifications: true,
    dataEncryption: true,
    autoLogout: 30,
    maxLoginAttempts: 5,
    passwordExpiry: 90,
    fileUploadScan: true,
    ipWhitelist: true,
    apiRateLimit: 1000,
    backupFrequency: "daily",
  });

  const storageKey = useMemo(() => {
    return "abutsfit:admin-security-settings:v1";
  }, []);

  const [stats, setStats] = useState<{
    securityScore?: number;
    monitoring?: string;
    alertsDetected?: number;
    blockedAttempts?: number;
  }>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [settingsRes, statsRes, logsRes] = await Promise.all([
          apiFetch<any>({
            path: "/api/admin/security-settings",
            method: "GET",
            token,
          }),
          apiFetch<any>({
            path: "/api/admin/security-stats",
            method: "GET",
            token,
          }),
          apiFetch<any>({
            path: "/api/admin/security-logs?limit=10",
            method: "GET",
            token,
          }),
        ]);

        if (settingsRes.ok && settingsRes.data?.success) {
          setSecuritySettings((prev) => ({
            ...prev,
            ...(settingsRes.data.data?.securitySettings || {}),
          }));
        }
        if (statsRes.ok && statsRes.data?.success) {
          setStats(statsRes.data.data || {});
        }
        if (logsRes.ok && logsRes.data?.success) {
          setLogs(logsRes.data.data?.logs || []);
        }
      } finally {
        setLoading(false);
      }
    };
    void fetchAll();
  }, [token, storageKey]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const res = await apiFetch<any>({
        path: "/api/admin/security-settings",
        method: "PUT",
        token,
        jsonBody: securitySettings,
      });
      if (!res.ok || !res.data?.success) {
        toast({
          title: "저장 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "보안 설정이 저장되었습니다." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Shield className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">보안 점수</p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.securityScore ?? "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Eye className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">모니터링</p>
                  <p className="text-2xl font-bold">
                    {stats.monitoring || "-"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">위험 탐지</p>
                  <p className="text-2xl font-bold">
                    {(stats.alertsDetected ?? 0).toLocaleString()}건
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">차단된 시도</p>
                  <p className="text-2xl font-bold">
                    {(stats.blockedAttempts ?? 0).toLocaleString()}건
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                보안 정책
              </CardTitle>
              <CardDescription>
                시스템 보안 정책을 설정하고 관리하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>2단계 인증</Label>
                    <p className="text-sm text-muted-foreground">
                      어벗츠.핏 계정에 2단계 인증을 적용합니다
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.twoFactorAuth}
                    onCheckedChange={(checked) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        twoFactorAuth: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>로그인 알림</Label>
                    <p className="text-sm text-muted-foreground">
                      새로운 로그인 시 이메일 알림을 발송합니다
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.loginNotifications}
                    onCheckedChange={(checked) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        loginNotifications: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>데이터 암호화</Label>
                    <p className="text-sm text-muted-foreground">
                      민감한 데이터를 암호화하여 저장합니다
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.dataEncryption}
                    onCheckedChange={(checked) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        dataEncryption: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>파일 업로드 스캔</Label>
                    <p className="text-sm text-muted-foreground">
                      업로드된 파일의 악성코드를 검사합니다
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.fileUploadScan}
                    onCheckedChange={(checked) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        fileUploadScan: checked,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="autoLogout">자동 로그아웃 (분)</Label>
                  <Input
                    id="autoLogout"
                    type="number"
                    value={securitySettings.autoLogout}
                    onChange={(e) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        autoLogout: parseInt(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxLoginAttempts">최대 로그인 시도</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={securitySettings.maxLoginAttempts}
                    onChange={(e) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        maxLoginAttempts: parseInt(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving || loading}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                시스템 상태
              </CardTitle>
              <CardDescription>
                서버 및 시스템의 보안 상태를 확인하세요
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">데이터베이스</p>
                      <p className="text-sm text-muted-foreground">
                        암호화 활성화, 정상 작동
                      </p>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>

                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Network className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">네트워크</p>
                      <p className="text-sm text-muted-foreground">
                        SSL 인증서 유효, 방화벽 활성화
                      </p>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>

                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="font-medium">API 보안</p>
                      <p className="text-sm text-muted-foreground">
                        속도 제한 적용, 토큰 관리 중
                      </p>
                    </div>
                  </div>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                </div>

                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">백업 시스템</p>
                      <p className="text-sm text-muted-foreground">
                        일일 백업 완료, 복구 테스트 완료
                      </p>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Security Logs */}
        <Card>
          <CardHeader>
            <CardTitle>보안 로그</CardTitle>
            <CardDescription>
              최근 보안 이벤트 및 위협 탐지 기록
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log._id || log.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <h4 className="font-medium">{log.action || "이벤트"}</h4>
                      {log.details?.severity
                        ? getSeverityBadge(log.details.severity)
                        : null}
                      {log.details?.status
                        ? getStatusBadge(log.details.status)
                        : null}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {log.userId ? <span>사용자: {log.userId}</span> : null}
                      {log.ipAddress ? (
                        <>
                          <span>•</span>
                          <span>IP: {log.ipAddress}</span>
                        </>
                      ) : null}
                      <span>•</span>
                      <span>
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString()
                          : ""}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    상세보기
                  </Button>
                </div>
              ))}
              {!logs.length && (
                <div className="text-sm text-muted-foreground">
                  보안 로그가 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
