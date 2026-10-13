// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.popbillPoint.controller.js
// change-log:
// - 2026-10-13: 팝빌 파트너 잔여포인트 부족 시 관리자 충전 안내(계좌 확인은 수동 검증으로 통과 중).
import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";

type PointData = {
  configured: boolean;
  balance: number | null;
  error?: string;
  shortage: { at: string; count: number; message: string } | null;
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

export function AdminPopbillPointCard({ enabled = true, className }: Props) {
  const [data, setData] = useState<PointData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await request<{ data?: PointData }>({
        path: "/api/admin/popbill/point",
        method: "GET",
      });
      if (res.ok) setData(res.data?.data || null);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

  const charge = async () => {
    // 비동기 후 window.open은 팝업 차단되므로 먼저 창을 연다.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await request<{ data?: { url?: string }; message?: string }>({
        path: "/api/admin/popbill/point/charge-url",
        method: "POST",
        jsonBody: {},
      });
      const url = res.data?.data?.url;
      if (!res.ok || !url) {
        win?.close();
        toast.error(res.data?.message || "충전 페이지를 열지 못했습니다.");
        return;
      }
      if (win) win.location.href = url;
      else window.location.href = url;
    } finally {
      setBusy(false);
    }
  };

  const balance = data?.balance;
  const shortage = Boolean(data?.shortage) || (balance != null && balance <= 0);
  const low = balance != null && balance < 1000;

  return (
    <DashTile
      className={className}
      title="팝빌 포인트"
      icon={<Coins className="h-4 w-4 text-muted-foreground" />}
      tone={shortage ? "danger" : low ? "warn" : "default"}
    >
      <div className="flex h-full flex-col justify-end gap-1">
        <DashBigNumber
          value={balance != null ? balance.toLocaleString("ko-KR") : "-"}
          unit="P"
        />
        <p
          className={`truncate text-[11px] ${shortage ? "text-rose-600" : "text-muted-foreground"}`}
        >
          {!data
            ? "불러오는 중…"
            : !data.configured
              ? "팝빌 미설정"
              : data.shortage
                ? `부족 ${data.shortage.count}회 · ${fmt(data.shortage.at)}`
                : "정상"}
        </p>
        {data?.configured && (shortage || low) ? (
          <button
            type="button"
            disabled={busy}
            className="self-start rounded-md border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            onClick={() => void charge()}
          >
            {busy ? "여는 중…" : "포인트 충전"}
          </button>
        ) : null}
      </div>
    </DashTile>
  );
}
