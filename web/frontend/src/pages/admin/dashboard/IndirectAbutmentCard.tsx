// 관리자 대시보드 — 간접어벗. 타사 스캔바디와 어벗츠 스캔바디를 한 화면에서 다룬다.
// 치과 신규의뢰의 간접 어벗(스캔바디 | 심플 힐링)과 같이 두 칸을 나란히 둔다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
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
      <DashTile
        title="간접어벗"
        icon={<Boxes className={cn("h-4 w-4", hasRows ? "text-amber-600" : "text-muted-foreground")} />}
        tone={hasRows ? "warn" : "default"}
        className={className}
        onClick={() => setOpen(true)}
      >
        <div className="flex h-full flex-col justify-end gap-0.5">
          <DashBigNumber
            value={rows.length.toLocaleString()}
            unit="종"
            className={hasRows ? "text-amber-900" : undefined}
          />
          <p className="truncate text-[11px] text-muted-foreground">
            의뢰 {transfers.toLocaleString()}건
          </p>
        </div>
      </DashTile>

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
