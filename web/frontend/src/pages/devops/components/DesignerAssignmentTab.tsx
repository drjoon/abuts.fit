// related files:
// - web/backend/modules/devops/designAccess.routes.js
// - web/frontend/src/pages/devops/DevopsPartnerPage.tsx
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

type DesignAccessRow = {
  _id: string;
  name: string;
  businessNumberNormalized: string;
  status: string;
  designAccessEnabled: boolean;
};

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
      const qs = debouncedQ
        ? `?q=${encodeURIComponent(debouncedQ)}`
        : "";
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

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">디자이너지정</h3>
        <p className="text-sm text-muted-foreground">
          지정한 의뢰자 사업자만 사이드바에 디자인 메뉴가 노출되고 디자인 큐에
          접근할 수 있습니다.
        </p>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="사업자명 또는 사업자번호 검색"
        className="max-w-md"
      />

      <div className="rounded-lg border border-border divide-y divide-border bg-background">
        {loading ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            해당하는 의뢰자 사업자가 없습니다.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row._id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{row.name || "이름 없음"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {row.businessNumberNormalized || "사업자번호 없음"}
                  {row.status ? ` · ${row.status}` : ""}
                </div>
              </div>
              <Switch
                checked={Boolean(row.designAccessEnabled)}
                disabled={savingId === row._id}
                onCheckedChange={(checked) => void onToggle(row, checked)}
                aria-label={`${row.name} 디자인 접근`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
