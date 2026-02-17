import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phone, Send, History, MessageCircle } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useNavigate } from "react-router-dom";

type SmsHistoryItem = {
  id: string;
  to: string;
  body: string;
  status: "SENT" | "FAILED" | "QUEUED";
  createdAt: string;
};

const mockHistory: SmsHistoryItem[] = [
  {
    id: "1",
    to: "010-1234-5678",
    body: "[어벗츠] 테스트 문자입니다.",
    status: "SENT",
    createdAt: "2025-12-25 08:40",
  },
  {
    id: "2",
    to: "010-9876-5432",
    body: "[어벗츠] 재시도 대기 메시지",
    status: "QUEUED",
    createdAt: "2025-12-25 08:35",
  },
];

const statusBadge = (status: SmsHistoryItem["status"]) => {
  switch (status) {
    case "SENT":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          발송됨
        </Badge>
      );
    case "FAILED":
      return <Badge variant="destructive">실패</Badge>;
    case "QUEUED":
    default:
      return <Badge variant="secondary">대기</Badge>;
  }
};

export default function AdminSmsPage() {
  const [tab, setTab] = useState<"send" | "history" | "queue">("send");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [useKakao, setUseKakao] = useState(true);
  const [templateCode, setTemplateCode] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [history, setHistory] = useState<SmsHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { token } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await request<any>({
        path: "/api/admin/sms/history?page=1&limit=20",
        method: "GET",
        token,
      });
      const body = res.data || {};
      const rows = (body.data || []) as any[];
      setHistory(
        rows.map((r) => ({
          id: String(r._id || r.id || ""),
          to: Array.isArray(r.to) ? r.to.join(", ") : String(r.to || ""),
          body: r.text || "",
          status: r.status || "SENT",
          createdAt: r.createdAt || "",
        })),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadTemplates = async () => {
    if (!token) return;
    setTemplatesLoading(true);
    try {
      const res = await request<any>({
        path: "/api/admin/kakao/templates",
        method: "GET",
        token,
      });
      if (res.ok) {
        const body = res.data || {};
        setTemplates(Array.isArray(body.data) ? body.data : []);
      }
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    void loadTemplates();
  }, [token]);

  const sendSms = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }
    const toList = to
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!toList.length || !body.trim()) {
      toast({
        title: "수신자/내용을 입력하세요",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const endpoint = useKakao
        ? "/api/admin/messages/send"
        : "/api/admin/sms/send";
      const res = await request<any>({
        path: endpoint,
        method: "POST",
        token,
        jsonBody: {
          to: toList,
          text: body,
          templateCode: useKakao ? templateCode : undefined,
          useKakao,
        },
      });
      if (!res.ok) {
        toast({
          title: "발송 실패",
          description:
            (res.data as any)?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "발송 완료" });
      setBody("");
      void loadHistory();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "send" | "history")}>
        <TabsList>
          <TabsTrigger value="send" className="gap-2">
            <Send className="h-4 w-4" />
            문자 보내기
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            발송 이력
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                수신자 정보
              </CardTitle>
              <CardDescription>
                수신 번호와 메시지를 입력하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useKakao"
                  checked={useKakao}
                  onChange={(e) => setUseKakao(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="useKakao" className="text-sm font-medium">
                  <MessageCircle className="h-4 w-4 inline mr-1" />
                  카카오톡 알림톡 우선 전송 (실패 시 SMS 대체)
                </label>
              </div>

              {useKakao && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">템플릿 선택</label>
                  <select
                    value={templateCode}
                    onChange={(e) => setTemplateCode(e.target.value)}
                    className="w-full border rounded-md p-2 text-sm"
                    disabled={templatesLoading}
                  >
                    <option value="">템플릿 선택</option>
                    {templates.map((t) => (
                      <option key={t.templateCode} value={t.templateCode}>
                        {t.templateName} ({t.templateCode})
                      </option>
                    ))}
                  </select>
                  {templatesLoading && (
                    <div className="text-xs text-muted-foreground">
                      템플릿 불러오는 중...
                    </div>
                  )}
                </div>
              )}

              <Input
                placeholder="수신자 번호 (예: 01012345678, 여러 명은 쉼표로 구분)"
                value={to}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTo(e.target.value)
                }
              />
              <Textarea
                placeholder="메시지 내용"
                value={body}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setBody(e.target.value)
                }
                rows={6}
              />
              <div className="text-xs text-muted-foreground">
                {useKakao
                  ? "카카오톡 알림톡으로 먼저 발송하고, 실패 시 자동으로 SMS/LMS로 대체 발송됩니다."
                  : "SMS/LMS로 직접 발송됩니다. (90자 초과 시 LMS)"}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={sendSms}
                  disabled={
                    sending || !to || !body || (useKakao && !templateCode)
                  }
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? "발송 중..." : "발송하기"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>발송 이력</CardTitle>
              <CardDescription>
                최근 문자 발송 내역을 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {historyLoading && (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              )}
              {!historyLoading &&
                history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{item.to}</div>
                      {statusBadge(item.status as SmsHistoryItem["status"])}
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {item.body}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.createdAt}
                    </div>
                  </div>
                ))}
              {!historyLoading && history.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  발송 이력이 없습니다.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
