import { useEffect, useMemo, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { SUPPORT_EMAIL, COMPANY_PHONE } from "@/shared/lib/contactInfo";
import { useAuthStore } from "@/store/useAuthStore";
import { HelpCircle, Phone } from "lucide-react";

const statusLabelMap: Record<string, string> = {
  open: "접수",
  resolved: "처리완료",
};

const typeLabelMap: Record<string, string> = {
  general: "일반 문의",
  business_registration: "배송 문의",
  user_registration: "결제 문의",
  other: "기타",
};

type InquiryItem = {
  _id: string;
  type?: "general" | "business_registration" | "user_registration" | "other";
  subject?: string;
  message?: string;
  status?: "open" | "resolved";
  adminNote?: string;
  createdAt?: string;
};

export const InquiriesPage = () => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [items, setItems] = useState<InquiryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<
    "general" | "business_registration" | "user_registration" | "other"
  >("general");
  const [detailItem, setDetailItem] = useState<InquiryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      ),
    [items],
  );

  const stats = useMemo(() => {
    const open = items.filter((item) => item.status !== "resolved").length;
    const resolved = items.filter((item) => item.status === "resolved").length;
    return { open, resolved, total: items.length };
  }, [items]);

  const rolePreset = useMemo(() => {
    if (user?.role === "salesman") {
      return {
        title: "영업 활동 중 생긴 이슈를 바로 알려주세요",
        description:
          "제휴 요청, 추천코드, 수당 관련 문의를 빠르게 정리해서 전달드릴게요.",
        helper: "영업 지원 전용 라인",
        helperValue: "sales@abuts.fit",
        typeChips: [
          { value: "general", label: "영업 일반" },
          { value: "business_registration", label: "배송" },
          { value: "user_registration", label: "결제" },
          { value: "other", label: "기타" },
        ],
      } as const;
    }

    return {
      title: "의뢰/배송 중 궁금한 점을 남겨주세요",
      description:
        "제작, 배송, 청구 관련 문의를 한 화면에서 접수하고 진행 상황을 확인할 수 있습니다.",
      helper: "고객지원",
      helperValue: "support@abuts.fit",
      typeChips: [
        { value: "general", label: "제작/운영" },
        { value: "business_registration", label: "배송" },
        { value: "user_registration", label: "결제" },
        { value: "other", label: "기타" },
      ],
    } as const;
  }, [user?.role]);

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

  const openDetail = (item: InquiryItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
  };

  const handleReopen = () => {
    if (!detailItem) return;
    const newSubject = detailItem.subject
      ? `[재문의] ${detailItem.subject}`
      : `[재문의] ${typeLabelMap[detailItem.type || "general"]}`;
    setSubject(newSubject);
    setMessage((prev) =>
      prev?.trim()
        ? prev
        : `안녕하세요, 이전 문의(${detailItem._id})에 대해 추가 문의드립니다.\n\n`,
    );
    setType((detailItem.type || "general") as typeof type);
    setDetailOpen(false);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-2 py-6 text-sm text-primary">
          <div className="flex items-center gap-2 font-medium">
            <HelpCircle className="h-4 w-4" />
            {rolePreset.title}
          </div>
          <p className="text-primary/80">{rolePreset.description}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-primary/80">
            <Phone className="h-4 w-4" />
            <span className="font-semibold">{rolePreset.helper}</span>
            <a
              href={`tel:${COMPANY_PHONE.replace(/[^0-9+]/g, "")}`}
              className="underline"
            >
              {COMPANY_PHONE}
            </a>
            <span>·</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {rolePreset.helperValue}
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="order-2 lg:order-1" ref={formRef}>
          <CardHeader>
            <CardTitle>문의 접수</CardTitle>
            <CardDescription>
              필요한 내용만 적고 30초만에 접수하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">문의 유형</p>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                {rolePreset.typeChips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setType(chip.value as typeof type)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      type === chip.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">제목</p>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="예) 배송상태 확인 요청"
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">문의 내용</p>
              <Textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="상황과 요청 사항을 간단히 남겨주세요."
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "접수 중..." : "문의 접수"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 lg:order-2">
          <CardHeader>
            <CardTitle>처리 현황</CardTitle>
            <CardDescription>
              {loading ? "불러오는 중..." : `${stats.total}건 등록됨`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-3 text-center md:col-span-2">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">진행중</p>
                <p className="text-2xl font-semibold">{stats.open}</p>
              </div>
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">완료</p>
                <p className="text-2xl font-semibold">{stats.resolved}</p>
              </div>
            </div>
            <div className="space-y-3 md:col-span-2">
              {sortedItems.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => openDetail(item)}
                  className="w-full rounded-2xl border p-4 text-left text-sm transition hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString("ko-KR")
                          : "-"}
                      </p>
                      <p className="mt-1 font-medium">
                        {item.subject || typeLabelMap[item.type || "general"]}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.status === "resolved" ? "outline" : "default"
                      }
                    >
                      {statusLabelMap[item.status || "open"] || "접수"}
                    </Badge>
                  </div>
                </button>
              ))}
              {!sortedItems.length && !loading && (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  아직 접수된 문의가 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailItem?.subject ||
                typeLabelMap[detailItem?.type || "general"]}
            </DialogTitle>
            <DialogDescription>
              {detailItem?.createdAt
                ? new Date(detailItem.createdAt).toLocaleString("ko-KR")
                : "시간 정보 없음"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">문의 유형</p>
                <p className="font-medium">
                  {typeLabelMap[detailItem?.type || "general"]}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">처리 상태</p>
                <Badge
                  variant={
                    detailItem?.status === "resolved" ? "outline" : "default"
                  }
                >
                  {statusLabelMap[detailItem?.status || "open"]}
                </Badge>
              </div>
            </div>
            <div className="rounded-xl bg-muted/20 p-3 min-h-[160px] max-h-[150px] flex flex-col overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">문의 내용</p>
              <p className="whitespace-pre-line">
                {detailItem?.message || "내용이 입력되지 않았습니다."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 min-h-[160px] max-h-[150px] flex flex-col overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-1">관리자 답변</p>
              <p className="whitespace-pre-line">
                {detailItem?.adminNote?.trim()
                  ? detailItem.adminNote
                  : "답변이 등록되면 여기에서 확인할 수 있습니다."}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={handleReopen}>
              재문의 하기
            </Button>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={closeDetail}>
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InquiriesPage;
