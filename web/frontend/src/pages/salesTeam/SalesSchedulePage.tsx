// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Map,
  Route,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMITMENT_LABEL,
  salesTeamApi,
  visitAccountName,
} from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function visitStatusLabel(status: string) {
  if (status === "done") return "완료";
  if (status === "canceled") return "취소";
  if (status === "noShow") return "부재";
  return "예정";
}

export default function SalesSchedulePage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = toKstYmd(new Date()) || "";
  const [ymd, setYmd] = useState(today);
  const [showForm, setShowForm] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [time, setTime] = useState("10:00");
  const [commitment, setCommitment] = useState("confirmed");
  const [memo, setMemo] = useState("");
  const [extraName, setExtraName] = useState("");
  const [extraAddress, setExtraAddress] = useState("");
  const [includeAround, setIncludeAround] = useState(true);

  const fromYmd = ymd;
  const toYmd = ymd;

  const { data: visitsData, isLoading } = useQuery({
    queryKey: ["sales-team-visits", fromYmd, toYmd],
    enabled: Boolean(token && fromYmd),
    queryFn: () => salesTeamApi.listVisits(token, { fromYmd, toYmd }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ["sales-team-accounts-for-visit"],
    enabled: Boolean(token && showForm),
    queryFn: () => salesTeamApi.listAccounts(token),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const plannedAt = new Date(`${ymd}T${time}:00+09:00`).toISOString();
      return salesTeamApi.createVisit(token, {
        accountId,
        plannedAt,
        commitment,
        memo,
      });
    },
    onSuccess: () => {
      toast({ title: "일정이 추가되었습니다." });
      setShowForm(false);
      setMemo("");
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      salesTeamApi.updateVisit(token, id, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sales-team-visits"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-home"] });
      void qc.invalidateQueries({ queryKey: ["sales-team-stats"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const routeMut = useMutation({
    mutationFn: () =>
      salesTeamApi.optimizeRoute(token, {
        ymd,
        includeAround,
        extraName: extraName || undefined,
        extraAddress: extraAddress || undefined,
      }),
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const visits = visitsData?.items || [];
  const accounts = accountsData?.items || [];
  const route = routeMut.data;
  const doneCount = visits.filter((v) => v.status === "done").length;
  const plannedCount = visits.filter((v) => v.status === "planned").length;

  const dayLabel = useMemo(() => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][
      new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
    ];
    return `${ymd} (${weekday})`;
  }, [ymd]);

  return (
    <SalesPageShell
      title="일정 · 동선"
      subtitle={`${dayLabel} · 방문 일정을 잡고 지도 순서로 동선을 짭니다.`}
      actions={
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "닫기" : "일정 추가"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setYmd(addDaysYmd(ymd, -1))}
          aria-label="이전 날"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={ymd}
          onChange={(e) => setYmd(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => setYmd(addDaysYmd(ymd, 1))}
          aria-label="다음 날"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={ymd === today ? "default" : "secondary"}
          onClick={() => setYmd(today)}
        >
          오늘
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <SalesStatCard
          label="이날 일정"
          value={visits.length}
          icon={CalendarDays}
        />
        <SalesStatCard label="예정" value={plannedCount} hint="아직 방문 전" />
        <SalesStatCard
          label="완료"
          value={doneCount}
          tone={doneCount > 0 ? "ok" : "default"}
          icon={CheckCircle2}
        />
      </div>

      {showForm ? (
        <SalesPanel title="방문 일정 추가" description="거래처 · 시각 · 확정 수준">
          <div className="space-y-2.5">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="거래처 선택" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <Select value={commitment} onValueChange={setCommitment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">확정</SelectItem>
                  <SelectItem value="around">그쯤 잡기</SelectItem>
                  <SelectItem value="askBefore">상대에게 물어보기 전</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="방문 목적 · 준비물 메모"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
            />
            <Button
              size="sm"
              disabled={!accountId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              저장
            </Button>
          </div>
        </SalesPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <SalesPanel
          className="lg:col-span-3"
          title="이날 아젠다"
          description="현장에서 완료·부재·취소를 바로 기록합니다."
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : visits.length === 0 ? (
            <SalesEmptyState
              icon={CalendarDays}
              title="이 날 일정이 없습니다"
              description="거래처 방문을 추가하면 타임라인과 동선 계산에 포함됩니다."
              actionLabel="일정 추가"
              onAction={() => setShowForm(true)}
            />
          ) : (
            <ol className="relative space-y-0 border-l border-slate-200 pl-5">
              {visits.map((v) => (
                <li key={v._id} className="relative pb-4 last:pb-0">
                  <span className="absolute -left-[1.35rem] top-2 h-3 w-3 rounded-full bg-primary ring-4 ring-white" />
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {visitAccountName(v)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(v.plannedAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Seoul",
                          })}{" "}
                          · {COMMITMENT_LABEL[v.commitment] || v.commitment}
                        </div>
                        {v.memo ? (
                          <p className="mt-1 text-xs text-slate-600">{v.memo}</p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          v.status === "done"
                            ? "default"
                            : v.status === "canceled"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {visitStatusLabel(v.status)}
                      </Badge>
                    </div>
                    {v.status === "planned" ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          onClick={() =>
                            statusMut.mutate({ id: v._id, status: "done" })
                          }
                        >
                          완료
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMut.mutate({ id: v._id, status: "noShow" })
                          }
                        >
                          부재
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            statusMut.mutate({ id: v._id, status: "canceled" })
                          }
                        >
                          취소
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SalesPanel>

        <SalesPanel
          className="lg:col-span-2"
          title="동선 짜기"
          description="확정·그룹 일정을 지도 순서로 정렬합니다."
          actions={
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Route className="h-4 w-4" />
            </span>
          }
        >
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={includeAround}
                onChange={(e) => setIncludeAround(e.target.checked)}
              />
              「그쯤」일정도 포함
            </label>
            <Input
              placeholder="추가 치과/기공소명 (선택)"
              value={extraName}
              onChange={(e) => setExtraName(e.target.value)}
            />
            <Input
              placeholder="추가 주소 (없으면 이름으로 검색)"
              value={extraAddress}
              onChange={(e) => setExtraAddress(e.target.value)}
            />
            <Button
              size="sm"
              className="w-full"
              disabled={routeMut.isPending}
              onClick={() => routeMut.mutate()}
            >
              {routeMut.isPending ? "계산 중…" : "최적 동선 보기"}
            </Button>

            {route ? (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 rounded-xl bg-primary-soft/50 px-3 py-2 text-sm">
                  <Map className="h-4 w-4 text-primary-strong" />
                  <span>
                    예상 이동{" "}
                    <strong className="tabular-nums">{route.totalKm} km</strong>
                    {route.missingCoordsCount > 0
                      ? ` · 좌표 없음 ${route.missingCoordsCount}곳`
                      : ""}
                  </span>
                </div>
                {!route.geocodeConfigured ? (
                  <p className="text-xs text-muted-foreground">
                    서버에 KAKAO_REST_API_KEY가 없으면 주소 자동 좌표 변환이
                    제한됩니다.
                  </p>
                ) : null}
                <ol className="space-y-2">
                  {route.ordered.map((stop, idx) => (
                    <li
                      key={`${stop.name}-${idx}`}
                      className="flex gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 text-sm"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                        {idx + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{stop.name}</span>
                        {stop.isExtra ? (
                          <Badge className="ml-1" variant="outline">
                            추가
                          </Badge>
                        ) : null}
                        {stop.address ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {stop.address}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
                {route.mapUrl ? (
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <a href={route.mapUrl} target="_blank" rel="noreferrer">
                      카카오맵에서 열기
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                확정 일정이 있으면 최적 순서를 계산합니다. 이름만으로 추가
                방문지도 넣을 수 있습니다.
              </p>
            )}
          </div>
        </SalesPanel>
      </div>
    </SalesPageShell>
  );
}
