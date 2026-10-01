// 관리자 대시보드 — 의뢰에 쌓인 스캔바디·심플 규격 중 공용 형상이 없는 것(임플란트·치과·기공소 수와 함께).
// 치과가 의뢰를 보내면 서버가 쌓은 뒤 scanbody:demand-updated를 보내 바로 다시 센다. 새 규격이 생기면 토스트로도 알린다.
// 관리자가 제조사에서 받아 올리면(설정 → 스캔바디) 목록에서 빠진다. 기공소에는 업로드를 요구하지 않는다.
// 시장에서 거의 안 쓰는 규격만 「기공소에 요청」으로 표시하면 그 규격을 의뢰받은 기공소 AI 디자인에 올리기 버튼이 뜬다.
// related files:
// - web/backend/services/scanbodyDemand.service.js
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts (fetchScanbodyDemand)
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  fetchScanbodyDemand,
  setScanbodyDemandLabRequest,
  type ScanbodyDemandRow,
} from "@/shared/practice/scanbodyLibraryApi";

const POLL_MS = 60_000;
const COLLAPSED = 5;
const SETTINGS_PATH = "/dashboard/admin-settings?tab=scanbody";

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

export function ScanbodyDemandCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<ScanbodyDemandRow[]>([]);
  const [expanded, setExpanded] = useState(false);
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

  if (rows.length === 0) return null;
  const shown = expanded ? rows : rows.slice(0, COLLAPSED);
  const transfers = rows.reduce((sum, row) => sum + row.transferCount, 0);

  return (
    <Card className="border-amber-400 bg-amber-50/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <CardTitle className="text-sm font-semibold text-amber-900">
              라이브러리가 없는 스캔바디 {rows.length}종 · 의뢰 {transfers}건
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
              치과가 지정했지만 공용 형상이 없어 기공소 AI 디자인이 자동으로 맞추지 못합니다.
              <br />
              제조사 라이브러리를 받아 올리면 목록에서 빠집니다.
              <br />
              시장에서 거의 안 쓰는 것만 「기공소에 요청」을 누르면 의뢰받은 기공소가 올립니다.
            </p>
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate(SETTINGS_PATH)}>
          <Upload className="mr-1.5 h-4 w-4" />
          라이브러리 올리기
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        <ul className="divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
          {shown.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-xs">
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
                  의뢰 {row.transferCount}건 · 치아 {row.teethCount}개 · 치과 {row.practiceCount}곳 · 기공소 {row.labCount}곳 · 최근{" "}
                  {row.latestAt ? kstTime.format(new Date(row.latestAt)) : "-"}
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
        {rows.length > COLLAPSED ? (
          <button
            type="button"
            className="text-[11px] font-medium text-amber-800 underline-offset-2 hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "접기" : `${rows.length - COLLAPSED}종 더 보기`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
