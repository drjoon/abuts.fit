// 관리자 대시보드 — 간접어벗. 타사 스캔바디와 어벗츠 스캔바디를 한 화면에서 다룬다.
// 치과 신규의뢰의 간접 어벗(스캔바디 | 심플 힐링)과 같이 두 칸을 나란히 둔다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { fetchScanbodyDemand, type ScanbodyDemandRow } from "@/shared/practice/scanbodyLibraryApi";
import { cn } from "@/shared/ui/cn";
import { ScanbodyDemandCard } from "@/pages/admin/dashboard/ScanbodyDemandCard";
import { ScanbodyGeneratorCard } from "@/pages/admin/dashboard/ScanbodyGeneratorCard";

const POLL_MS = 60_000;

function demandKeys(row: ScanbodyDemandRow) {
  return row.keys?.length ? row.keys : [row.key];
}

export function IndirectAbutmentCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ScanbodyDemandRow[]>([]);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchScanbodyDemand();
      const prev = known.current;
      if (prev) {
        const fresh = next.filter((row) => demandKeys(row).some((key) => !prev.has(key)));
        if (fresh.length > 0) {
          const label = (row: ScanbodyDemandRow) =>
            `${row.maker} ${row.type === "template" ? "템플릿" : "스캔바디"}`;
          toast({
            title: "라이브러리가 없는 스캔바디 의뢰가 들어왔습니다.",
            description: fresh.slice(0, 3).map(label).join(", "),
          });
        }
      }
      known.current = new Set(next.flatMap(demandKeys));
      setRows(next);
    } catch {
      // 다음 폴링에서 다시 받는다.
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useAppEventDebouncedReload({
    eventTypes: ["scanbody:demand-updated"],
    delayMs: 800,
    requireVisible: false,
    onMatch: () => load(),
  });

  const transfers = rows.reduce((sum, row) => sum + row.transferCount, 0);
  const hasRows = rows.length > 0;

  return (
    <>
      <Card
        className={cn(
          "app-glass-card app-glass-card--lg h-full cursor-pointer transition hover:bg-slate-50/60",
          hasRows && "border-amber-300 bg-amber-50/60 hover:bg-amber-50",
          className,
        )}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">간접어벗</CardTitle>
          <Boxes className={cn("h-4 w-4", hasRows ? "text-amber-600" : "text-muted-foreground")} />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div className={cn("text-2xl font-bold", hasRows && "text-amber-900")}>
              {rows.length.toLocaleString()}
              <span className="ml-1 text-sm font-medium text-muted-foreground">종</span>
            </div>
            <span className="text-xs text-muted-foreground">의뢰 {transfers.toLocaleString()}건</span>
          </div>
          <p className="text-[11px] text-muted-foreground">타사 · 어벗츠 스캔바디</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[min(90rem,calc(100vw-2rem))] max-w-[min(90rem,calc(100vw-2rem))] flex-col gap-4 overflow-hidden sm:max-w-[min(90rem,calc(100vw-2rem))]">
          <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
            <DialogTitle className="text-base">간접어벗</DialogTitle>
            <p className="text-sm text-slate-500">스캔바디</p>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-2">
            <section className="min-h-0 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3">
              <ScanbodyDemandCard embedded notifyNew={false} />
            </section>
            <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-3">
              <ScanbodyGeneratorCard embedded />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
