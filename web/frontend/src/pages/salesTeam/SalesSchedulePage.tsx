// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { toKstYmd } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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

  const dayLabel = useMemo(() => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][
      new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
    ];
    return `${ymd} (${weekday})`;
  }, [ymd]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">일정 · 동선</h1>
          <p className="text-sm text-muted-foreground">{dayLabel}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "닫기" : "일정 추가"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setYmd(addDaysYmd(ymd, -1))}
        >
          이전
        </Button>
        <Input
          type="date"
          value={ymd}
          onChange={(e) => setYmd(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setYmd(addDaysYmd(ymd, 1))}
        >
          다음
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setYmd(today)}>
          오늘
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-base">방문 일정 추가</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
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
            <Textarea
              placeholder="메모"
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
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-base">이날 일정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">일정이 없습니다.</p>
          ) : (
            visits.map((v) => (
              <div
                key={v._id}
                className="space-y-2 rounded-md border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {visitAccountName(v)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.plannedAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Seoul",
                      })}{" "}
                      · {COMMITMENT_LABEL[v.commitment] || v.commitment}
                    </div>
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
                    {v.status === "done"
                      ? "완료"
                      : v.status === "canceled"
                        ? "취소"
                        : v.status === "noShow"
                          ? "부재"
                          : "예정"}
                  </Badge>
                </div>
                {v.status === "planned" ? (
                  <div className="flex flex-wrap gap-1">
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
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3">
          <CardTitle className="text-base">동선 짜기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0">
          <p className="text-xs text-muted-foreground">
            확정{includeAround ? "·그쯤" : ""} 일정을 지도 순서로 정렬합니다.
            추가 방문지를 이름만 넣어도 됩니다.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
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
            placeholder="추가 주소 (선택, 없으면 이름으로 검색)"
            value={extraAddress}
            onChange={(e) => setExtraAddress(e.target.value)}
          />
          <Button
            size="sm"
            disabled={routeMut.isPending}
            onClick={() => routeMut.mutate()}
          >
            {routeMut.isPending ? "계산 중…" : "최적 동선 보기"}
          </Button>

          {route ? (
            <div className="space-y-2 pt-2">
              <div className="text-sm">
                예상 이동 {route.totalKm} km
                {route.missingCoordsCount > 0
                  ? ` · 좌표 없음 ${route.missingCoordsCount}곳`
                  : ""}
                {!route.geocodeConfigured ? (
                  <span className="block text-xs text-muted-foreground">
                    서버에 KAKAO_REST_API_KEY가 없으면 주소 자동 좌표 변환이
                    제한됩니다. 거래처에 위도·경도를 저장하거나 주소를
                    정확히 입력하세요.
                  </span>
                ) : null}
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {route.ordered.map((stop, idx) => (
                  <li key={`${stop.name}-${idx}`}>
                    <span className="font-medium">{stop.name}</span>
                    {stop.address ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {stop.address}
                      </span>
                    ) : null}
                    {stop.isExtra ? (
                      <Badge className="ml-1" variant="outline">
                        추가
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ol>
              {route.mapUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={route.mapUrl} target="_blank" rel="noreferrer">
                    카카오맵에서 열기
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
