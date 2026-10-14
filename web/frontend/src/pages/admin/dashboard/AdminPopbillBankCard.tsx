// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.popbillBank.controller.js
// change-log:
// - 2026-10-14: 관리자 대시보드에 하나은행 잔액. 20분 자동 수집 결과를 보여주고 즉시 조회할 수 있다.
import { useCallback, useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";

type BankData = {
  configured: boolean;
  testMode?: boolean;
  bankName?: string;
  accountTail?: string;
  balance: number | null;
  syncedAt?: string | null;
  depositCount?: number;
  error?: string;
};

type Props = {
  enabled?: boolean;
  className?: string;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AdminPopbillBankCard({ enabled = true, className }: Props) {
  const [data, setData] = useState<BankData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await request<{ data?: BankData }>({
        path: "/api/admin/popbill/bank",
        method: "GET",
      });
      if (res.ok) setData(res.data?.data || null);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await request<{ data?: BankData; message?: string }>({
        path: "/api/admin/popbill/bank/sync",
        method: "POST",
        jsonBody: {},
      });
      if (!res.ok) {
        toast.error(res.data?.message || "계좌를 조회하지 못했습니다.");
        await load();
        return;
      }
      if (res.data?.data) setData(res.data.data);
    } finally {
      setBusy(false);
    }
  };

  const balance = data?.balance;
  const failed = Boolean(data?.error);
  const balanceText = balance != null ? balance.toLocaleString("ko-KR") : "-";
  const tail = data?.accountTail ? `끝자리 ${data.accountTail}` : "";
  const subtitle = !data
    ? "불러오는 중…"
    : !data.configured
      ? "팝빌 미설정"
      : failed
        ? data.error
        : data.syncedAt
          ? `${tail} · ${fmt(data.syncedAt)}`
          : "20분마다 갱신";

  return (
    <DashTile
      className={className}
      title={`${data?.bankName || "하나은행"} 잔액`}
      icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
      extra={
        data?.configured ? (
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] leading-none hover:bg-muted disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              void sync();
            }}
          >
            {busy ? "조회 중…" : "조회"}
          </button>
        ) : undefined
      }
      tone={failed ? "danger" : "default"}
    >
      <div className="flex h-full flex-col justify-end gap-1">
        <div className="flex items-end gap-1 whitespace-nowrap">
          <span className="text-2xl font-bold tabular-nums leading-none">{balanceText}</span>
          <span className="mb-0.5 text-sm font-medium leading-none text-muted-foreground">원</span>
        </div>
        <p
          className={`truncate text-[11px] ${failed ? "text-rose-600" : "text-muted-foreground"}`}
          title={subtitle}
        >
          {data?.testMode && !failed ? "테스트 · " : ""}
          {subtitle}
        </p>
      </div>
    </DashTile>
  );
}
