import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import {
  SUPPORT_EMAIL,
  COMPANY_PHONE,
  BUSINESS_EMAIL,
} from "@/shared/lib/contactInfo";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Mail,
  MessageSquarePlus,
  Phone,
} from "lucide-react";

export const INQUIRY_TYPE_LABEL: Record<string, string> = {
  manufacturing: "의뢰/제작",
  delivery: "배송",
  billing: "청구/결제",
  account: "계정/사업자",
  order_intake: "의뢰 접수",
  cam_machining: "CAM/가공",
  equipment: "장비/소프트웨어",
  settlement: "정산",
  referral_commission: "소개/수당",
  operation: "운영",
  system: "시스템/서비스",
  partnership: "파트너십",
  general: "일반",
  other: "기타",
  business_registration: "사업자등록",
  user_registration: "사용자등록",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "outline" | "secondary" }
> = {
  open: { label: "처리 중", variant: "default" },
  resolved: { label: "처리 완료", variant: "outline" },
};

type TypeChip = { value: string; label: string };

type RolePreset = {
  title: string;
  description: string;
  contactEmail: string;
  contactLabel: string;
  typeChips: TypeChip[];
  subjectPlaceholder: string;
  messagePlaceholder: string;
};

const ROLE_PRESETS: Record<string, RolePreset> = {
  requestor: {
    title: "의뢰/배송 관련 궁금한 점을 알려주세요",
    description:
      "제작, 배송, 결제, 계정 관련 문의를 접수하고 진행 상태를 확인하세요.",
    contactEmail: SUPPORT_EMAIL,
    contactLabel: "고객지원",
    typeChips: [
      { value: "manufacturing", label: "의뢰/제작" },
      { value: "delivery", label: "배송" },
      { value: "billing", label: "청구/결제" },
      { value: "account", label: "계정/사업자" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) 의뢰 배송상태 확인 요청",
    messagePlaceholder:
      "의뢰 번호, 환자명 등 관련 정보를 함께 남겨주시면 빠르게 처리해 드릴게요.",
  },
  manufacturer: {
    title: "제조 운영 중 도움이 필요한 사항을 알려주세요",
    description:
      "의뢰 처리, 가공, 장비, 정산 등 제조 전반의 문의를 처리합니다.",
    contactEmail: SUPPORT_EMAIL,
    contactLabel: "제조 지원",
    typeChips: [
      { value: "order_intake", label: "의뢰 접수" },
      { value: "cam_machining", label: "CAM/가공" },
      { value: "equipment", label: "장비/소프트웨어" },
      { value: "settlement", label: "정산" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) Esprit NC 파일 생성 오류",
    messagePlaceholder:
      "의뢰 ID, 장비명, 오류 메시지 등 상황을 구체적으로 남겨주세요.",
  },
  salesman: {
    title: "영업 활동 중 생긴 이슈를 바로 알려주세요",
    description:
      "소개 수당, 정산, 계정 관리, 운영 전반에 관한 문의를 빠르게 처리합니다.",
    contactEmail: "sales@abuts.fit",
    contactLabel: "영업 지원",
    typeChips: [
      { value: "referral_commission", label: "소개/수당" },
      { value: "billing", label: "정산/지급" },
      { value: "account", label: "계정 관리" },
      { value: "operation", label: "운영 일반" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) 소개 수당 미지급 확인 요청",
    messagePlaceholder:
      "소개 코드, 대상 사업자명 등 관련 정보를 함께 남겨주세요.",
  },
  devops: {
    title: "시스템 및 파트너 운영 관련 문의를 남겨주세요",
    description:
      "시스템 이슈, 정산/수익, 파트너십 등 개발운영사 전용 문의를 처리합니다.",
    contactEmail: BUSINESS_EMAIL,
    contactLabel: "개발운영 지원",
    typeChips: [
      { value: "system", label: "시스템/서비스" },
      { value: "settlement", label: "정산/수익" },
      { value: "partnership", label: "파트너십" },
      { value: "operation", label: "운영 일반" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) 정산 내역 불일치 확인 요청",
    messagePlaceholder:
      "시스템 오류는 발생 시간, 화면, 오류 내용을 구체적으로 남겨주세요.",
  },
};

type InquiryItem = {
  _id: string;
  type?: string;
  subject?: string;
  message?: string;
  status?: "open" | "resolved";
  adminNote?: string;
  createdAt?: string;
};

export const InquiriesPage = () => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const preset =
    ROLE_PRESETS[user?.role ?? "requestor"] ?? ROLE_PRESETS.requestor;

  const [items, setItems] = useState<InquiryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>(preset.typeChips[0].value);
  const [detailItem, setDetailItem] = useState<InquiryItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
      ),
    [items],
  );

  const stats = useMemo(
    () => ({
      open: items.filter((i) => i.status !== "resolved").length,
      resolved: items.filter((i) => i.status === "resolved").length,
      total: items.length,
    }),
    [items],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await request<any>({
        path: "/api/support/inquiries",
        method: "GET",
      });
      if (!res.ok)
        throw new Error(
          res.data?.message || "문의 목록을 불러오지 못했습니다.",
        );
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

  useEffect(() => {
    const presetSubject = String(searchParams.get("subject") || "").trim();
    const presetMessage = String(searchParams.get("message") || "").trim();
    const presetType = String(searchParams.get("type") || "").trim();
    const shouldFocusMessage = searchParams.get("focus") === "message";

    if (presetSubject) setSubject((prev) => prev || presetSubject);
    if (presetMessage) setMessage((prev) => prev || presetMessage);
    if (presetType && preset.typeChips.some((c) => c.value === presetType)) {
      setType((prev) => prev || presetType);
    }

    if (presetSubject || presetMessage || shouldFocusMessage) {
      setActiveTab("new");
      requestAnimationFrame(() => {
        if (shouldFocusMessage) messageRef.current?.focus();
      });
      const next = new URLSearchParams(searchParams);
      next.delete("subject");
      next.delete("message");
      next.delete("type");
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openDetail = (item: InquiryItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  const handleReopen = () => {
    if (!detailItem) return;
    setSubject(
      detailItem.subject
        ? `[재문의] ${detailItem.subject}`
        : `[재문의] ${INQUIRY_TYPE_LABEL[detailItem.type ?? "other"] ?? "문의"}`,
    );
    setMessage((prev) =>
      prev?.trim()
        ? prev
        : `이전 문의(${detailItem._id})에 대해 추가로 문의드립니다.\n\n`,
    );
    setType(detailItem.type ?? preset.typeChips[0].value);
    setDetailOpen(false);
    setActiveTab("new");
    requestAnimationFrame(() => messageRef.current?.focus());
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({ title: "문의 내용을 입력해주세요", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await request<any>({
        path: "/api/support/inquiries",
        method: "POST",
        jsonBody: { type, subject: subject.trim(), message: message.trim() },
      });
      if (!res.ok)
        throw new Error(res.data?.message || "문의 접수에 실패했습니다.");
      toast({
        title: "문의가 접수되었습니다",
        description: "내 문의 내역에서 처리 상태를 확인하세요.",
      });
      setSubject("");
      setMessage("");
      setType(preset.typeChips[0].value);
      await load();
      setActiveTab("history");
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

  const openEmail = () => {
    window.open(`mailto:${preset.contactEmail}`, "_blank");
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* 헤더 배너 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-semibold text-sm text-primary">
                <HelpCircle className="h-4 w-4 shrink-0" />
                {preset.title}
              </div>
              <p className="text-xs text-primary/70">{preset.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`tel:${COMPANY_PHONE.replace(/[^0-9+]/g, "")}`}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white/60 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition"
              >
                <Phone className="h-3.5 w-3.5" />
                {COMPANY_PHONE}
              </a>
              <button
                type="button"
                onClick={openEmail}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white/60 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition"
              >
                <Mail className="h-3.5 w-3.5" />
                {preset.contactLabel}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 탭: 새 문의 / 내 문의 내역 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "new" | "history")}
      >
        <TabsList className="w-full">
          <TabsTrigger value="new" className="flex-1 gap-1.5">
            <MessageSquarePlus className="h-4 w-4" />새 문의 작성
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1.5">
            {stats.open > 0 ? (
              <Clock className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            내 문의 내역
            {stats.total > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {stats.total}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 새 문의 작성 탭 */}
        <TabsContent value="new">
          <Card>
            
            <CardContent className="space-y-5 py-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  문의 유형
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {preset.typeChips.map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => setType(chip.value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                        type === chip.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  제목 <span className="text-muted-foreground/60">(선택)</span>
                </p>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={preset.subjectPlaceholder}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  문의 내용 <span className="text-red-400 text-xs">*</span>
                </p>
                <Textarea
                  ref={messageRef}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={preset.messagePlaceholder}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  접수 후 1~2 영업일 내 답변드립니다.
                </p>
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
        </TabsContent>

        {/* 내 문의 내역 탭 */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">내 문의 내역</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {loading
                      ? "불러오는 중..."
                      : `전체 ${stats.total}건 · 처리 중 ${stats.open}건 · 완료 ${stats.resolved}건`}
                  </p>
                </div>
                {stats.total > 0 && (
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center min-w-[52px]">
                      <p className="text-xs text-muted-foreground">처리 중</p>
                      <p className="text-xl font-bold leading-tight">
                        {stats.open}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center min-w-[52px]">
                      <p className="text-xs text-muted-foreground">완료</p>
                      <p className="text-xl font-bold leading-tight">
                        {stats.resolved}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sortedItems.length === 0 && !loading ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center">
                  <MessageSquarePlus className="h-8 w-8 text-muted-foreground/30" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      아직 접수된 문의가 없습니다
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      새 문의 작성 탭에서 문의를 접수해 보세요.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("new")}
                  >
                    문의 작성하기
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedItems.map((item) => {
                    const statusConf =
                      STATUS_CONFIG[item.status ?? "open"] ??
                      STATUS_CONFIG.open;
                    const typeLabel =
                      INQUIRY_TYPE_LABEL[item.type ?? "other"] ??
                      item.type ??
                      "기타";
                    return (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => openDetail(item)}
                        className="w-full rounded-2xl border p-4 text-left transition hover:border-primary hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {typeLabel}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {item.createdAt
                                  ? new Date(item.createdAt).toLocaleString(
                                      "ko-KR",
                                    )
                                  : "-"}
                              </span>
                            </div>
                            <p className="mt-1.5 font-medium truncate">
                              {item.subject || typeLabel}
                            </p>
                            {item.message && (
                              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                {item.message.slice(0, 70)}
                                {item.message.length > 70 ? "..." : ""}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={statusConf.variant}
                            className="shrink-0"
                          >
                            {statusConf.label}
                          </Badge>
                        </div>
                        {item.adminNote?.trim() && (
                          <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-primary">
                              관리자 답변
                            </span>
                            <span className="ml-1.5">
                              {item.adminNote.slice(0, 80)}
                              {item.adminNote.length > 80 ? "..." : ""}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 문의 상세 다이얼로그 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailItem?.subject ||
                INQUIRY_TYPE_LABEL[detailItem?.type ?? "other"] ||
                "문의 상세"}
            </DialogTitle>
            <DialogDescription>
              {detailItem?.createdAt
                ? new Date(detailItem.createdAt).toLocaleString("ko-KR")
                : "시간 정보 없음"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                {INQUIRY_TYPE_LABEL[detailItem?.type ?? "other"] ??
                  detailItem?.type ??
                  "기타"}
              </Badge>
              <Badge
                variant={
                  STATUS_CONFIG[detailItem?.status ?? "open"]?.variant ??
                  "default"
                }
              >
                {STATUS_CONFIG[detailItem?.status ?? "open"]?.label ??
                  "처리 중"}
              </Badge>
            </div>

            <div className="rounded-xl border p-4 space-y-1.5 max-h-[200px] overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">
                문의 내용
              </p>
              <p className="whitespace-pre-line leading-relaxed">
                {detailItem?.message || "내용이 입력되지 않았습니다."}
              </p>
            </div>

            <div
              className={`rounded-xl p-4 space-y-1.5 max-h-[200px] overflow-y-auto ${
                detailItem?.adminNote?.trim()
                  ? "border border-primary/20 bg-primary/5"
                  : "border bg-muted/30"
              }`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                관리자 답변
              </p>
              <p className="whitespace-pre-line leading-relaxed">
                {detailItem?.adminNote?.trim() ||
                  "답변 대기 중입니다. 1~2 영업일 내 답변을 드릴게요."}
              </p>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={handleReopen}>
              재문의 하기
            </Button>
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InquiriesPage;
