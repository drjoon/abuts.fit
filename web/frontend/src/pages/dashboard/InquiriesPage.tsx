import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";

const statusLabelMap: Record<string, string> = {
  open: "접수",
  resolved: "처리완료",
};

const typeLabelMap: Record<string, string> = {
  general: "일반 문의",
  business_registration: "사업자등록 문의",
  user_registration: "사용자등록 문의",
};

type InquiryItem = {
  _id: string;
  type?: "general" | "business_registration" | "user_registration";
  subject?: string;
  message?: string;
  status?: "open" | "resolved";
  adminNote?: string;
  createdAt?: string;
};

export const InquiriesPage = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<InquiryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<
    "general" | "business_registration" | "user_registration"
  >("general");

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      ),
    [items],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await request<any>({
        path: "/api/support/inquiries",
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(
          res.data?.message || "문의 목록을 불러오지 못했습니다.",
        );
      }
      setItems(res.data?.data || []);
    } catch (error: any) {
      toast({
        title: "문의 목록 로딩 실패",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: "문의 내용을 입력해주세요",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await request<any>({
        path: "/api/support/inquiries",
        method: "POST",
        jsonBody: {
          type,
          subject: subject.trim(),
          message: message.trim(),
        },
      });
      if (!res.ok) {
        throw new Error(res.data?.message || "문의 접수에 실패했습니다.");
      }
      toast({ title: "문의가 접수되었습니다" });
      setSubject("");
      setMessage("");
      setType("general");
      await load();
    } catch (error: any) {
      toast({
        title: "문의 접수 실패",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>문의</CardTitle>
          <CardDescription>
            문의를 남기면 담당자가 확인 후 연락드립니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <div>
              <label className="text-sm font-medium">문의 유형</label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as any)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="문의 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">일반 문의</SelectItem>
                  <SelectItem value="business_registration">
                    사업자등록 문의
                  </SelectItem>
                  <SelectItem value="user_registration">
                    사용자등록 문의
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">제목</label>
              <Input
                className="mt-2"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="문의 제목을 입력하세요"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">문의 내용</label>
            <Textarea
              className="mt-2"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="문의 내용을 입력해주세요"
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "접수 중..." : "문의 접수"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내 문의</CardTitle>
          <CardDescription>
            {loading ? "불러오는 중..." : `${sortedItems.length}건`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>접수일</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {typeLabelMap[item.type || "general"] || "일반 문의"}
                  </TableCell>
                  <TableCell>{item.subject || "-"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "resolved" ? "outline" : "default"
                      }
                    >
                      {statusLabelMap[item.status || "open"] || "접수"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!sortedItems.length && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-slate-400"
                  >
                    문의 내역이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InquiriesPage;
