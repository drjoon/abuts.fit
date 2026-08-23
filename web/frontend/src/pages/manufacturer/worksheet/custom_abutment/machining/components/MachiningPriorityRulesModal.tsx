// related files:
// - web/backend/controllers/requests/machiningPriorityRules.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RuleSection = {
  id?: string;
  title?: string;
  items?: string[];
};

type PriorityRules = {
  version?: string;
  title?: string;
  sections?: RuleSection[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
};

export function MachiningPriorityRulesModal({
  open,
  onOpenChange,
  token,
}: Props) {
  const [rules, setRules] = useState<PriorityRules | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/cnc-machines/machining-priority-rules", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.message || "룰을 불러오지 못했습니다.");
        }
        if (!cancelled) setRules(body?.data || null);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "룰을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
            {rules?.title || "가공 우선순위 룰"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            {rules?.version
              ? `버전 ${rules.version}`
              : "장비 배정 · 큐 정렬 · 신속 재배치 기준"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-8 sm:px-6">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">로딩…</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive-muted bg-destructive-soft px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="space-y-3">
              {(rules?.sections || []).map((section) => (
                <div
                  key={section.id || section.title}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"
                >
                  <div className="text-sm font-semibold text-slate-800">
                    {section.title}
                  </div>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] text-slate-700">
                    {(section.items || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
