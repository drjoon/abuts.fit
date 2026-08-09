// related files:
// - web/backend/modules/devops/designAccess.routes.js
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PenTool, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

type DesignAccessRow = {
  _id: string;
  name: string;
  businessNumberNormalized: string;
  status: string;
  designAccessEnabled: boolean;
};

function statusLabel(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "verified" || s === "approved") return "인증";
  if (s === "pending") return "대기";
  if (s === "rejected") return "거절";
  return status || "";
}

export const DesignerAssignmentTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DesignAccessRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : "";
      const res = await request<{
        success?: boolean;
        data?: DesignAccessRow[];
      }>({
        path: `/api/devops/design-access${qs}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("목록 조회 실패");
      }
      const body: any = res.data || {};
      const list = Array.isArray(body.data) ? body.data : [];
      setRows(list);
    } catch (error) {
      console.error("[DesignerAssignmentTab] load failed", error);
      toast({
        title: "목록 불러오기 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, toast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (row: DesignAccessRow, enabled: boolean) => {
    if (!token || savingId) return;
    setSavingId(row._id);
    const prev = rows;
    setRows((cur) =>
      cur.map((r) =>
        r._id === row._id ? { ...r, designAccessEnabled: enabled } : r,
      ),
    );
    try {
      const res = await request<{
        success?: boolean;
        data?: DesignAccessRow;
      }>({
        path: `/api/devops/design-access/${encodeURIComponent(row._id)}`,
        method: "PATCH",
        token,
        jsonBody: { enabled },
      });
      if (!res.ok) {
        throw new Error("저장 실패");
      }
      const body: any = res.data || {};
      if (body?.data?._id) {
        setRows((cur) =>
          cur.map((r) => (r._id === body.data._id ? { ...r, ...body.data } : r)),
        );
      }
    } catch (error) {
      console.error("[DesignerAssignmentTab] patch failed", error);
      setRows(prev);
      toast({
        title: "저장 실패",
        description: "디자인 접근 설정을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const enabledCount = rows.filter((r) => r.designAccessEnabled).length;

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PenTool className="h-5 w-5" />
              디자이너 지정
            </CardTitle>
            <CardDescription>
              지정된 의뢰자만 디자인 메뉴·큐에 접근할 수 있습니다.
            </CardDescription>
          </div>
          {!loading && rows.length > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              지정 {enabledCount} / {rows.length}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="사업자명 또는 사업자번호"
            className="pl-9"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-background/60">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              해당하는 의뢰자 사업자가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {rows.map((row) => {
                const label = statusLabel(row.status);
                return (
                  <li
                    key={row._id}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 transition-colors",
                      "hover:bg-muted/40",
                      row.designAccessEnabled && "bg-primary/[0.03]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {row.name || "이름 없음"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {row.businessNumberNormalized || "사업자번호 없음"}
                        </span>
                        {label ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                          >
                            {label}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Switch
                      checked={Boolean(row.designAccessEnabled)}
                      disabled={savingId === row._id}
                      onCheckedChange={(checked) => void onToggle(row, checked)}
                      aria-label={`${row.name} 디자인 접근`}
                      className="shrink-0"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
