import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageSquare, X, Minimize2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import { RequestBase, getRequestId } from "@/types/request";

type ViewMode = "chats";

interface RequestSummary {
  id: string;
  title: string;
  counterpart: string; // 상대방 (제작사 또는 의뢰인)
  date: string;
  status: string;
  unreadCount?: number;
}

// TODO: 이후 실제 API(`/api/requests/me`, `/api/requests/assigned`)로 교체
const mockMyRequestsForRequestor: RequestSummary[] = [
  {
    id: "REQ-001",
    title: "상악 우측 제1대구치 임플란트",
    counterpart: "프리미엄 어벗먼트", // 제작사
    date: "2025-07-15",
    status: "진행중",
  },
  {
    id: "REQ-002",
    title: "하악 좌측 제2소구치 임플란트",
    counterpart: "프리미엄 어벗먼트",
    date: "2025-07-14",
    status: "제작중",
  },
];

const mockAssignedRequestsForManufacturer: RequestSummary[] = [
  {
    id: "REQ-101",
    title: "상악 전치부 임플란트",
    counterpart: "서울치과기공소", // 의뢰인
    date: "2025-07-16",
    status: "검토중",
  },
  {
    id: "REQ-102",
    title: "하악 우측 제1대구치 임플란트",
    counterpart: "부산치과기공소",
    date: "2025-07-15",
    status: "진행중",
  },
];

export const NewChatWidget = () => {
  const { user, isAuthenticated } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [viewMode] = useState<ViewMode>("chats");
  const [selectedRequest, setSelectedRequest] = useState<RequestBase | null>(
    null
  );
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [backendRequests, setBackendRequests] = useState<RequestBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRequests = async () => {
      if (!user || !isAuthenticated) return;
      setLoading(true);
      setError(null);

      const path =
        user.role === "manufacturer"
          ? "/api/requests/assigned"
          : "/api/requests/my";

      try {
        const res = await fetch(path, {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().token}`,
            "x-mock-role": user.role,
          },
        });
        if (!res.ok) {
          throw new Error("의뢰 목록을 불러오지 못했습니다.");
        }
        const body = await res.json();
        const data = body?.data;
        const list = Array.isArray(data?.requests)
          ? (data.requests as RequestBase[])
          : [];
        setBackendRequests(list);
      } catch (e: any) {
        setError(e?.message || "의뢰 목록 조회 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    void loadRequests();
  }, [user, isAuthenticated]);

  // 백엔드 의뢰 목록을 요약 형태로 변환
  const summarizeRequests = (
    list: RequestBase[],
    role: typeof user.role
  ): RequestSummary[] => {
    return list.map((r) => {
      const id = getRequestId(r);
      const title =
        r.title ||
        r.subject ||
        r.implantType ||
        r.implantCompany ||
        "어벗먼트 의뢰";

      const createdAt = r.createdAt ? new Date(r.createdAt) : null;
      const date = createdAt ? createdAt.toISOString().slice(0, 10) : "";

      const status = r.status || "";

      let counterpart: string;
      if (role === "manufacturer") {
        counterpart =
          r.requestor?.organization || r.requestor?.name || "의뢰인 미지정";
      } else {
        if (typeof r.manufacturer === "string") {
          counterpart = r.manufacturer || "제작사 미지정";
        } else {
          counterpart =
            r.manufacturer?.name ||
            r.manufacturer?.organization ||
            "제작사 미지정";
        }
      }

      return {
        id,
        title,
        counterpart,
        date,
        status,
        unreadCount: r.unreadCount ?? 0,
      } as RequestSummary;
    });
  };

  if (!isAuthenticated || !user) {
    return null; // 로그인하지 않은 사용자에게는 채팅 위젯을 표시하지 않음
  }

  const effectiveRequests: RequestSummary[] =
    backendRequests.length > 0
      ? summarizeRequests(backendRequests, user.role)
      : user.role === "manufacturer"
      ? mockAssignedRequestsForManufacturer
      : mockMyRequestsForRequestor;

  const totalUnread = effectiveRequests.reduce(
    (sum, r) => sum + (r.unreadCount ?? 0),
    0
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {!isOpen ? (
          <Button
            size="lg"
            className="rounded-full h-12 w-12 sm:h-14 sm:w-14 shadow-elegant animate-pulse-glow"
            variant="hero"
            onClick={() => setIsOpen(true)}
          >
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            {/* 읽지 않은 메시지 알림 (간단히 의뢰 개수 기준) */}
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </Button>
        ) : (
          <Card
            className={`
            w-[calc(100vw-2rem)] max-w-96 h-[calc(100vh-8rem)] max-h-[600px] sm:w-96 sm:h-[600px]
            border transition-all duration-300 bg-card overflow-hidden 
            ${isMinimized ? "h-12" : ""}
          `}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4 border-b bg-muted/50">
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="text-sm font-medium">
                  {user.role === "manufacturer" ? "할당 의뢰" : "내 의뢰"}
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsMinimized(!isMinimized)}
                  title="축소"
                  className="h-8 w-8 p-0"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  title="닫기"
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {!isMinimized && (
              <div className="h-[calc(100%-3.5rem)] sm:h-[544px] overflow-y-auto">
                <div className="p-3 sm:p-4 space-y-2">
                  {loading && (
                    <div className="text-center text-xs text-muted-foreground py-4">
                      의뢰 목록을 불러오는 중입니다...
                    </div>
                  )}

                  {error && !loading && (
                    <div className="text-center text-xs text-destructive py-2">
                      {error}
                    </div>
                  )}

                  {effectiveRequests.map((req) => (
                    <button
                      key={req.id}
                      type="button"
                      className="w-full text-left p-3 sm:p-3 border border-border rounded-lg hover:bg-muted/60 transition-colors text-xs sm:text-sm"
                      onClick={() => {
                        // 백엔드에서 가져온 전체 request 객체 찾기 (없으면 최소 정보만 전달)
                        const fullRequest: RequestBase = backendRequests.find(
                          (r) => getRequestId(r) === req.id
                        ) || {
                          _id: req.id,
                          id: req.id,
                          title: req.title,
                          status: req.status,
                        };

                        setSelectedRequest(fullRequest);
                        setIsRequestDialogOpen(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium truncate">{req.title}</div>
                        <div className="text-[11px] text-muted-foreground ml-2 whitespace-nowrap">
                          {req.date}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{req.counterpart}</span>
                        <span>
                          {req.status}
                          {req.unreadCount && req.unreadCount > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.5 text-[10px]">
                              {req.unreadCount > 99 ? "99+" : req.unreadCount}
                            </span>
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                  {effectiveRequests.length === 0 && !loading && (
                    <div className="text-center text-xs text-muted-foreground py-6">
                      아직 등록된 의뢰가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* 의뢰 상세 + 채팅 (ExpandedRequestCard 재사용) */}
      <Dialog
        open={isRequestDialogOpen && !!selectedRequest}
        onOpenChange={(open) => {
          if (!open) {
            setIsRequestDialogOpen(false);
            setSelectedRequest(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
          {selectedRequest && (
            <ExpandedRequestCard
              request={selectedRequest}
              onClose={() => {
                setIsRequestDialogOpen(false);
                setSelectedRequest(null);
              }}
              currentUserId={user.id}
              currentUserRole={user.role}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
