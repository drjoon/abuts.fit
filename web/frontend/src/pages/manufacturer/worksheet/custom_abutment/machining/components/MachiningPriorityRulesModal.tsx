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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rules?.title || "가공 우선순위 룰"}</DialogTitle>
          <DialogDescription>
            {rules?.version
              ? `버전 ${rules.version}`
              : "장비 배정·큐 정렬·신속 재배치 기준"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">로딩…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            {(rules?.sections || []).map((section) => (
              <div
                key={section.id || section.title}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="text-sm font-extrabold text-slate-800">
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
      </DialogContent>
    </Dialog>
  );
}
