// related files:
// - web/frontend/src/features/remoteSupport/RemoteSupportProvider.tsx
// - web/frontend/src/features/remoteSupport/openRemoteSupportViewer.ts
// - web/backend/modules/remoteSupport/remoteSupport.routes.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ExternalLink,
  Headphones,
  Monitor,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { toKstYmd } from "@/shared/date/kst";
import {
  remoteSupportApi,
  sessionUserId,
  sessionUserName,
  type RemoteSupportSession,
  type RemoteSupportStats,
} from "@/features/remoteSupport/remoteSupportApi";
import { RemoteSupportChat } from "@/features/remoteSupport/RemoteSupportChat";
import { useRemoteSupportPeer } from "@/features/remoteSupport/useRemoteSupportPeer";
import {
  openRemoteSupportViewer,
  type RemoteSupportViewerHandle,
} from "@/features/remoteSupport/openRemoteSupportViewer";
import { normalizeVideoPointer } from "@/features/remoteSupport/videoContentRect";
import type { RemoteControlEvent } from "@/features/remoteSupport/replayRemoteInput";

function formatDuration(ms: number | null | undefined) {
  const n = Number(ms) || 0;
  const sec = Math.floor(n / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function formatKst(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "대기";
    case "accepted":
      return "수락됨";
    case "active":
      return "진행 중";
    case "ended":
      return "종료";
    case "cancelled":
      return "취소";
    case "declined":
      return "거절";
    default:
      return status;
  }
}

export default function AdminRemoteSupportPage({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = usePeriodStore((s) => s.period);
  const customStartDate = usePeriodStore((s) => s.customStartDate);
  const customEndDate = usePeriodStore((s) => s.customEndDate);

  const [tab, setTab] = useState(() => {
    const raw = searchParams.get("tab");
    if (raw === "room" || raw === "queue") return raw;
    return "queue";
  });
  const deepLinkHandledRef = useRef<string | null>(null);
  const [queue, setQueue] = useState<RemoteSupportSession[]>([]);
  const [history, setHistory] = useState<RemoteSupportSession[]>([]);
  const [stats, setStats] = useState<RemoteSupportStats | null>(null);
  const [historyQ, setHistoryQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [active, setActive] = useState<RemoteSupportSession | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewerRef = useRef<RemoteSupportViewerHandle | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const [inviteQ, setInviteQ] = useState("");
  const [inviteHits, setInviteHits] = useState<
    Array<{ _id: string; name?: string; email?: string; role?: string }>
  >([]);
  const [inviting, setInviting] = useState(false);

  const [editSession, setEditSession] = useState<RemoteSupportSession | null>(
    null,
  );
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [endOpen, setEndOpen] = useState(false);
  const [endNotes, setEndNotes] = useState("");
  const [endTags, setEndTags] = useState("");
  const [ending, setEnding] = useState(false);

  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);

  const periodRange = useMemo(
    () => periodToRange(period, { customStartDate, customEndDate }),
    [customEndDate, customStartDate, period],
  );

  const { sendControl, connectionState, cleanup } = useRemoteSupportPeer({
    sessionId: active?._id || null,
    role: active ? "admin" : null,
    iceServers,
    enabled: Boolean(active && ["accepted", "active"].includes(active.status)),
    onRemoteStream: setRemoteStream,
  });

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    viewerRef.current?.setStream(remoteStream);
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      viewerRef.current?.close();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active && ["accepted", "active"].includes(active.status)) return;
    viewerRef.current?.close();
    viewerRef.current = null;
    setViewerOpen(false);
  }, [active]);

  useEffect(() => {
    if (!token) return;
    void remoteSupportApi
      .iceConfig(token)
      .then((cfg) => {
        if (cfg?.iceServers?.length) setIceServers(cfg.iceServers);
      })
      .catch(() => undefined);
  }, [token]);

  const loadQueue = useCallback(async () => {
    if (!token) return;
    const rows = await remoteSupportApi.list(token, { status: "queue", limit: 100 });
    setQueue(rows);
  }, [token]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    const from = periodRange?.startDate
      ? new Date(periodRange.startDate).toISOString()
      : undefined;
    const to = periodRange?.endDate
      ? new Date(periodRange.endDate).toISOString()
      : undefined;
    const rows = await remoteSupportApi.list(token, {
      status: "history",
      q: historyQ || undefined,
      from,
      to,
      limit: 100,
    });
    setHistory(rows);
  }, [historyQ, periodRange, token]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    const from = periodRange?.startDate
      ? new Date(periodRange.startDate).toISOString()
      : undefined;
    const to = periodRange?.endDate
      ? new Date(periodRange.endDate).toISOString()
      : undefined;
    const data = await remoteSupportApi.stats(token, { from, to });
    setStats(data);
  }, [periodRange, token]);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadQueue(), loadHistory(), loadStats()]);
    } catch (err) {
      toast({
        title: "불러오기 실패",
        description:
          err instanceof Error ? err.message : "목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [loadHistory, loadQueue, loadStats, toast]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  // 전역 토스트「지원 들어가기」등 deep-link: sessionId + tab=room
  useEffect(() => {
    const sessionId = String(searchParams.get("sessionId") || "").trim();
    const wantTab = String(searchParams.get("tab") || "").trim();
    if (!sessionId || !token) return;
    if (deepLinkHandledRef.current === sessionId) return;
    deepLinkHandledRef.current = sessionId;

    let cancelled = false;
    void (async () => {
      try {
        const session = await remoteSupportApi.get(token, sessionId);
        if (cancelled) return;
        setActive(session);
        setTab(wantTab === "queue" ? "queue" : "room");
        void loadQueue();
      } catch (err) {
        if (cancelled) return;
        toast({
          title: "세션 열기 실패",
          description:
            err instanceof Error ? err.message : "세션을 불러오지 못했습니다.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("sessionId");
              if (next.get("tab") === "room" || next.get("tab") === "queue") {
                next.delete("tab");
              }
              return next;
            },
            { replace: true },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadQueue, searchParams, setSearchParams, toast, token]);

  useAppEventListener({
    enabled: true,
    eventTypes: [
      "remote-support:requested",
      "remote-support:updated",
      "remote-support:accepted",
      "remote-support:ended",
      "remote-support:declined",
      "remote-support:started",
    ],
    onMatch: (evt) => {
      const session = (evt.data as { session?: RemoteSupportSession } | null)
        ?.session;
      void loadQueue();
      if (
        session &&
        active &&
        String(session._id) === String(active._id)
      ) {
        if (["ended", "cancelled", "declined"].includes(session.status)) {
          setActive(null);
          cleanup();
          setRemoteStream(null);
          void loadHistory();
          void loadStats();
        } else {
          setActive(session);
        }
      }
      if (
        ["remote-support:ended", "remote-support:declined"].includes(
          String(evt.type),
        )
      ) {
        void loadHistory();
        void loadStats();
      }
    },
  });

  const acceptRequest = async (session: RemoteSupportSession) => {
    if (!token) return;
    try {
      const updated = await remoteSupportApi.accept(token, session._id);
      setActive(updated);
      setTab("room");
      void loadQueue();
      toast({ title: "세션 수락", description: "직원이 화면을 공유하면 표시됩니다." });
    } catch (err) {
      toast({
        title: "수락 실패",
        description: err instanceof Error ? err.message : "수락에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const searchInvite = async () => {
    if (!token || inviteQ.trim().length < 1) return;
    try {
      const hits = await remoteSupportApi.searchUsers(token, inviteQ.trim());
      setInviteHits(hits);
    } catch (err) {
      toast({
        title: "검색 실패",
        description: err instanceof Error ? err.message : "검색에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const inviteUser = async (userId: string) => {
    if (!token || inviting) return;
    setInviting(true);
    try {
      const session = await remoteSupportApi.invite(token, userId);
      setActive(session);
      setTab("room");
      setInviteHits([]);
      setInviteQ("");
      void loadQueue();
      toast({
        title: "초대 전송",
        description: "직원이 수락하면 세션이 시작됩니다.",
      });
    } catch (err) {
      toast({
        title: "초대 실패",
        description: err instanceof Error ? err.message : "초대에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const openEnd = () => setEndOpen(true);

  const confirmEnd = async (withNotes: boolean) => {
    if (!token || !active || ending) return;
    setEnding(true);
    try {
      await remoteSupportApi.end(
        token,
        active._id,
        withNotes
          ? {
              notes: endNotes.trim(),
              ideaTags: endTags
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
            }
          : undefined,
      );
      cleanup();
      setActive(null);
      setRemoteStream(null);
      setEndOpen(false);
      setEndNotes("");
      setEndTags("");
      void reloadAll();
    } catch (err) {
      toast({
        title: "종료 실패",
        description: err instanceof Error ? err.message : "종료에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setEnding(false);
    }
  };

  const saveEditNotes = async () => {
    if (!token || !editSession || savingNotes) return;
    setSavingNotes(true);
    try {
      await remoteSupportApi.updateNotes(token, editSession._id, {
        notes: editNotes.trim(),
        ideaTags: editTags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setEditSession(null);
      void loadHistory();
      void loadStats();
      toast({ title: "기록 저장됨" });
    } catch (err) {
      toast({
        title: "저장 실패",
        description: err instanceof Error ? err.message : "저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const onVideoPointer = (
    e: React.MouseEvent<HTMLVideoElement>,
    kind: RemoteControlEvent extends { t: "pointer" }
      ? "move" | "down" | "up" | "click"
      : never,
  ) => {
    const el = videoRef.current;
    if (!el) return;
    const norm = normalizeVideoPointer(el, e.clientX, e.clientY);
    if (!norm) return;
    sendControl({
      t: "pointer",
      kind,
      x: norm.x,
      y: norm.y,
      button: e.button,
    });
  };

  const onVideoKey = (
    e: React.KeyboardEvent<HTMLDivElement>,
    kind: "down" | "up",
  ) => {
    e.preventDefault();
    sendControl({
      t: "key",
      kind,
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  };

  const openViewerWindow = useCallback(() => {
    if (!active) return;
    if (viewerRef.current?.isOpen()) {
      viewerRef.current.focus();
      setViewerOpen(true);
      return;
    }
    const name =
      active.requesterSnapshot?.name ||
      sessionUserName(active.requesterId, "직원");
    const handle = openRemoteSupportViewer({
      title: `${name} · 원격 지원`,
      subtitle: connectionState,
      onControl: (evt) => {
        sendControl(evt);
      },
      onClose: () => {
        viewerRef.current = null;
        setViewerOpen(false);
      },
    });
    if (!handle) {
      toast({
        title: "팝업이 차단되었습니다",
        description: "브라우저에서 이 사이트의 팝업을 허용해 주세요.",
        variant: "destructive",
      });
      return;
    }
    viewerRef.current = handle;
    handle.setStream(remoteStream);
    setViewerOpen(true);
  }, [active, connectionState, remoteStream, sendControl, toast]);

  const closeViewerWindow = useCallback(() => {
    viewerRef.current?.close();
    viewerRef.current = null;
    setViewerOpen(false);
  }, []);

  return (
    <div
      className={
        embedded
          ? "mx-auto flex w-full max-w-6xl flex-col gap-4 px-0 pt-2"
          : "mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 lg:p-6"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <div className="text-sm text-muted-foreground">
            직원 화면을 보고 커서·키보드를 대신 조작합니다.
          </div>
        ) : (
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Headphones className="h-5 w-5" />
              원격 지원
            </h1>
            <p className="text-sm text-muted-foreground">
              직원 화면을 보고 커서·키보드를 대신 조작합니다. (플랫폼 화면만)
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            value={period}
            onChange={(v) => usePeriodStore.getState().setPeriod(v)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void reloadAll()}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            새로고침
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">대기열</TabsTrigger>
          <TabsTrigger value="room">지원실</TabsTrigger>
          <TabsTrigger value="history">기록</TabsTrigger>
          <TabsTrigger value="stats">통계</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-6">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-medium">사용자 초대</h2>
            <div className="flex gap-2">
              <Input
                value={inviteQ}
                onChange={(e) => setInviteQ(e.target.value)}
                placeholder="이름 또는 이메일"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchInvite();
                }}
              />
              <Button type="button" variant="outline" onClick={() => void searchInvite()}>
                <Search className="mr-1 h-4 w-4" />
                검색
              </Button>
            </div>
            {inviteHits.length > 0 ? (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {inviteHits.map((u) => (
                  <li
                    key={u._id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email} · {u.role}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={inviting}
                      onClick={() => void inviteUser(u._id)}
                    >
                      초대
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded-md border border-border">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              진행·대기 세션
            </div>
            {queue.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                대기 중인 요청이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((s) => (
                  <li
                    key={s._id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {s.requesterSnapshot?.name ||
                            sessionUserName(s.requesterId, "직원")}
                        </span>
                        <Badge variant="secondary">{statusLabel(s.status)}</Badge>
                        <Badge variant="outline">
                          {s.initiatedBy === "staff" ? "직원 요청" : "관리자 초대"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.requesterSnapshot?.businessName || "—"} ·{" "}
                        {formatKst(s.requestedAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {s.status === "pending" && s.initiatedBy === "staff" ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void acceptRequest(s)}
                        >
                          수락
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActive(s);
                          setTab("room");
                        }}
                      >
                        지원실
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="room" className="space-y-4">
          {!active ? (
            <p className="text-sm text-muted-foreground">
              대기열에서 세션을 수락하거나 초대한 뒤 지원실로 들어오세요.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {active.requesterSnapshot?.name ||
                      sessionUserName(active.requesterId, "직원")}
                    <Badge className="ml-2" variant="secondary">
                      {statusLabel(active.status)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    연결: {connectionState} · 시작{" "}
                    {formatKst(active.startedAt || active.acceptedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {viewerOpen ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => viewerRef.current?.focus()}
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        화면 창 포커스
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={closeViewerWindow}
                      >
                        이 페이지에서 보기
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!remoteStream}
                      onClick={openViewerWindow}
                      title="듀얼 모니터용: 직원 화면을 별도 창으로 엽니다"
                    >
                      <ExternalLink className="mr-1 h-4 w-4" />
                      다른 모니터에서 보기
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={openEnd}
                  >
                    지원 종료
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div
                  className="relative overflow-hidden rounded-md border border-border bg-black outline-none"
                  tabIndex={viewerOpen ? -1 : 0}
                  onKeyDown={
                    viewerOpen ? undefined : (e) => onVideoKey(e, "down")
                  }
                  onKeyUp={viewerOpen ? undefined : (e) => onVideoKey(e, "up")}
                >
                  {viewerOpen ? (
                    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                      <ExternalLink className="h-8 w-8" />
                      <div className="text-center">
                        <div className="font-medium text-foreground">
                          별도 창에서 표시 중
                        </div>
                        <p className="mt-1 max-w-sm text-xs">
                          다른 모니터로 창을 옮긴 뒤 그 창에서 클릭·키보드로
                          조작하세요. 이 페이지는 채팅·종료용으로 두시면
                          됩니다.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => viewerRef.current?.focus()}
                        >
                          화면 창 포커스
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={closeViewerWindow}
                        >
                          이 페이지에서 보기
                        </Button>
                      </div>
                    </div>
                  ) : remoteStream ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="aspect-video w-full cursor-crosshair object-contain"
                      onMouseMove={(e) => onVideoPointer(e, "move")}
                      onMouseDown={(e) => onVideoPointer(e, "down")}
                      onMouseUp={(e) => onVideoPointer(e, "up")}
                      onClick={(e) => onVideoPointer(e, "click")}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  ) : (
                    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Monitor className="h-8 w-8" />
                      직원 화면 대기 중…
                      <span className="text-xs">
                        직원이 화면 공유를 허용하면 여기에 표시됩니다.
                      </span>
                    </div>
                  )}
                </div>
                <RemoteSupportChat
                  sessionId={active._id}
                  initialMessages={active.messages || []}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={historyQ}
              onChange={(e) => setHistoryQ(e.target.value)}
              placeholder="이름·사업자·기록·태그 검색"
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadHistory();
              }}
            />
            <Button type="button" variant="outline" onClick={() => void loadHistory()}>
              검색
            </Button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {history.map((s) => (
                <li key={s._id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">
                        {s.requesterSnapshot?.name ||
                          sessionUserName(s.requesterId, "직원")}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ↔ {sessionUserName(s.adminId, "관리자")}
                      </span>
                      <Badge className="ml-2" variant="outline">
                        {statusLabel(s.status)}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditSession(s);
                        setEditNotes(s.notes || "");
                        setEditTags((s.ideaTags || []).join(", "));
                      }}
                    >
                      기록 편집
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatKst(s.requestedAt)} → {formatKst(s.endedAt)} ·{" "}
                    {formatDuration(s.durationMs)}
                    {periodRange ? ` · 기간 ${toKstYmd(periodRange.startDate)}` : ""}
                  </div>
                  {s.notes ? (
                    <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">기록 없음</p>
                  )}
                  {(s.ideaTags || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {s.ideaTags!.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          {!stats ? (
            <p className="text-sm text-muted-foreground">통계를 불러오는 중…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-4">
                  <div className="text-xs text-muted-foreground">종료 세션</div>
                  <div className="text-2xl font-semibold">
                    {stats.totals.count}
                  </div>
                </div>
                <div className="rounded-md border border-border p-4">
                  <div className="text-xs text-muted-foreground">총 지원 시간</div>
                  <div className="text-2xl font-semibold">
                    {formatDuration(stats.totals.totalDurationMs)}
                  </div>
                </div>
                <div className="rounded-md border border-border p-4">
                  <div className="text-xs text-muted-foreground">평균 시간</div>
                  <div className="text-2xl font-semibold">
                    {formatDuration(stats.totals.avgDurationMs)}
                  </div>
                </div>
              </div>

              <section className="rounded-md border border-border">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">
                  관리자별 실적
                </div>
                {stats.byAdmin.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">데이터 없음</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {stats.byAdmin.map((row) => (
                      <li
                        key={String(row.adminId)}
                        className="flex items-center justify-between px-4 py-2 text-sm"
                      >
                        <span>{row.adminName || sessionUserId(row.adminId)}</span>
                        <span className="text-muted-foreground">
                          {row.count}건 · {formatDuration(row.totalDurationMs)} ·
                          평균 {formatDuration(row.avgDurationMs)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-md border border-border">
                <div className="border-b border-border px-4 py-3 text-sm font-medium">
                  아이디어 태그
                </div>
                {stats.ideaTags.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">태그 없음</p>
                ) : (
                  <ul className="flex flex-wrap gap-2 p-4">
                    {stats.ideaTags.map((t) => (
                      <Badge key={t.tag} variant="secondary">
                        {t.tag} ({t.count})
                      </Badge>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지원 종료 · 기록</DialogTitle>
            <DialogDescription>
              일시·참여자는 자동 기입됩니다. 지원 내용과 아이디어 태그를 남겨
              주세요.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={endNotes}
            onChange={(e) => setEndNotes(e.target.value)}
            placeholder="지원 내용"
            rows={5}
          />
          <Input
            value={endTags}
            onChange={(e) => setEndTags(e.target.value)}
            placeholder="아이디어 태그 (쉼표 구분)"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ending}
              onClick={() => void confirmEnd(false)}
            >
              기록 없이 종료
            </Button>
            <Button
              type="button"
              disabled={ending}
              onClick={() => void confirmEnd(true)}
            >
              저장 후 종료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editSession)}
        onOpenChange={(open) => {
          if (!open) setEditSession(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기록 편집</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={5}
          />
          <Input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="아이디어 태그 (쉼표 구분)"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditSession(null)}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={savingNotes}
              onClick={() => void saveEditNotes()}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
