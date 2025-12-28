import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Shield, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
import { useToast } from "@/hooks/use-toast";

type SystemStatusItem = { name: string; status: string; message?: string };

const getStatusBadge = (status: string) => {
  switch (status) {
    case "ok":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
          정상
        </Badge>
      );
    case "warning":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
          주의
        </Badge>
      );
    case "critical":
      return <Badge variant="destructive">심각</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const ManufacturerSecurity = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [statusItems, setStatusItems] = useState<SystemStatusItem[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const [statsRes, logsRes] = await Promise.all([
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

        if (statsRes.ok && statsRes.data?.success) {
          setStatusItems(statsRes.data.data?.systemStatus || []);
        } else if (statsRes.status === 403) {
          toast({ title: "접근 권한이 없습니다.", variant: "destructive" });
        }

        if (logsRes.ok && logsRes.data?.success) {
          setLogs(logsRes.data.data?.logs || []);
        }
      } catch (error: any) {
        toast({
          title: "보안 정보 불러오기 실패",
          description: String(error),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [token, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">보안</h1>
        <p className="text-muted-foreground mt-1">
          시스템 상태와 최근 보안 이벤트를 확인하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            시스템 상태
          </CardTitle>
          <CardDescription>네트워크, 백업 등 주요 상태</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          )}
          {!loading && statusItems.length === 0 && (
            <div className="text-sm text-muted-foreground">
              표시할 상태 정보가 없습니다.
            </div>
          )}
          {!loading &&
            statusItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.message || "-"}
                  </div>
                </div>
                {item.status === "ok" ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : item.status === "warning" ? (
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                )}
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 보안 로그</CardTitle>
          <CardDescription>마지막 10건의 이벤트를 표시합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.map((log) => (
            <div
              key={log._id || log.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{log.action || "이벤트"}</span>
                  {log.status ? getStatusBadge(log.status) : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {log.details?.message || log.details?.reason || "-"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {log.createdAt
                    ? new Date(log.createdAt).toLocaleString()
                    : ""}
                </div>
              </div>
            </div>
          ))}
          {!logs.length && (
            <div className="text-sm text-muted-foreground">
              로그가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
