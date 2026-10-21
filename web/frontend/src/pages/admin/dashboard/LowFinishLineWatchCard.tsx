// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/lowFinishLineWatch.controller.js
// change-log:
// - 2026-10-21: 짧은 커프(피니시라인 1mm 미만) 50건 통과·실패 0이면 준비 경고를 끈다.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ruler } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";

type WatchCase = {
  requestId: string;
  minZ: number;
  clinicName: string;
  patientName: string;
  tooth: string;
  connection: string;
  status: "open" | "success" | "failed" | string;
  verdict: string;
};

type WatchData = {
  target: number;
  success: number;
  failed: number;
  open: number;
  warning: boolean;
  cases: WatchCase[];
};

const STATUS_LABEL: Record<string, string> = {
  open: "진행",
  success: "통과",
  failed: "실패",
};

function toothLabel(tooth: string) {
  const text = tooth.trim();
  if (!text) return "";
  return text.startsWith("#") ? text : `#${text}`;
}

function caseTitle(row: WatchCase) {
  return [row.clinicName, row.patientName, toothLabel(row.tooth)]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

export function LowFinishLineWatchCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["low-finish-line-watch"],
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: WatchData }>({
        path: "/api/admin/low-finish-line-watch",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("짧은 커프 현황을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 15_000,
  });

  const verdict = useMutation({
    mutationFn: async (input: { requestId: string; verdict: "success" | "failed" }) => {
      const res = await request<{ success?: boolean; data?: WatchData }>({
        path: `/api/admin/low-finish-line-watch/${encodeURIComponent(input.requestId)}/verdict`,
        method: "POST",
        body: { verdict: input.verdict },
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("판정을 저장하지 못했습니다.");
      }
      return res.data.data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["low-finish-line-watch"], data);
      await queryClient.invalidateQueries({ queryKey: ["low-finish-line-warning"] });
    },
  });

  const data = query.data;
  const target = data?.target ?? 50;
  const success = data?.success ?? 0;
  const failed = data?.failed ?? 0;
  const warning = data?.warning !== false;
  const ratio = target > 0 ? Math.min(1, success / target) : 0;
  const sub =
    failed > 0
      ? `실패 ${failed.toLocaleString("ko-KR")}건 · 경고 유지`
      : !warning
        ? "경고를 껐습니다."
        : "실패 없으면 경고를 끕니다.";

  return (
    <>
      <DashTile
        className={className}
        title="짧은 커프"
        tone={failed > 0 ? "warn" : "default"}
        icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
        onClick={() => setOpen(true)}
      >
        <div className="flex h-full flex-col justify-end gap-1">
          <DashBigNumber
            value={query.isLoading ? "…" : `${success.toLocaleString("ko-KR")}/${target}`}
            unit="통과"
          />
          <div className="h-1 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className={cn(
                "h-full rounded-full",
                failed > 0 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {query.isError ? "불러오지 못했습니다." : sub}
          </p>
        </div>
      </DashTile>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>짧은 커프</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {warning ? (
                  <>
                    피니시라인이 1mm보다 낮습니다.
                    <br />
                    가공을 마친 건이 목표에 모두 도달하면 준비 경고를 끕니다.
                  </>
                ) : (
                  <>
                    준비 경고를 껐습니다.
                    <br />
                    실패가 생기면 다시 켭니다.
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  failed > 0 ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-slate-700">
              {success.toLocaleString("ko-KR")}/{target}
              {data?.open ? ` · 진행 ${data.open.toLocaleString("ko-KR")}` : ""}
            </span>
          </div>

          <ul className="max-h-72 space-y-1.5 overflow-y-auto px-1.5 py-1.5">
            {(data?.cases || []).length === 0 ? (
              <li className="px-1 py-6 text-center text-sm text-muted-foreground">
                낮은 피니시라인 의뢰가 아직 없습니다.
              </li>
            ) : (
              (data?.cases || []).map((row) => {
                const title = caseTitle(row) || row.requestId;
                const busy =
                  verdict.isPending && verdict.variables?.requestId === row.requestId;
                return (
                  <li
                    key={row.requestId}
                    className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {title}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[
                          row.connection,
                          Number.isFinite(row.minZ) ? `${row.minZ.toFixed(2)}mm` : "",
                          STATUS_LABEL[row.status] || row.status,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {row.status !== "success" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={() =>
                            verdict.mutate({ requestId: row.requestId, verdict: "success" })
                          }
                        >
                          통과
                        </Button>
                      ) : null}
                      {row.status !== "failed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={() =>
                            verdict.mutate({ requestId: row.requestId, verdict: "failed" })
                          }
                        >
                          실패
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
