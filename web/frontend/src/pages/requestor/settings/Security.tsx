// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

const getStatusBadge = (status: string) => {
  if (!status) return null;
  const normalized = String(status).toLowerCase();
  const label = status === "ok" ? "성공" : status;
  if (normalized === "ok" || normalized === "success") {
    return (
      <Badge className="border-0 bg-primary-soft text-primary-strong">
        {label}
      </Badge>
    );
  }
  if (normalized === "fail" || normalized === "error") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
};

const isSuccessStatus = (status: string) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "ok" || normalized === "success";
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
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-primary-strong" />
          보안
        </CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          최근 로그인 기록을 확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-slate-700">
            마지막 10건의 로그인 시도를 표시합니다. 본인이 아닌 접속이
            보이면 비밀번호를 변경해 주세요.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-10 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
              <Shield className="h-5 w-5 text-slate-400" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-700">
              로그인 기록이 없습니다
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {logs.map((log) => {
              const success = isSuccessStatus(log.status);
              return (
                <div
                  key={log._id || log.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-white/70 shadow-sm",
                    success
                      ? "border-primary-muted/60"
                      : "border-red-200/70",
                  )}
                >
                  <div
                    className={cn(
                      "h-1 w-full",
                      success ? "bg-primary-strong" : "bg-red-400",
                    )}
                  />
                  <div className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1",
                            success
                              ? "bg-primary-soft text-primary-strong ring-primary-muted/60"
                              : "bg-red-50 text-red-600 ring-red-200/80",
                          )}
                        >
                          {success ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <ShieldX className="h-4 w-4" />
                          )}
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {log.action || "로그인"}
                        </span>
                      </div>
                      {log.status ? getStatusBadge(log.status) : null}
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {log.details?.message || log.details?.reason || "-"}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : "-"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
