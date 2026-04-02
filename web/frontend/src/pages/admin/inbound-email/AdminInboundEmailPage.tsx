import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mail,
  MailOpen,
  Trash2,
  AlertTriangle,
  Search,
  Download,
  RefreshCw,
  Archive,
} from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { toast } from "sonner";

interface InboundEmail {
  _id: string;
  uuid: string;
  messageId: string;
  from: {
    address: string;
    name?: string;
  };
  to: Array<{
    address: string;
    name?: string;
  }>;
  subject: string;
  sentAtDate: string;
  isRead: boolean;
  isStarred: boolean;
  spamScore?: number;
  attachments: Array<{
    name: string;
    contentType: string;
    contentLength: number;
    downloadToken: string;
  }>;
  createdAt: string;
}

interface EmailStats {
  inbox: number;
  spam: number;
  trash: number;
  total: number;
}

export default function AdminInboundEmailPage() {
  const navigate = useNavigate();
  const [folder, setFolder] = useState<"inbox" | "spam" | "trash">("inbox");
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [stats, setStats] = useState<EmailStats>({
    inbox: 0,
    spam: 0,
    trash: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchEmails();
    fetchStats();
  }, [folder, page]);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        folder,
        page: page.toString(),
        limit: "20",
      });
      if (search) params.append("search", search);

      const response = await apiFetch({
        path: `/admin/inbound-email?${params}`,
        method: "GET",
      });

      if (response.ok && response.data) {
        setEmails(response.data.emails);
        setTotal(response.data.pagination.total);
      }
    } catch (error: any) {
      console.error("Failed to fetch emails:", error);
      toast.error("메일 목록을 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiFetch({
        path: "/admin/inbound-email/stats",
        method: "GET",
      });
      if (response.ok && response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchEmails();
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}/read`,
        method: "PATCH",
      });
      toast.success("읽음으로 표시했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("처리 실패");
    }
  };

  const handleMarkAsUnread = async (id: string) => {
    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}/unread`,
        method: "PATCH",
      });
      toast.success("읽지 않음으로 표시했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("처리 실패");
    }
  };

  const handleMoveToSpam = async (id: string) => {
    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}/spam`,
        method: "PATCH",
      });
      toast.success("스팸으로 이동했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("처리 실패");
    }
  };

  const handleMoveToTrash = async (id: string) => {
    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}/trash`,
        method: "PATCH",
      });
      toast.success("휴지통으로 이동했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("처리 실패");
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}/restore`,
        method: "PATCH",
      });
      toast.success("받은편지함으로 복원했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("처리 실패");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      await apiFetch({
        path: `/admin/inbound-email/${id}`,
        method: "DELETE",
      });
      toast.success("삭제했습니다");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast.error("삭제 실패");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 24) {
      return date.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">수신 메일함</h1>
            <p className="text-sm text-muted-foreground">
              Brevo 인바운드 이메일 관리
            </p>
          </div>
          <Button onClick={fetchEmails} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="발신자, 제목, 내용 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch}>검색</Button>
        </div>
      </div>

      <Tabs
        value={folder}
        onValueChange={(v) => {
          setFolder(v as any);
          setPage(1);
        }}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="inbox" className="gap-2">
            <Mail className="h-4 w-4" />
            받은편지함
            {stats.inbox > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stats.inbox}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="spam" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            스팸
            {stats.spam > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stats.spam}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trash" className="gap-2">
            <Trash2 className="h-4 w-4" />
            휴지통
            {stats.trash > 0 && (
              <Badge variant="secondary" className="ml-1">
                {stats.trash}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              로딩 중...
            </div>
          ) : emails.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              메일이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {emails.map((email) => (
                <Card
                  key={email._id}
                  className={`cursor-pointer hover:bg-accent/50 transition-colors ${
                    !email.isRead ? "border-l-4 border-l-blue-500" : ""
                  }`}
                  onClick={() =>
                    navigate(`/dashboard/admin/inbound-email/${email._id}`)
                  }
                >
                  <CardHeader className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {email.isRead ? (
                            <MailOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          )}
                          <span
                            className={`font-medium truncate ${
                              !email.isRead ? "font-bold" : ""
                            }`}
                          >
                            {email.from.name || email.from.address}
                          </span>
                          {email.spamScore && email.spamScore > 5 && (
                            <Badge variant="destructive" className="text-xs">
                              스팸 {email.spamScore.toFixed(1)}
                            </Badge>
                          )}
                          {email.attachments.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Download className="h-3 w-3 mr-1" />
                              {email.attachments.length}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {email.from.address}
                        </div>
                        <div
                          className={`text-sm mt-1 truncate ${
                            !email.isRead ? "font-semibold" : ""
                          }`}
                        >
                          {email.subject || "(제목 없음)"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(email.sentAtDate)}
                        </span>
                        <div
                          className="flex gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!email.isRead ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMarkAsRead(email._id)}
                              title="읽음으로 표시"
                            >
                              <MailOpen className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMarkAsUnread(email._id)}
                              title="읽지 않음으로 표시"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          {folder === "inbox" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMoveToSpam(email._id)}
                                title="스팸으로 이동"
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMoveToTrash(email._id)}
                                title="휴지통으로 이동"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(folder === "spam" || folder === "trash") && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRestore(email._id)}
                                title="복원"
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(email._id)}
                                title="영구 삭제"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                이전
              </Button>
              <span className="py-2 px-4">
                {page} / {Math.ceil(total / 20)}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
              >
                다음
              </Button>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
