// change-log:
// - 2026-10-24: 관리자 대시보드 「런칭 - 실사용 전환」. 할 일 확인 후 베타를 끈다.
// related files:
// - web/backend/services/practiceLaunch.service.js
// - web/backend/controllers/admin/adminPracticeLaunch.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
import { useCallback, useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { formatKstDateTimeToKo } from "@/shared/date/kst";

type LaunchTask = {
  id: string;
  text: string;
};

type LaunchState = {
  status: "beta" | "live";
  switchedAt?: string | null;
  switchedByName?: string;
  adminTasks: LaunchTask[];
  platformTasks: LaunchTask[];
};

function TaskList({
  title,
  tasks,
}: {
  title: string;
  tasks: LaunchTask[];
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ol className="mt-2 flex flex-col gap-2">
        {tasks.map((task, index) => (
          <li
            key={task.id || String(index)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <p>
              <span className="mr-1.5 tabular-nums text-slate-400">{index + 1}.</span>
              {String(task.text || "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, lineIndex) => (
                  <span key={`${task.id}-${lineIndex}`}>
                    {lineIndex > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AdminPracticeLaunchButton({
  token,
}: {
  token?: string | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<LaunchState | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await request<{ success?: boolean; data?: LaunchState; message?: string }>({
        path: "/api/admin/practice-launch",
        method: "GET",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        setState(res.data.data);
        return;
      }
      if (!opts?.quiet) {
        toast({
          title: "실사용 전환",
          description: res.data?.message || "상태를 불러오지 못했습니다.",
          variant: "destructive",
        });
      }
    } catch {
      if (!opts?.quiet) {
        toast({
          title: "실사용 전환",
          description: "상태를 불러오지 못했습니다.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void load({ quiet: true });
  }, [load]);

  const live = state?.status === "live";

  const confirm = async () => {
    if (!token || live || busy) return;
    setBusy(true);
    try {
      const res = await request<{ success?: boolean; data?: LaunchState; message?: string }>({
        path: "/api/admin/practice-launch/switch",
        method: "POST",
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.success && res.data.data) {
        setState(res.data.data);
        toast({
          title: "실사용으로 전환했습니다.",
          description: "미납이면 새 기공의뢰를 막습니다.",
        });
        return;
      }
      toast({
        title: "실사용 전환",
        description: res.data?.message || "전환에 실패했습니다.",
        variant: "destructive",
      });
      if (res.status === 409) void load();
    } catch {
      toast({
        title: "실사용 전환",
        description: "전환에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const switchedLabel = state?.switchedAt
    ? formatKstDateTimeToKo(state.switchedAt)
    : "";

  return (
    <>
      <Button
        type="button"
        variant={live ? "outline" : "default"}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <Rocket />
        {live ? "실사용 전환됨" : "런칭 - 실사용 전환"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>런칭 - 실사용 전환</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-slate-600">
                {live ? (
                  <p>
                    실사용으로 전환했습니다.
                    {switchedLabel ? (
                      <>
                        <br />
                        {switchedLabel}
                        {state?.switchedByName ? ` · ${state.switchedByName}` : ""}
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p>
                    베타 동안에는 미납이어도 새 주문을 막지 않습니다.
                    <br />
                    확인하면 플랫폼 항목이 바로 적용됩니다.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1.5 py-1.5">
            {loading && !state ? (
              <p className="text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                <TaskList
                  title={live ? "전환 때 안내한 관리자 할 일" : "관리자가 할 일"}
                  tasks={state?.adminTasks || []}
                />
                <TaskList
                  title={live ? "플랫폼이 바꾼 일" : "플랫폼이 바꿀 일"}
                  tasks={state?.platformTasks || []}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              닫기
            </Button>
            {live ? null : (
              <Button type="button" onClick={() => void confirm()} disabled={busy || loading || !state}>
                {busy ? "처리 중…" : "실사용으로 전환"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
