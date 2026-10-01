// 관리자 대시보드 — 의뢰에 쌓인 스캔바디·심플 규격 중 공용 형상이 없는 것(임플란트·치과·기공소 수와 함께).
// 치과가 의뢰를 보내면 서버가 쌓은 뒤 scanbody:demand-updated를 보내 바로 다시 센다. 새 규격이 생기면 토스트로도 알린다.
// 카드는 요약만 보이고, 클릭하면 전체 목록 모달, 「라이브러리 올리기」는 라이브러리·템플릿 관리 서브 모달을 연다.
// 관리자가 제조사에서 받아 올리면 목록에서 빠진다. 기공소에는 업로드를 요구하지 않는다.
// 시장에서 거의 안 쓰는 규격만 「기공소에 요청」으로 표시하면 그 규격을 의뢰받은 기공소 AI 디자인에 올리기 버튼이 뜬다.
// related files:
// - web/backend/services/scanbodyDemand.service.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts (fetchScanbodyDemand)
// - web/frontend/src/shared/components/practice/ScanbodyLibraryManager.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScanbodyLibraryManager } from "@/shared/components/practice/ScanbodyLibraryManager";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  fetchScanbodyDemand,
  setScanbodyDemandLabRequest,
  type ScanbodyDemandRow,
} from "@/shared/practice/scanbodyLibraryApi";
import { cn } from "@/shared/ui/cn";

const POLL_MS = 60_000;

const kstTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function specLabel(row: ScanbodyDemandRow) {
  if (row.type === "template") {
    const heights = row.height ? row.height : row.heights.join("·");
    return `${row.maker} ${row.diameter}${heights ? ` (${heights})` : ""} 템플릿`;
  }
  const size = [row.diameter, row.height].filter(Boolean).join("/");
  return `${row.maker}${size ? ` ${size}` : ""} 스캔바디 라이브러리`;
}

function implantLabel(row: ScanbodyDemandRow) {
  return row.implants
    .map((implant) => `${[implant.manufacturer, implant.brand].filter(Boolean).join(" ")} ${implant.count}`)
    .join(" · ");
}

export function ScanbodyDemandCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ScanbodyDemandRow[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchScanbodyDemand();
      const prev = known.current;
      if (prev) {
        const fresh = next.filter((row) => !prev.has(row.key));
        if (fresh.length > 0) {
          toast({
            title: "라이브러리가 없는 스캔바디 의뢰가 들어왔습니다.",
            description: fresh.slice(0, 3).map(specLabel).join(", "),
          });
        }
      }
      known.current = new Set(next.map((row) => row.key));
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

  const toggleLabRequest = async (row: ScanbodyDemandRow) => {
    const requested = !row.labUploadRequested;
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, labUploadRequested: requested } : r)));
    try {
      await setScanbodyDemandLabRequest(row.key, requested);
    } catch (error) {
      setRows((prev) => prev.map((r) => (r.key === row.key ? row : r)));
      toast({
        title: "기공소 요청을 바꾸지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

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
        onClick={() => setListOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setListOpen(true);
          }
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">라이브러리 없는 스캔바디</CardTitle>
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
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full bg-white text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              setManagerOpen(true);
            }}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            라이브러리 올리기
          </Button>
        </CardContent>
      </Card>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pr-6">
            <div>
              <DialogTitle className="text-base">
                라이브러리가 없는 스캔바디 {rows.length}종 · 의뢰 {transfers}건
              </DialogTitle>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                치과가 지정했지만 공용 형상이 없어 기공소 AI 디자인이 자동으로 맞추지 못합니다.
                <br />
                제조사 라이브러리를 받아 올리면 목록에서 빠집니다.
                <br />
                시장에서 거의 안 쓰는 것만 「기공소에 요청」을 누르면 의뢰받은 기공소가 올립니다.
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setManagerOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              라이브러리 올리기
            </Button>
          </DialogHeader>
          {hasRows ? (
            <ul className="divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-900">{specLabel(row)}</span>
                      {row.labUploadRequested ? (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                          기공소에 요청함
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      의뢰 {row.transferCount}건 · 치아 {row.teethCount}개 · 치과 {row.practiceCount}곳 · 기공소{" "}
                      {row.labCount}곳 · 최근 {row.latestAt ? kstTime.format(new Date(row.latestAt)) : "-"}
                    </div>
                    {row.implants.length > 0 ? (
                      <div className="text-[11px] text-muted-foreground">임플란트 {implantLabel(row)}</div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 bg-white px-2 text-[11px]"
                    onClick={() => void toggleLabRequest(row)}
                  >
                    {row.labUploadRequested ? "요청 거두기" : "기공소에 요청"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">라이브러리가 없는 스캔바디 의뢰가 없습니다.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={managerOpen}
        onOpenChange={(next) => {
          setManagerOpen(next);
          if (!next) void load();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">스캔바디 라이브러리 · 템플릿</DialogTitle>
          </DialogHeader>
          <ScanbodyLibraryManager />
        </DialogContent>
      </Dialog>
    </>
  );
}
