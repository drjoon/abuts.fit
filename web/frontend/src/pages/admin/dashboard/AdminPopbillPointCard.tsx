// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.popbillPoint.controller.js
// change-log:
// - 2026-10-13: 숫자와 P가 카드 안에서 겹치지 않게 충전 버튼을 헤더로 옮김. 복귀 시 잔액 재조회.
// - 2026-10-13: 팝빌 파트너 잔여포인트 부족 시 관리자 충전 안내(계좌 확인은 수동 검증으로 통과 중).
import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";

type PointData = {
  configured: boolean;
  balance: number | null;
  testMode?: boolean;
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
  const chargePollRef = useRef<number | null>(null);

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
    const t = window.setInterval(() => void load(), 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      if (chargePollRef.current != null) window.clearInterval(chargePollRef.current);
    };
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
      if (chargePollRef.current != null) window.clearInterval(chargePollRef.current);
      const started = Date.now();
      chargePollRef.current = window.setInterval(() => {
        void load();
        const closed = !win || win.closed;
        const elapsed = Date.now() - started;
        if ((closed && elapsed > 12_000) || elapsed > 3 * 60 * 1000) {
          if (chargePollRef.current != null) window.clearInterval(chargePollRef.current);
          chargePollRef.current = null;
          void load();
        }
      }, 8_000);
    } finally {
      setBusy(false);
    }
  };

  const balance = data?.balance;
  const shortage = Boolean(data?.shortage) || (balance != null && balance <= 0);
  const low = balance != null && balance < 1000;
  const showCharge = Boolean(data?.configured && (shortage || low));
  const balanceText = balance != null ? balance.toLocaleString("ko-KR") : "-";

  return (
    <DashTile
      className={className}
      title="팝빌 포인트"
      icon={<Coins className="h-4 w-4 text-muted-foreground" />}
      extra={
        showCharge ? (
          <button
            type="button"
            disabled={busy}
            className="shrink-0 rounded-md border border-rose-300 px-1.5 py-0.5 text-[11px] leading-none text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            onClick={(event) => {
              event.stopPropagation();
              void charge();
            }}
          >
            {busy ? "여는 중…" : "충전"}
          </button>
        ) : undefined
      }
      tone={shortage ? "danger" : low ? "warn" : "default"}
    >
      <div className="flex h-full flex-col justify-end gap-1">
        <div className="flex items-end gap-2 whitespace-nowrap">
          <span className="text-2xl font-bold tabular-nums leading-none">{balanceText}</span>
          <span className="mb-0.5 text-sm font-medium leading-none text-muted-foreground">P</span>
        </div>
        <p
          className={`truncate text-[11px] ${shortage ? "text-rose-600" : "text-muted-foreground"}`}
        >
          {!data
            ? "불러오는 중…"
            : !data.configured
              ? "팝빌 미설정"
              : data.shortage
                ? `부족 ${data.shortage.count}회 · ${fmt(data.shortage.at)}`
                : data.testMode
                  ? "테스트 잔액"
                  : balance != null && balance <= 0
                    ? "잔액 없음"
                    : "정상"}
        </p>
      </div>
    </DashTile>
  );
}
