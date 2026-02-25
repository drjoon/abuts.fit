import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

const getStatusBadge = (status: string) => {
  if (!status) return null;
  const normalized = String(status).toLowerCase();
  const label = status === "ok" ? "성공" : status;
  if (normalized === "ok" || normalized === "success") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        {label}
      </Badge>
    );
  }
  if (normalized === "fail" || normalized === "error") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
};

export const RequestorSecurity = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const logsRes = await apiFetch<any>({
          path: "/api/users/security-logs?limit=10",
          method: "GET",
          token,
        });

        if (logsRes.ok && logsRes.data?.success) {
          setLogs(logsRes.data.data?.logs || []);
        } else if (logsRes.status === 403) {
          toast({ title: "접근 권한이 없습니다.", variant: "destructive" });
        }
      } catch (error: any) {
        toast({
          title: "최근 로그인 기록을 불러오지 못했습니다",
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
          최근 로그인 기록만 표시합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            최근 로그인 기록
          </CardTitle>
          <CardDescription>
            마지막 10건의 로그인 시도를 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          )}
          {logs.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {logs.map((log) => (
                <div
                  key={log._id || log.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {log.action || "이벤트"}
                      </span>
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
            </div>
          )}
          {!loading && logs.length === 0 && (
            <div className="text-sm text-muted-foreground">
              로그가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
