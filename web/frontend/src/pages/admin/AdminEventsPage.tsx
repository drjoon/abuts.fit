// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/App.tsx
import { useCallback, useEffect, useState } from "react";
import { AdminPageShell, AdminPanel } from "@/pages/admin/adminUi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import {
  eventsApi,
  type EventApplication,
  type MarketingEvent,
} from "@/shared/events/eventsApi";
import { cn } from "@/shared/ui/cn";
import { ExternalLink, RefreshCw } from "lucide-react";

const STATUS_LABEL: Record<EventApplication["status"], string> = {
  received: "접수",
  reviewed: "검토",
  fulfilled: "완료",
  rejected: "거절",
};

const EVENT_STATUS_LABEL: Record<MarketingEvent["status"], string> = {
  draft: "초안",
  open: "모집 중",
  closed: "마감",
};

function formatWhen(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminEventsPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applications, setApplications] = useState<EventApplication[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingApps, setLoadingApps] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await eventsApi.adminList(token);
      const items = res.items || [];
      setEvents(items);
      setSelectedId((prev) => {
        if (prev && items.some((it) => it.id === prev)) return prev;
        return items[0]?.id || null;
      });
    } catch (e) {
      toast({
        title: "이벤트 목록 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setLoadingEvents(false);
    }
  }, [token, toast]);

  const loadApplications = useCallback(
    async (eventId: string) => {
      setLoadingApps(true);
      try {
        const res = await eventsApi.adminListApplications(token, eventId, {
          q: q.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        });
        setApplications(res.items || []);
      } catch (e) {
        toast({
          title: "신청 목록 실패",
          description: e instanceof Error ? e.message : "다시 시도해 주세요.",
          variant: "destructive",
        });
      } finally {
        setLoadingApps(false);
      }
    },
    [token, toast, q, statusFilter],
  );

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedId) {
      setApplications([]);
      return;
    }
    void loadApplications(selectedId);
  }, [selectedId, loadApplications]);

  const selected = events.find((e) => e.id === selectedId) || null;

  const setEventStatus = async (status: MarketingEvent["status"]) => {
    if (!selected) return;
    try {
      const updated = await eventsApi.adminUpdate(token, selected.id, {
        status,
      });
      setEvents((prev) =>
        prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)),
      );
      toast({ title: "상태 변경됨", description: EVENT_STATUS_LABEL[status] });
    } catch (e) {
      toast({
        title: "상태 변경 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    }
  };

  const setAppStatus = async (
    appId: string,
    status: EventApplication["status"],
  ) => {
    try {
      const updated = await eventsApi.adminUpdateApplication(token, appId, {
        status,
      });
      setApplications((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a)),
      );
    } catch (e) {
      toast({
        title: "신청 상태 변경 실패",
        description: e instanceof Error ? e.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminPageShell>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <AdminPanel
          title="이벤트"
          bodyClassName="p-2 sm:p-2"
          actions={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => void loadEvents()}
              aria-label="새로고침"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <div className="space-y-1">
            {loadingEvents ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : events.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                이벤트가 없습니다.
              </p>
            ) : (
              events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedId(ev.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                    selectedId === ev.id
                      ? "bg-primary-soft text-primary-strong"
                      : "hover:bg-slate-50",
                  )}
                >
                  <div className="truncate text-sm font-medium">{ev.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{EVENT_STATUS_LABEL[ev.status]}</span>
                    <span>·</span>
                    <span>신청 {ev.applicationCount ?? 0}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </AdminPanel>

        {!selected ? (
          <AdminPanel>
            <div className="py-12 text-center text-sm text-muted-foreground">
              왼쪽에서 이벤트를 선택하세요.
            </div>
          </AdminPanel>
        ) : (
          <AdminPanel
            title={selected.title}
            description={selected.summary || undefined}
            bodyClassName="p-0 sm:p-0"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {EVENT_STATUS_LABEL[selected.status]}
                </Badge>
                <Select
                  value={selected.status}
                  onValueChange={(v) =>
                    void setEventStatus(v as MarketingEvent["status"])
                  }
                >
                  <SelectTrigger className="h-8 w-[7.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">초안</SelectItem>
                    <SelectItem value="open">모집 중</SelectItem>
                    <SelectItem value="closed">마감</SelectItem>
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <a
                    href={`/events/${encodeURIComponent(selected.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    신청 페이지
                  </a>
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="치과·재료상·전화 검색"
                className="h-8 max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedId) {
                    void loadApplications(selectedId);
                  }
                }}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[7rem]">
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="received">접수</SelectItem>
                  <SelectItem value="reviewed">검토</SelectItem>
                  <SelectItem value="fulfilled">완료</SelectItem>
                  <SelectItem value="rejected">거절</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() =>
                  selectedId && void loadApplications(selectedId)
                }
              >
                검색
              </Button>
            </div>

            <div className="overflow-x-auto">
              {loadingApps ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : applications.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  신청 내역이 없습니다.
                </p>
              ) : (
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">신청시각</th>
                      <th className="px-3 py-2 font-medium">치과 · 원장</th>
                      <th className="px-3 py-2 font-medium">재료상</th>
                      <th className="px-3 py-2 font-medium">연락처</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app) => (
                      <tr
                        key={app.id}
                        className="border-b border-slate-50 align-top"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                          {formatWhen(app.createdAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">
                            {app.practice?.name || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            원장 {app.directorName || "-"}
                          </div>
                          {app.practice?.address ? (
                            <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-slate-500">
                              {app.practice.address}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">
                            {app.dealer?.name || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            대표 {app.dealer?.representativeName || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {app.dealer?.phone || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          <div>
                            {app.applicantPhone || app.practice?.phone || "-"}
                          </div>
                          <div>{app.applicantEmail || "-"}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Select
                            value={app.status}
                            onValueChange={(v) =>
                              void setAppStatus(
                                app.id,
                                v as EventApplication["status"],
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[6.5rem]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                Object.keys(STATUS_LABEL) as Array<
                                  EventApplication["status"]
                                >
                              ).map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </AdminPanel>
        )}
      </div>
    </AdminPageShell>
  );
}
