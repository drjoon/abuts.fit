// change-log:
// - 2026-08-15: FAQ — 치과·기공소 가입 이유를 각각 재구성(배너 SSOT, 유형별 노출).
// - 2026-08-15: FAQ — 기공물 서비스·기공소 가입 이유 반영, 진행상태 항목 삭제.
// - 2026-08-15: FAQ 탭 라벨 단축·어벗츠 특징+크레딧 핵심만 정리.
// - 2026-08-15: 크레딧·기공료 선입금 FAQ를 내 문의 내역 옆 탭으로 이동(의뢰자).
// - 2026-08-15: lab_fee_item_add_request(기공비 항목 추가 요청) 라벨.
// - 2026-08-14: manufacturer_add_request(임플란트 추가 요청) 라벨.
// - 2026-08-13: ?type= 쿼리로 문의 유형 프리필.
// - 2026-08-12: 의뢰자 문의 화면에 기공료 선입금 FAQ 노출.
// - 2026-08-11: 크레딧 페이지와 동일하게 max-w-4xl·gradient·glass 카드 적용, 역할별 문의 유형 확장.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/components/SettingsScaffold.tsx
// - web/backend/models/businessRegistrationInquiry.model.js
// - web/backend/controllers/support/support.controller.js
// - web/frontend/src/shared/platform/platformBenefitsContent.ts
// 문의 페이지는 requestor, salesman, admin 역할에서만 사용됩니다.
// manufacturer(제조사)와 devops(개발운영사)는 문의 페이지가 불필요하며,
// 사이드메뉴 및 라우트 접근에서 제외되어 있습니다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { cn } from "@/shared/ui/cn";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Mail,
  MessageSquarePlus,
  Phone,
} from "lucide-react";

type RequestorFaqItem = {
  q: string;
  a: string;
  /** 미지정=공통. practice/lab은 해당 유형(또는 미확정)에만. */
  audience?: "practice" | "lab";
};

/** 의뢰자 문의 FAQ — 서비스·치과/기공소 가입 이유·크레딧 핵심.
 * 가입 이유 카피 SSOT: `platformBenefitsContent.ts` */
const REQUESTOR_FAQS: RequestorFaqItem[] = [
  {
    q: "어벗츠는 어떤 서비스인가요?",
    a: "치과·기공소가 기공물 제작과 커스텀 어벗먼트 의뢰·제작·배송을 한곳에서 관리하는 B2B 플랫폼입니다.",
  },
  {
    q: "치과가 어벗츠를 쓰는 이유는?",
    a: "기공의뢰·채팅으로 이메일 없이 소통하고, 크레딧·계산서·인증 기공소 매칭·커스텀어벗 디자인 생산까지 한곳에서 이어갑니다.",
    audience: "practice",
  },
  {
    q: "기공소가 어벗츠를 쓰는 이유는?",
    a: "의뢰 접수·채팅으로 이메일 없이 소통하고, 정산·계산서·커스텀어벗 생산 의뢰까지 한곳에서 이어갑니다.",
    audience: "lab",
  },
  {
    q: "크레딧은 선불페이인가요?",
    a: "아닙니다. B2B 거래 선수금(예치금)이며, 앱 내 기공·어벗(면세)과 스토어 기성품(과세) 대금으로 사용됩니다. (세금)계산서는 사용분 기준 월말 분리 발행입니다.",
  },
  {
    q: "남은 크레딧은 환불되나요?",
    a: "유료 잔액은 요청 시 전액 환불되고, 기발행 면세 계산서는 마이너스 수정 계산서로 처리됩니다. 무료·이벤트 크레딧은 제외입니다.",
  },
  {
    q: "부가세가 붙나요?",
    a: "없습니다. 면세로 운영되며, 충전 시 면세 계산서가 발행됩니다.",
  },
];

const faqVisibleForKind = (
  item: RequestorFaqItem,
  kind: "practice" | "lab" | null | undefined,
) => {
  if (!item.audience) return true;
  if (!kind) return true;
  return item.audience === kind;
};

export const INQUIRY_TYPE_LABEL: Record<string, string> = {
  manufacturing: "의뢰/제작",
  delivery: "배송",
  billing: "청구/결제",
  credit: "크레딧",
  design: "디자인",
  file_transfer: "파일전송/기공의뢰서",
  account: "계정/사업자",
  order_intake: "의뢰 접수",
  cam_machining: "가공",
  equipment: "장비/소프트웨어",
  packing: "패킹/출고",
  settlement: "정산",
  referral_commission: "소개/수당",
  partnership: "제휴/파트너십",
  operation: "운영",
  system: "시스템/오류",
  general: "일반",
  other: "기타",
  business_registration: "사업자등록",
  user_registration: "사용자등록",
  manufacturer_add_request: "임플란트 추가 요청",
  lab_fee_item_add_request: "기공비 항목 추가 요청",
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
      "제작, 배송, 결제, 크레딧, 계정 관련 문의를 접수하고 진행 상태를 확인하세요.",
    contactEmail: SUPPORT_EMAIL,
    contactLabel: "고객지원",
    typeChips: [
      { value: "manufacturing", label: "의뢰/제작" },
      { value: "delivery", label: "배송" },
      { value: "billing", label: "청구/결제" },
      { value: "credit", label: "크레딧" },
      { value: "design", label: "디자인" },
      { value: "file_transfer", label: "파일전송" },
      { value: "account", label: "계정/사업자" },
      { value: "system", label: "시스템/오류" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) 의뢰 배송상태 확인 요청",
    messagePlaceholder:
      "의뢰 번호, 환자명 등 관련 정보를 함께 남겨주시면 빠르게 처리해 드릴게요.",
  },
  manufacturer: {
    title: "제조 운영 중 도움이 필요한 사항을 알려주세요",
    description:
      "의뢰 처리, 가공, 장비, 패킹, 정산 등 제조 전반의 문의를 처리합니다.",
    contactEmail: SUPPORT_EMAIL,
    contactLabel: "제조 지원",
    typeChips: [
      { value: "order_intake", label: "의뢰 접수" },
      { value: "cam_machining", label: "가공" },
      { value: "equipment", label: "장비/소프트웨어" },
      { value: "packing", label: "패킹/출고" },
      { value: "settlement", label: "정산" },
      { value: "system", label: "시스템/오류" },
      { value: "other", label: "기타" },
    ],
    subjectPlaceholder: "예) Esprit NC 파일 생성 오류",
    messagePlaceholder:
      "의뢰 ID, 장비명, 오류 메시지 등 상황을 구체적으로 남겨주세요.",
  },
  salesman: {
    title: "영업 활동 중 생긴 이슈를 바로 알려주세요",
    description:
      "소개 수당, 정산, 제휴, 계정 관리, 운영 전반에 관한 문의를 빠르게 처리합니다.",
    contactEmail: "sales@abuts.fit",
    contactLabel: "영업 지원",
    typeChips: [
      { value: "referral_commission", label: "소개/수당" },
      { value: "billing", label: "정산/지급" },
      { value: "partnership", label: "제휴/파트너" },
      { value: "account", label: "계정 관리" },
      { value: "operation", label: "운영 일반" },
      { value: "system", label: "시스템/오류" },
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
      { value: "billing", label: "청구/결제" },
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
  const [activeTab, setActiveTab] = useState<"new" | "history" | "faq">("new");
  const showFaq = user?.role === "requestor";
  const visibleFaqs = useMemo(
    () =>
      REQUESTOR_FAQS.filter((item) =>
        faqVisibleForKind(item, user?.requestorKind),
      ),
    [user?.requestorKind],
  );
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
      setType(presetType);
    }

    if (presetSubject || presetMessage || presetType || shouldFocusMessage) {
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
    <div className="min-h-screen bg-gradient-subtle p-2 sm:p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* 헤더 배너 */}
        <Card className="app-glass-card app-glass-card--lg border-primary-muted bg-gradient-to-br from-white via-white to-primary-soft/60">
          <CardContent className="app-glass-card-content px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary-strong">
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  {preset.title}
                </div>
                <p className="text-xs text-primary-strong/70">
                  {preset.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`tel:${COMPANY_PHONE.replace(/[^0-9+]/g, "")}`}
                  className="flex items-center gap-1.5 rounded-xl border border-primary-muted bg-white/70 px-3 py-1.5 text-xs font-medium text-primary-strong transition hover:bg-primary-soft"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {COMPANY_PHONE}
                </a>
                <button
                  type="button"
                  onClick={openEmail}
                  className="flex items-center gap-1.5 rounded-xl border border-primary-muted bg-white/70 px-3 py-1.5 text-xs font-medium text-primary-strong transition hover:bg-primary-soft"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {preset.contactLabel}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 탭: 새 문의 / 내 문의 내역 / (의뢰자) FAQ */}
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(v as "new" | "history" | "faq")
          }
          className="space-y-4"
        >
          <TabsList className="flex h-auto w-full flex-wrap gap-1.5 px-1.5 py-1.5">
            <TabsTrigger
              value="new"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              <MessageSquarePlus className="h-4 w-4" />새 문의 작성
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
            >
              {stats.open > 0 ? (
                <Clock className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              내 문의 내역
              {stats.total > 0 && (
                <span className="ml-0.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-strong">
                  {stats.total}
                </span>
              )}
            </TabsTrigger>
            {showFaq ? (
              <TabsTrigger
                value="faq"
                className="flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5"
              >
                FAQ
              </TabsTrigger>
            ) : null}
          </TabsList>

          {/* 새 문의 작성 탭 */}
          <TabsContent value="new">
            <Card className="app-glass-card app-glass-card--lg">
              <CardContent className="app-glass-card-content space-y-5 py-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    문의 유형
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {preset.typeChips.map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setType(chip.value)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                          type === chip.value
                            ? "border-primary bg-primary-soft text-primary-strong ring-1 ring-primary/40"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:bg-primary-soft/40 hover:text-foreground",
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    제목{" "}
                    <span className="text-muted-foreground/60">(선택)</span>
                  </p>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={preset.subjectPlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    문의 내용{" "}
                    <span className="text-destructive/80 text-xs">*</span>
                  </p>
                  <Textarea
                    ref={messageRef}
                    rows={7}
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
            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">내 문의 내역</CardTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {loading
                        ? "불러오는 중..."
                        : `전체 ${stats.total}건 · 처리 중 ${stats.open}건 · 완료 ${stats.resolved}건`}
                    </p>
                  </div>
                  {stats.total > 0 && (
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="app-surface app-surface--panel min-w-[56px] px-3 py-2 text-center">
                        <p className="text-xs text-muted-foreground">처리 중</p>
                        <p className="text-xl font-bold leading-tight">
                          {stats.open}
                        </p>
                      </div>
                      <div className="app-surface app-surface--panel min-w-[56px] px-3 py-2 text-center">
                        <p className="text-xs text-muted-foreground">완료</p>
                        <p className="text-xl font-bold leading-tight">
                          {stats.resolved}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="app-glass-card-content">
                {sortedItems.length === 0 && !loading ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200/90 py-12 text-center">
                    <MessageSquarePlus className="h-8 w-8 text-muted-foreground/30" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        아직 접수된 문의가 없습니다
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/60">
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
                          className="app-surface app-surface--item w-full text-left hover:border-primary/70 hover:bg-primary-soft/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className="border-primary-muted bg-primary-soft text-xs text-primary-strong"
                                >
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
                              <p className="mt-1.5 truncate font-medium">
                                {item.subject || typeLabel}
                              </p>
                              {item.message && (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {item.message.slice(0, 90)}
                                  {item.message.length > 90 ? "..." : ""}
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
                            <div className="mt-3 rounded-xl border border-primary-muted bg-primary-soft/70 px-3 py-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-primary-strong">
                                관리자 답변
                              </span>
                              <span className="ml-1.5">
                                {item.adminNote.slice(0, 100)}
                                {item.adminNote.length > 100 ? "..." : ""}
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

          {showFaq ? (
            <TabsContent value="faq">
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">FAQ</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Accordion type="multiple" className="w-full">
                    {visibleFaqs.map((item, index) => (
                      <AccordionItem key={item.q} value={`faq-${index}`}>
                        <AccordionTrigger className="text-left text-sm hover:no-underline">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  <p className="mt-3 text-xs text-muted-foreground">
                    더 자세한 안내는{" "}
                    <Link to="/help" className="underline underline-offset-2">
                      도움말 센터
                    </Link>
                    와 이용약관 제7조를 확인해 주세요.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>

        {/* 문의 상세 다이얼로그 */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="w-[min(512px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-primary-soft/40 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary-muted bg-primary-soft text-primary-strong">
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

              <div className="app-surface app-surface--item max-h-[200px] space-y-1.5 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground">
                  문의 내용
                </p>
                <p className="whitespace-pre-line leading-relaxed">
                  {detailItem?.message || "내용이 입력되지 않았습니다."}
                </p>
              </div>

              <div
                className={cn(
                  "max-h-[200px] space-y-1.5 overflow-y-auto rounded-xl p-3",
                  detailItem?.adminNote?.trim()
                    ? "border border-primary-muted bg-primary-soft/70"
                    : "app-surface app-surface--item",
                )}
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
    </div>
  );
};

export default InquiriesPage;
