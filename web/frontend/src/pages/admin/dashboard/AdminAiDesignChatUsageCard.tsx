// 관리자 대시보드 — 의뢰 치과별 커스텀어벗 AI 디자인 토큰·금액.
// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.aiDesignChatUsage.controller.js
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UsageAccount = {
  anchorId: string;
  name: string;
  calls: number;
  totalTokens: number;
  costKrw: number;
};

type UsageData = {
  fxKrwPerUsd: number;
  totals: { calls: number; totalTokens: number; costKrw: number; accounts: number };
  accounts: UsageAccount[];
};

function formatKrw(value: number) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n <= 0) return "0원";
  return `${n.toLocaleString("ko-KR")}원`;
}

export function AdminAiDesignChatUsageCard({
  enabled = true,
  className,
}: {
  enabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["admin-ai-design-chat-usage"],
    enabled,
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: UsageData }>({
        path: "/api/admin/ai-design-chat-usage",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("AI 디자인 사용량을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const totals = query.data?.totals;
  const accounts = query.data?.accounts || [];
  const costKrw = totals?.costKrw ?? 0;
  const totalTokens = totals?.totalTokens ?? 0;
  const fx = query.data?.fxKrwPerUsd ?? 1332;
  const hasUsage = totalTokens > 0 || costKrw > 0;

  return (
    <>
      <DashTile
        className={className}
        title="AI 디자인"
        icon={<Bot className="h-4 w-4 text-muted-foreground" />}
        onClick={hasUsage ? () => setOpen(true) : undefined}
      >
        <div className="flex min-h-full flex-col justify-end gap-0.5">
          <DashBigNumber
            value={query.isLoading || query.isError ? "—" : formatKrw(costKrw).replace(/원$/, "")}
            unit={query.isLoading || query.isError ? undefined : "원"}
          />
          <p className="truncate text-[11px] text-muted-foreground">
            {query.isLoading
              ? "불러오는 중…"
              : query.isError
                ? "불러오지 못함"
                : hasUsage
                  ? `${totalTokens.toLocaleString("ko-KR")}토큰`
                  : "사용 없음"}
          </p>
        </div>
      </DashTile>
      <Dialog open={open && hasUsage} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI 디자인 사용량</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                의뢰 치과별 누적입니다.
                <br />
                금액은 Gemini 3.5 Flash-Lite 유료 단가입니다.
                <br />
                달러는 {fx.toLocaleString("ko-KR")}원으로 계산해 호출 때 확정합니다.
              </div>
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
            {accounts.map((row) => (
              <li
                key={row.anchorId || row.name}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                    {row.name}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-slate-800">
                    {formatKrw(row.costKrw)}
                  </span>
                </div>
                <div className="truncate text-[11px] tabular-nums text-muted-foreground">
                  {row.totalTokens.toLocaleString("ko-KR")}토큰 · {row.calls.toLocaleString("ko-KR")}회
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
