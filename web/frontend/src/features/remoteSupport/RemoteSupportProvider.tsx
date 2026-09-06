// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/remoteSupport/useRemoteSupportPeer.ts
// - web/frontend/src/features/remoteSupport/remoteSupportApi.ts
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Headphones, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useAuthStore } from "@/store/useAuthStore";
import {
  remoteSupportApi,
  sessionUserId,
  type RemoteSupportSession,
} from "@/features/remoteSupport/remoteSupportApi";
import { RemoteSupportChat } from "@/features/remoteSupport/RemoteSupportChat";
import { useRemoteSupportPeer } from "@/features/remoteSupport/useRemoteSupportPeer";

const STAFF_ROLES = new Set([
  "practice",
  "requestor",
  "internalLab",
  "labTeam",
]);

type Ctx = {
  isStaff: boolean;
  isAdmin: boolean;
  activeSession: RemoteSupportSession | null;
  requestHelp: () => Promise<void>;
  requesting: boolean;
};

const RemoteSupportContext = createContext<Ctx | null>(null);

export function useRemoteSupport() {
  const ctx = useContext(RemoteSupportContext);
  if (!ctx) {
    throw new Error("useRemoteSupport must be used within RemoteSupportProvider");
  }
  return ctx;
}

export function useRemoteSupportOptional() {
  return useContext(RemoteSupportContext);
}

type Props = { children: ReactNode };

export function RemoteSupportProvider({ children }: Props) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();

  const role = String(user?.role || "");
  const isStaff = STAFF_ROLES.has(role);
  const isAdmin = role === "admin";
  const myId = String(user?.id || (user as { _id?: string } | null)?._id || "");

  const [activeSession, setActiveSession] = useState<RemoteSupportSession | null>(
    null,
  );
  const [inviteSession, setInviteSession] = useState<RemoteSupportSession | null>(
    null,
  );
  const [requesting, setRequesting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showEndNotes, setShowEndNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [ideaTagsText, setIdeaTagsText] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);
  const shareStartedForRef = useRef<string | null>(null);

  // Admin WebRTC peer lives only on AdminRemoteSupportPage (video + control).
  // Enabling an admin peer here too steals the staff offer/answer, leaving the
  // support room stuck on "connecting" with a black screen.
  const peerRole: "staff" | null =
    activeSession &&
    isStaff &&
    ["accepted", "active"].includes(activeSession.status)
      ? "staff"
      : null;

  const {
    startStaffShare,
    sharing,
    connectionState,
    error: peerError,
    cleanup: cleanupPeer,
  } = useRemoteSupportPeer({
    sessionId: activeSession?._id || null,
    role: peerRole,
    iceServers,
    enabled: Boolean(peerRole && activeSession),
  });

  const refreshMine = useCallback(async () => {
    if (!token || (!isStaff && !isAdmin)) return;
    try {
      const mine = await remoteSupportApi.mine(token);
      const mineForMe = mine.find((s) => {
        if (isStaff) return sessionUserId(s.requesterId) === myId;
        if (isAdmin) return sessionUserId(s.adminId) === myId || s.status === "pending";
        return false;
      });
      if (mineForMe) {
        setActiveSession(mineForMe);
        if (
          isStaff &&
          mineForMe.initiatedBy === "admin" &&
          mineForMe.status === "pending"
        ) {
          setInviteSession(mineForMe);
        }
      }
    } catch {
      // ignore
    }
  }, [isAdmin, isStaff, myId, token]);

  useEffect(() => {
    void refreshMine();
  }, [refreshMine]);

  useEffect(() => {
    if (!token || (!isStaff && !isAdmin)) return;
    void remoteSupportApi
      .iceConfig(token)
      .then((cfg) => {
        if (cfg?.iceServers?.length) setIceServers(cfg.iceServers);
      })
      .catch(() => undefined);
  }, [isAdmin, isStaff, token]);

  useAppEventListener({
    enabled: isStaff || isAdmin,
    eventTypes: [
      "remote-support:requested",
      "remote-support:invited",
      "remote-support:accepted",
      "remote-support:declined",
      "remote-support:started",
      "remote-support:ended",
      "remote-support:updated",
    ],
    onMatch: (evt) => {
      const data = (evt.data || {}) as {
        sessionId?: string;
        session?: RemoteSupportSession;
      };
      const session = data.session;
      if (!session) {
        if (evt.type === "remote-support:ended") {
          setActiveSession(null);
          setInviteSession(null);
          cleanupPeer();
        }
        return;
      }

      if (evt.type === "remote-support:invited" && isStaff) {
        if (sessionUserId(session.requesterId) === myId) {
          setInviteSession(session);
          setActiveSession(session);
          toast({
            title: "원격 지원 초대",
            description: "관리자가 원격 지원을 요청했습니다.",
          });
        }
        return;
      }

      if (
        ["remote-support:accepted", "remote-support:started"].includes(evt.type)
      ) {
        const forMe =
          sessionUserId(session.requesterId) === myId ||
          sessionUserId(session.adminId) === myId;
        if (forMe) {
          setActiveSession(session);
          setInviteSession(null);
        }
        return;
      }

      if (
        ["remote-support:ended", "remote-support:declined"].includes(evt.type)
      ) {
        const forMe =
          sessionUserId(session.requesterId) === myId ||
          sessionUserId(session.adminId) === myId;
        if (forMe) {
          setActiveSession(null);
          setInviteSession(null);
          shareStartedForRef.current = null;
          cleanupPeer();
        }
      }
    },
  });

  // Staff: after accepted, start screen share + mark active (once per session)
  useEffect(() => {
    if (!isStaff || !activeSession || !token) return;
    if (activeSession.status !== "accepted") return;
    if (shareStartedForRef.current === activeSession._id) return;
    shareStartedForRef.current = activeSession._id;
    let cancelled = false;
    (async () => {
      try {
        await startStaffShare();
        if (cancelled) return;
        const started = await remoteSupportApi.start(token, activeSession._id);
        if (!cancelled) setActiveSession(started);
      } catch (err) {
        shareStartedForRef.current = null;
        if (cancelled) return;
        toast({
          title: "화면 공유 실패",
          description:
            err instanceof Error
              ? err.message
              : "이 사이트 탭(또는 창)만 공유해 주세요. 전체 화면은 사용할 수 없습니다.",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSession, isStaff, startStaffShare, toast, token]);

  const requestHelp = useCallback(async () => {
    if (!token || !isStaff || requesting) return;
    setRequesting(true);
    try {
      const session = await remoteSupportApi.createSession(token);
      setActiveSession(session);
      toast({
        title: "원격 지원 요청됨",
        description: "관리자가 수락하면 화면 공유가 시작됩니다.",
      });
    } catch (err) {
      toast({
        title: "요청 실패",
        description:
          err instanceof Error ? err.message : "원격 지원 요청에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  }, [isStaff, requesting, toast, token]);

  const acceptInvite = useCallback(async () => {
    if (!token || !inviteSession) return;
    try {
      const session = await remoteSupportApi.accept(token, inviteSession._id);
      setInviteSession(null);
      setActiveSession(session);
    } catch (err) {
      toast({
        title: "수락 실패",
        description: err instanceof Error ? err.message : "수락에 실패했습니다.",
        variant: "destructive",
      });
    }
  }, [inviteSession, toast, token]);

  const declineInvite = useCallback(async () => {
    if (!token || !inviteSession) return;
    try {
      await remoteSupportApi.decline(token, inviteSession._id);
      setInviteSession(null);
      setActiveSession(null);
    } catch (err) {
      toast({
        title: "거절 실패",
        description: err instanceof Error ? err.message : "거절에 실패했습니다.",
        variant: "destructive",
      });
    }
  }, [inviteSession, toast, token]);

  const doEnd = useCallback(
    async (withNotes: boolean) => {
      if (!token || !activeSession || ending) return;
      setEnding(true);
      try {
        const body =
          withNotes && isAdmin
            ? {
                notes: notes.trim(),
                ideaTags: ideaTagsText
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              }
            : undefined;
        await remoteSupportApi.end(token, activeSession._id, body);
        cleanupPeer();
        setActiveSession(null);
        shareStartedForRef.current = null;
        setShowEndNotes(false);
        setNotes("");
        setIdeaTagsText("");
      } catch (err) {
        toast({
          title: "종료 실패",
          description:
            err instanceof Error ? err.message : "세션 종료에 실패했습니다.",
          variant: "destructive",
        });
      } finally {
        setEnding(false);
      }
    },
    [
      activeSession,
      cleanupPeer,
      ending,
      ideaTagsText,
      isAdmin,
      notes,
      toast,
      token,
    ],
  );

  const handleEndClick = useCallback(() => {
    if (isAdmin && activeSession && ["accepted", "active"].includes(activeSession.status)) {
      setShowEndNotes(true);
      return;
    }
    void doEnd(false);
  }, [activeSession, doEnd, isAdmin]);

  const ctxValue = useMemo<Ctx>(
    () => ({
      isStaff,
      isAdmin,
      activeSession,
      requestHelp,
      requesting,
    }),
    [activeSession, isAdmin, isStaff, requestHelp, requesting],
  );

  const showBanner =
    isStaff &&
    activeSession &&
    ["pending", "accepted", "active"].includes(activeSession.status) &&
    !(
      activeSession.initiatedBy === "admin" &&
      activeSession.status === "pending"
    );

  return (
    <RemoteSupportContext.Provider value={ctxValue}>
      {children}

      {showBanner ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[360] flex justify-center p-2">
          <div className="pointer-events-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm shadow-md dark:bg-amber-950/80">
            <Headphones className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <span className="font-medium text-amber-900 dark:text-amber-100">
              {activeSession.status === "pending"
                ? "관리자 수락 대기 중…"
                : sharing
                  ? "관리자 원격 지원 중"
                  : "원격 지원 연결 중…"}
            </span>
            {peerError ? (
              <span className="text-xs text-destructive">{peerError}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {connectionState}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setChatOpen((v) => !v)}
            >
              채팅
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={ending}
              onClick={handleEndClick}
            >
              종료
            </Button>
          </div>
        </div>
      ) : null}

      {showBanner && chatOpen && activeSession ? (
        <div className="fixed bottom-4 right-4 z-[360] w-[min(100vw-2rem,22rem)] shadow-lg">
          <div className="relative">
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setChatOpen(false)}
              aria-label="채팅 닫기"
            >
              <X className="h-4 w-4" />
            </button>
            <RemoteSupportChat
              sessionId={activeSession._id}
              initialMessages={activeSession.messages || []}
              compact
            />
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(inviteSession)}
        onOpenChange={(open) => {
          if (!open) void declineInvite();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>원격 지원 초대</DialogTitle>
            <DialogDescription>
              관리자가 화면을 함께 보고 조작할 수 있도록 도와 드립니다. 수락하면
              브라우저에서 <strong>이 사이트 탭(또는 창)</strong> 공유를
              요청합니다. 전체 화면은 선택하지 마세요 — 같은 모니터를 쓰면
              화면이 무한 반복됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void declineInvite()}>
              거절
            </Button>
            <Button type="button" onClick={() => void acceptInvite()}>
              수락
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEndNotes} onOpenChange={setShowEndNotes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지원 기록</DialogTitle>
            <DialogDescription>
              일시·참여자는 자동 저장됩니다. 지원 내용과 개발 아이디어 태그를
              남겨 주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="지원 내용 요약"
              rows={5}
            />
            <Input
              value={ideaTagsText}
              onChange={(e) => setIdeaTagsText(e.target.value)}
              placeholder="아이디어 태그 (쉼표 구분)"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ending}
              onClick={() => void doEnd(false)}
            >
              기록 없이 종료
            </Button>
            <Button
              type="button"
              disabled={ending}
              onClick={() => void doEnd(true)}
            >
              저장 후 종료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RemoteSupportContext.Provider>
  );
}

/** Sidebar / header entry for staff */
export function RemoteSupportRequestButton({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const ctx = useRemoteSupportOptional();
  if (!ctx?.isStaff) return null;
  const busy =
    ctx.requesting ||
    Boolean(
      ctx.activeSession &&
        ["pending", "accepted", "active"].includes(ctx.activeSession.status),
    );
  return (
    <Button
      type="button"
      variant="outline"
      className={
        collapsed
          ? "w-full justify-center px-2"
          : "w-full justify-start gap-2"
      }
      disabled={busy}
      onClick={() => void ctx.requestHelp()}
      title="원격 지원 요청"
    >
      <Headphones className="h-4 w-4 shrink-0" />
      {!collapsed ? (busy ? "지원 진행 중…" : "원격 지원 요청") : null}
    </Button>
  );
}
