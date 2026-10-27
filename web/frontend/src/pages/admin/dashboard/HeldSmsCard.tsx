// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/adminHeldSms.controller.js
import { useCallback, useEffect, useState } from "react";
import { MessageSquareWarning, Send, Trash2 } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";

type HeldPhone = { phone: string; name: string };
type HeldContent = {
  content: string;
  count: number;
  phones: HeldPhone[];
  more: number;
};
type HeldBatch = {
  id: string;
  reason: string;
  label: string;
  subject: string;
  createdAt: string;
  lastSeenAt?: string;
  hitCount: number;
  recipientCount: number;
  contents: HeldContent[];
};
type HeldGroup = {
  reason: string;
  label: string;
  batchCount: number;
  recipientCount: number;
  batches: HeldBatch[];
};
type HeldData = {
  pendingCount: number;
  recipientCount: number;
  groups: HeldGroup[];
};

type Props = {
  enabled?: boolean;
  className?: string;
};

const REASON_TONE: Record<string, string> = {
  SMS_LOOP: "border-rose-200 bg-rose-50/80",
  SMS_PHONE_BURST: "border-amber-200 bg-amber-50/80",
  SMS_SAME_CONTENT: "border-sky-200 bg-sky-50/70",
};

function formatWhen(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

export function HeldSmsCard({ enabled = true, className }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<HeldData | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await request<{ data?: HeldData }>({
        path: "/api/admin/sms/held",
        method: "GET",
      });
      if (res.ok) setData(res.data?.data || null);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = data?.pendingCount || 0;

  const act = async (id: string, kind: "send" | "dismiss") => {
    setBusyId(id);
    try {
      const res = await request<{ message?: string }>({
        path: `/api/admin/sms/held/${id}/${kind}`,
        method: "POST",
        jsonBody: {},
      });
      const message = String(res.data?.message || "");
      if (!res.ok) {
        toast({
          title: message || "처리하지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: kind === "send" ? "문자를 보냈습니다." : "보류를 지웠습니다.",
      });
      await load();
    } catch {
      toast({
        title: "처리하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <>
      <DashTile
        className={className}
        title="보류 문자"
        tone={pending > 0 ? "danger" : "default"}
        icon={<MessageSquareWarning className="h-4 w-4 text-muted-foreground" />}
        onClick={() => {
          void load();
          setOpen(true);
        }}
      >
        <div className="flex h-full flex-col justify-end gap-0.5">
          <DashBigNumber value={pending.toLocaleString()} unit="묶음" />
          <p className="truncate text-[11px] text-muted-foreground">
            {pending > 0
              ? `${(data?.recipientCount || 0).toLocaleString()}명 · 확인 후 발송`
              : "막힌 문자 없음"}
          </p>
        </div>
      </DashTile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(85vh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle>보류된 문자</DialogTitle>
            <DialogDescription>
              이유별로 나눠 두었습니다.
              <br />
              확인한 묶음만 지금 보냅니다.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {pending === 0 ? (
              <div className="mx-1.5 my-6 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-muted-foreground">
                보류된 문자가 없습니다.
              </div>
            ) : (
              <div className="space-y-5 px-1.5 py-1.5">
                {(data?.groups || []).map((group) => (
                  <section key={group.reason} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        {group.batchCount.toLocaleString()}묶음 · {group.recipientCount.toLocaleString()}명
                      </span>
                    </div>
                    {group.batches.map((batch) => (
                      <article
                        key={batch.id}
                        className={cn(
                          "rounded-2xl border p-3 shadow-sm",
                          REASON_TONE[batch.reason] || "border-slate-200 bg-white",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">
                              {formatWhen(batch.createdAt)}
                              <span className="ml-2 font-normal text-muted-foreground">
                                {batch.recipientCount.toLocaleString()}명
                              </span>
                            </p>
                            {batch.hitCount > 1 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                같은 묶음이 {batch.hitCount.toLocaleString()}번 막혔습니다.
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyId === batch.id}
                              onClick={() => void act(batch.id, "dismiss")}
                            >
                              <Trash2 />
                              지우기
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === batch.id}
                              onClick={() => void act(batch.id, "send")}
                            >
                              <Send />
                              {busyId === batch.id ? "보내는 중…" : "보내기"}
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {batch.contents.map((block, index) => (
                            <div
                              key={`${batch.id}-${index}`}
                              className="rounded-xl border border-white/80 bg-white/90 px-3 py-2"
                            >
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                                {block.content}
                              </p>
                              <p className="mt-1.5 text-xs text-muted-foreground">
                                {block.phones
                                  .map((row) =>
                                    row.name
                                      ? `${row.name} ${formatPhone(row.phone)}`
                                      : formatPhone(row.phone),
                                  )
                                  .join(" · ")}
                                {block.more > 0 ? ` 외 ${block.more.toLocaleString()}명` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
