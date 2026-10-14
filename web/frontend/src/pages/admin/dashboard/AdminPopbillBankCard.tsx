// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.popbillBank.controller.js
// change-log:
// - 2026-10-14: 조회 상태 메시지를 카드에 문장 단위로 표시.
// - 2026-10-14: 관리자 대시보드에 하나은행 잔액. 20분 자동 수집 결과를 보여주고 즉시 조회할 수 있다.
import { useCallback, useEffect, useState } from "react";
import { Landmark } from "lucide-react";
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

/** 팝빌 문구는 '다.' 뒤에서만 끊는다. 날짜의 마침표는 나누지 않는다. */
function statusLines(text: string) {
  return text
    .split(/(?<=다\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

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
        const message = res.data?.message || "계좌를 조회하지 못했습니다.";
        setData((prev) => ({
          configured: prev?.configured ?? true,
          testMode: prev?.testMode,
          bankName: prev?.bankName,
          accountTail: prev?.accountTail,
          balance: prev?.balance ?? null,
          syncedAt: prev?.syncedAt,
          depositCount: prev?.depositCount,
          error: message,
        }));
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
  const lines = busy
    ? ["팝빌에 수집을 요청했습니다.", "완료될 때까지 기다립니다."]
    : !data
      ? ["불러오는 중…"]
      : !data.configured
        ? ["팝빌 연동 설정이 없습니다."]
        : data.error
          ? statusLines(data.error)
          : data.syncedAt
            ? ["조회가 완료되었습니다.", `${fmt(data.syncedAt)}에 확인했습니다.`]
            : ["아직 조회 전입니다.", "20분마다 자동으로 확인합니다."];

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
      tone={failed && !busy ? "danger" : "default"}
    >
      <div className="flex h-full min-h-0 flex-col gap-1">
        <div className="flex shrink-0 items-end gap-1 whitespace-nowrap">
          <span className="text-2xl font-bold tabular-nums leading-none">{balanceText}</span>
          <span className="mb-0.5 text-sm font-medium leading-none text-muted-foreground">원</span>
        </div>
        <p
          className={`min-h-0 flex-1 overflow-y-auto px-0.5 text-[11px] leading-snug ${
            failed && !busy ? "text-rose-600" : "text-muted-foreground"
          }`}
        >
          {data?.testMode && !failed && !busy ? (
            <>
              테스트 환경입니다.
              <br />
            </>
          ) : null}
          {lines.map((line, index) => (
            <span key={`${index}-${line}`}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      </div>
    </DashTile>
  );
}
