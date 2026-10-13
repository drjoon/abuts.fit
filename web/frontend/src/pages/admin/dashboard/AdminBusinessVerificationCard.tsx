// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.businessVerification.controller.js
// - web/backend/jobs/businessVerificationRetryWorker.js
// change-log:
// - 2026-10-13: 홈택스 장애로 보류된 사업자 검증 카드. 즉시 재검증·수동 승인·반려로 관리자가 개입한다.
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";

type PendingItem = {
  id: string;
  name: string;
  businessType: string;
  businessNumber: string;
  representativeName: string;
  phoneNumber: string;
  pendingAt?: string;
  message: string;
  retryCount: number;
  lastCheckedAt?: string | null;
  autoRetryStopped?: boolean;
};

type Props = {
  enabled?: boolean;
  className?: string;
};

// 5분 주기이므로 이 횟수를 넘으면 장애가 아니라 개별 문제로 본다(약 1시간).
const SUSPICIOUS_RETRY_COUNT = 12;

const isAttention = (i: PendingItem) =>
  Boolean(i.autoRetryStopped) || i.retryCount >= SUSPICIOUS_RETRY_COUNT;

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const fmtBizNo = (v: string) =>
  v.length === 10 ? `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}` : v;

export function AdminBusinessVerificationCard({
  enabled = true,
  className,
}: Props) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await request<{ data?: { pending?: PendingItem[] } }>({
        path: "/api/admin/business-verifications/pending",
        method: "GET",
      });
      if (res.ok) setItems(res.data?.data?.pending || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // 백엔드 워커·가입 저장이 보내는 변경 이벤트로 즉시 재조회
  useAppEventListener({
    eventTypes: ["business-verification:changed"],
    enabled,
    onMatch: () => void load(),
  });

  const act = async (
    item: PendingItem,
    action: "retry" | "approve" | "reject",
  ) => {
    if (action === "approve") {
      if (
        !window.confirm(
          `${item.name}을(를) 홈택스 확인 없이 승인할까요?\n사업자등록증을 직접 확인한 경우에만 승인하세요.`,
        )
      )
        return;
    }
    if (action === "reject") {
      if (
        !window.confirm(
          `${item.name}의 재검증을 중단하고 반려할까요?\n사업자는 미검증 상태로 남습니다.`,
        )
      )
        return;
    }
    setBusyId(item.id);
    try {
      const res = await request<{
        data?: { state?: string };
        message?: string;
      }>({
        path: `/api/admin/business-verifications/${encodeURIComponent(item.id)}/${action}`,
        method: "POST",
        jsonBody: {},
      });
      if (!res.ok) {
        toast.error(res.data?.message || "처리에 실패했습니다.");
      } else {
        const state = res.data?.data?.state;
        toast.success(
          state === "pending"
            ? "아직 홈택스가 응답하지 않습니다."
            : state === "verified"
              ? "검증 완료로 처리했습니다."
              : "보류를 해제했습니다.",
        );
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const count = items.length;
  const suspicious = items.filter(isAttention).length;

  return (
    <>
      <DashTile
        className={className}
        title="사업자 검증 보류"
        icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
        tone={suspicious > 0 ? "danger" : count > 0 ? "warn" : "default"}
        onClick={count > 0 ? () => setOpen(true) : undefined}
      >
        <div className="flex h-full flex-col justify-end gap-0.5">
          <DashBigNumber value={count.toLocaleString("ko-KR")} unit="보류" />
          <p className="truncate text-[11px] text-muted-foreground">
            {items[0]
              ? suspicious > 0
                ? `관리자 확인 필요 ${suspicious}건`
                : `${items[0].name}${count > 1 ? ` 외 ${count - 1}건` : ""}`
              : loading
                ? "불러오는 중…"
                : "홈택스 대기 없음"}
          </p>
        </div>
      </DashTile>
      <MultiActionDialog
        open={open && count > 0}
        onClose={() => setOpen(false)}
        panelClassName="!w-[min(900px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        title="사업자 검증 보류"
        actions={[
          { label: "닫기", variant: "secondary", onClick: () => setOpen(false) },
        ]}
        description={
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              홈택스 장애로 보류된 사업자입니다. 5분마다 하루 동안 자동 재검증합니다.
              <br />
              자동 재검증이 중단되었거나 횟수가 계속 늘면 직접 처리하세요.
            </p>
            <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
              {items.map((item) => {
                const busy = busyId === item.id;
                const warn = isAttention(item);
                return (
                  <li
                    key={item.id}
                    className={`flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm ${warn ? "border-rose-300" : "border-slate-200"}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtBizNo(item.businessNumber)} · 대표{" "}
                        {item.representativeName || "-"}
                        {item.phoneNumber ? ` · ${item.phoneNumber}` : ""}
                      </span>
                    </div>
                    <p
                      className={`text-xs ${warn ? "text-rose-600" : "text-muted-foreground"}`}
                    >
                      보류 {fmt(item.pendingAt)} · 재시도 {item.retryCount}회 ·
                      마지막 {fmt(item.lastCheckedAt)}
                      {item.autoRetryStopped ? " · 자동 재검증 중단(24시간 경과)" : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => void act(item, "retry")}
                      >
                        {busy ? "처리 중…" : "지금 재검증"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        onClick={() => void act(item, "approve")}
                      >
                        수동 승인
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        onClick={() => void act(item, "reject")}
                      >
                        반려
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        }
      />
    </>
  );
}
