// related files:
// - web/frontend/rules.md
// - web/backend/controllers/admin/adminSms.controller.js
// - web/backend/models/adminSmsTemplate.model.js
// - web/backend/controllers/admin/admin.users.controller.js
// - web/backend/controllers/admin/adminCredit.controller.js
import { useEffect, useState, useCallback, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Phone,
  Send,
  History,
  MessageCircle,
  Building2,
  Users,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";

type SmsHistoryItem = {
  id: string;
  to: string;
  body: string;
  status: "SENT" | "FAILED" | "QUEUED" | "PENDING";
  createdAt: string;
};

type SmsTemplate = {
  id: string;
  name: string;
  body: string;
  emphasizeTitle: string;
  code: string;
  kakaoTemplateCode: string;
  isSystem: boolean;
  active: boolean;
};

type PopbillAtsTemplate = {
  templateCode: string;
  templateName: string;
  template: string;
};

type RecipientCandidate = {
  key: string;
  source: "user" | "business";
  id: string;
  name: string;
  subtitle: string;
  phone: string;
  phoneDisplay: string;
};

type SelectedRecipient = {
  key: string;
  phone: string;
  label: string;
  source: "user" | "business" | "manual";
};

/** 숫자만 남기고 +82 → 0 변환 */
const toLocalDigits = (raw: string): string => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
};

/** 한국 휴대폰만 (유선/인터넷전화 제외): 01[016789] + 7~8자리 */
const isKoreanMobilePhone = (raw: string): boolean => {
  const digits = toLocalDigits(raw);
  return /^01[016789]\d{7,8}$/.test(digits);
};

const formatPhoneDisplay = (raw: string): string => {
  const digits = toLocalDigits(raw);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || String(raw || "").trim();
};

const mapTemplate = (t: any): SmsTemplate => ({
  id: String(t?._id || t?.id || ""),
  name: String(t?.name || "").trim(),
  body: String(t?.body || ""),
  emphasizeTitle: String(t?.emphasizeTitle || "").trim(),
  code: String(t?.code || ""),
  kakaoTemplateCode: String(t?.kakaoTemplateCode || "").trim(),
  isSystem: Boolean(t?.isSystem),
  active: t?.active !== false,
});

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
    case "PENDING":
    default:
      return <Badge variant="secondary">대기</Badge>;
  }
};

export default function AdminSmsPage() {
  const [tab, setTab] = useState<"send" | "history">("send");
  const [manualTo, setManualTo] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<
    SelectedRecipient[]
  >([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [useKakao, setUseKakao] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [history, setHistory] = useState<SmsHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"business" | "user">("business");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [businessCandidates, setBusinessCandidates] = useState<
    RecipientCandidate[]
  >([]);
  const [userCandidates, setUserCandidates] = useState<RecipientCandidate[]>(
    [],
  );
  const [pickerDraftKeys, setPickerDraftKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const [templateManageOpen, setTemplateManageOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [templateFormName, setTemplateFormName] = useState("");
  const [templateFormBody, setTemplateFormBody] = useState("");
  const [templateFormKakaoCode, setTemplateFormKakaoCode] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [popbillTemplates, setPopbillTemplates] = useState<PopbillAtsTemplate[]>(
    [],
  );
  const [popbillTemplatesLoading, setPopbillTemplatesLoading] = useState(false);
  const [popbillTemplatesError, setPopbillTemplatesError] = useState("");

  const { token } = useAuthStore();
  const { toast } = useToast();

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await request<any>({
        path: "/api/admin/sms/history?page=1&limit=20",
        method: "GET",
        token,
      });
      const payload = res.data || {};
      const rows = (payload.data || []) as any[];
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
  }, [token]);

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setTemplatesLoading(true);
    setTemplatesError("");
    try {
      const res = await request<any>({
        path: "/api/admin/sms/templates",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setTemplates([]);
        setTemplatesError(
          (res.data as any)?.message || "템플릿을 불러오지 못했습니다.",
        );
        return;
      }
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setTemplates(rows.map(mapTemplate).filter((t: SmsTemplate) => !!t.id));
    } catch (err: any) {
      setTemplates([]);
      setTemplatesError(err?.message || "템플릿을 불러오지 못했습니다.");
    } finally {
      setTemplatesLoading(false);
    }
  }, [token]);

  const loadPopbillTemplates = useCallback(async () => {
    if (!token) return;
    setPopbillTemplatesLoading(true);
    setPopbillTemplatesError("");
    try {
      const res = await request<any>({
        path: "/api/admin/kakao/templates",
        method: "GET",
        token,
      });
      if (!res.ok) {
        setPopbillTemplates([]);
        setPopbillTemplatesError(
          (res.data as any)?.message ||
            (res.data as any)?.error ||
            "팝빌 알림톡 템플릿을 불러오지 못했습니다.",
        );
        return;
      }
      const rows = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
      const mapped: PopbillAtsTemplate[] = rows
        .map((t: any) => ({
          templateCode: String(t?.templateCode || "").trim(),
          templateName: String(
            t?.templateName || t?.templateCode || "",
          ).trim(),
          template: String(t?.template || t?.content || ""),
        }))
        .filter((t: PopbillAtsTemplate) => !!t.templateCode);
      setPopbillTemplates(mapped);
    } catch (err: any) {
      setPopbillTemplates([]);
      setPopbillTemplatesError(
        err?.message || "팝빌 알림톡 템플릿을 불러오지 못했습니다.",
      );
    } finally {
      setPopbillTemplatesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadHistory();
    void loadTemplates();
  }, [loadHistory, loadTemplates]);

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) return;
    const found = templates.find((t) => t.id === id);
    if (found?.body) setBody(found.body);
  };

  const applyPopbillTemplateCode = (code: string) => {
    const normalized = code === "__none__" ? "" : code;
    setTemplateFormKakaoCode(normalized);
    if (!normalized) return;
    const found = popbillTemplates.find((t) => t.templateCode === normalized);
    if (!found) return;
    if (!templateFormName.trim()) {
      setTemplateFormName(found.templateName || found.templateCode);
    }
    if (found.template) {
      setTemplateFormBody(found.template);
    }
  };

  const openTemplateCreate = () => {
    setEditingTemplateId(null);
    setTemplateFormName("");
    setTemplateFormBody(body || "");
    setTemplateFormKakaoCode("");
    setTemplateManageOpen(true);
    void loadPopbillTemplates();
  };

  const openTemplateEdit = (tpl?: SmsTemplate | null) => {
    const target = tpl || selectedTemplate;
    if (!target) {
      toast({
        title: "편집할 템플릿을 선택하세요",
        variant: "destructive",
      });
      return;
    }
    setEditingTemplateId(target.id);
    setTemplateFormName(target.name);
    setTemplateFormBody(target.body);
    setTemplateFormKakaoCode(target.kakaoTemplateCode);
    setTemplateManageOpen(true);
    void loadPopbillTemplates();
  };

  const saveTemplate = async () => {
    if (!token) return;
    const name = templateFormName.trim();
    const content = templateFormBody.trim();
    if (!name || !content) {
      toast({
        title: "이름과 내용을 입력하세요",
        variant: "destructive",
      });
      return;
    }
    setTemplateSaving(true);
    try {
      const isEdit = !!editingTemplateId;
      const res = await request<any>({
        path: isEdit
          ? `/api/admin/sms/templates/${encodeURIComponent(editingTemplateId!)}`
          : "/api/admin/sms/templates",
        method: isEdit ? "PUT" : "POST",
        token,
        jsonBody: {
          name,
          body: content,
          kakaoTemplateCode: templateFormKakaoCode.trim(),
        },
      });
      if (!res.ok) {
        toast({
          title: isEdit ? "템플릿 수정 실패" : "템플릿 추가 실패",
          description: (res.data as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const saved = mapTemplate(res.data?.data || {});
      toast({ title: isEdit ? "템플릿을 저장했습니다" : "템플릿을 추가했습니다" });
      setTemplateManageOpen(false);
      await loadTemplates();
      if (saved.id) {
        setSelectedTemplateId(saved.id);
        setBody(saved.body);
      }
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (tpl: SmsTemplate) => {
    if (!token || tpl.isSystem) return;
    const res = await request<any>({
      path: `/api/admin/sms/templates/${encodeURIComponent(tpl.id)}`,
      method: "DELETE",
      token,
    });
    if (!res.ok) {
      toast({
        title: "삭제 실패",
        description: (res.data as any)?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "템플릿을 삭제했습니다" });
    if (selectedTemplateId === tpl.id) {
      setSelectedTemplateId("");
    }
    if (editingTemplateId === tpl.id) {
      setTemplateManageOpen(false);
    }
    await loadTemplates();
  };

  const loadRecipientCandidates = useCallback(async () => {
    if (!token) return;
    setPickerLoading(true);
    try {
      const [bizRes, userRes] = await Promise.all([
        request<any>({
          path: "/api/admin/credits/businesses?limit=200&skip=0",
          method: "GET",
          token,
        }),
        request<any>({
          path: "/api/admin/users?page=1&limit=200",
          method: "GET",
          token,
        }),
      ]);

      const bizItems: any[] = Array.isArray(bizRes.data?.data?.items)
        ? bizRes.data.data.items
        : Array.isArray(bizRes.data?.data)
          ? bizRes.data.data
          : [];
      const bizMapped: RecipientCandidate[] = bizItems
        .map((b) => {
          const phoneRaw = String(b?.phoneNumber || "").trim();
          if (!isKoreanMobilePhone(phoneRaw)) return null;
          const phone = toLocalDigits(phoneRaw);
          const id = String(b?._id || b?.businessAnchorId || "");
          const name =
            String(b?.companyName || b?.name || "").trim() || "사업자";
          const bn = String(b?.businessNumber || "").trim();
          return {
            key: `business:${id}:${phone}`,
            source: "business" as const,
            id,
            name,
            subtitle: bn || "사업자",
            phone,
            phoneDisplay: formatPhoneDisplay(phone),
          };
        })
        .filter(Boolean) as RecipientCandidate[];

      const userItems: any[] = Array.isArray(userRes.data?.data?.users)
        ? userRes.data.data.users
        : [];
      const userMapped: RecipientCandidate[] = userItems
        .map((u) => {
          const phoneRaw = String(u?.phoneNumber || "").trim();
          if (!isKoreanMobilePhone(phoneRaw)) return null;
          const phone = toLocalDigits(phoneRaw);
          const id = String(u?._id || u?.id || "");
          const name = String(u?.name || "").trim() || "사용자";
          const email = String(u?.email || "").trim();
          const role = String(u?.role || "").trim();
          return {
            key: `user:${id}:${phone}`,
            source: "user" as const,
            id,
            name,
            subtitle: [role, email].filter(Boolean).join(" · ") || "사용자",
            phone,
            phoneDisplay: formatPhoneDisplay(phone),
          };
        })
        .filter(Boolean) as RecipientCandidate[];

      setBusinessCandidates(bizMapped);
      setUserCandidates(userMapped);
    } finally {
      setPickerLoading(false);
    }
  }, [token]);

  const openRecipientPicker = async () => {
    setPickerTab("business");
    setPickerSearch("");
    setPickerDraftKeys(
      new Set(
        selectedRecipients
          .filter((r) => r.source !== "manual")
          .map((r) => r.key),
      ),
    );
    setPickerOpen(true);
    if (!businessCandidates.length && !userCandidates.length) {
      await loadRecipientCandidates();
    }
  };

  const filteredCandidates = useMemo(() => {
    const list =
      pickerTab === "business" ? businessCandidates : userCandidates;
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const hay =
        `${c.name} ${c.subtitle} ${c.phone} ${c.phoneDisplay}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pickerTab, businessCandidates, userCandidates, pickerSearch]);

  const togglePickerDraft = (key: string) => {
    setPickerDraftKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmPickerSelection = () => {
    const all = [...businessCandidates, ...userCandidates];
    const byKey = new Map(all.map((c) => [c.key, c]));
    const fromPicker: SelectedRecipient[] = [];
    for (const key of pickerDraftKeys) {
      const c = byKey.get(key);
      if (!c) continue;
      fromPicker.push({
        key: c.key,
        phone: c.phone,
        label: `${c.name} (${c.phoneDisplay})`,
        source: c.source,
      });
    }
    setSelectedRecipients((prev) => {
      const manuals = prev.filter((r) => r.source === "manual");
      const phoneSet = new Set(fromPicker.map((r) => r.phone));
      return [...fromPicker, ...manuals.filter((m) => !phoneSet.has(m.phone))];
    });
    setPickerOpen(false);
  };

  const removeSelectedRecipient = (key: string) => {
    setSelectedRecipients((prev) => prev.filter((r) => r.key !== key));
  };

  const resolveRecipients = (): { phones: string[]; skipped: number } => {
    const phoneSet = new Set<string>();
    for (const r of selectedRecipients) {
      if (isKoreanMobilePhone(r.phone)) phoneSet.add(toLocalDigits(r.phone));
    }
    const manualParts = manualTo
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    let skipped = 0;
    for (const part of manualParts) {
      const digits = toLocalDigits(part);
      if (isKoreanMobilePhone(digits)) {
        phoneSet.add(digits);
      } else {
        skipped += 1;
      }
    }
    return { phones: Array.from(phoneSet), skipped };
  };

  const sendSms = async () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }
    const { phones, skipped } = resolveRecipients();
    if (!phones.length || !body.trim()) {
      toast({
        title: "수신자/내용을 입력하세요",
        description:
          skipped > 0
            ? `유선전화 등 휴대폰이 아닌 번호 ${skipped}건은 제외됩니다.`
            : "사업자/사용자 선택 또는 휴대폰 번호를 입력하세요.",
        variant: "destructive",
      });
      return;
    }
    if (skipped > 0) {
      toast({
        title: "유선전화 번호 제외",
        description: `휴대폰이 아닌 번호 ${skipped}건은 발송 대상에서 제외했습니다.`,
      });
    }
    const kakaoCode = useKakao
      ? selectedTemplate?.kakaoTemplateCode || ""
      : "";
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
          to: phones,
          text: body,
          templateCode: kakaoCode || undefined,
          useKakao: useKakao && !!kakaoCode,
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
      toast({
        title: "발송 완료",
        description: `${phones.length}명에게 발송 요청했습니다.`,
      });
      setBody("");
      setManualTo("");
      setSelectedRecipients([]);
      setSelectedTemplateId("");
      void loadHistory();
    } finally {
      setSending(false);
    }
  };

  const canSend =
    !sending &&
    !!body.trim() &&
    (selectedRecipients.length > 0 || !!manualTo.trim());

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
                템플릿과 수신 휴대폰 번호를 선택하세요. 유선전화는 제외됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="useKakao"
                  checked={useKakao}
                  onCheckedChange={(v) => setUseKakao(v === true)}
                />
                <label htmlFor="useKakao" className="text-sm font-medium">
                  <MessageCircle className="h-4 w-4 inline mr-1" />
                  카카오톡 알림톡 우선 전송 (팝빌 코드가 있는 템플릿만, 실패 시
                  SMS 대체)
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">템플릿 선택</label>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={openTemplateCreate}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        추가
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openTemplateEdit()}
                        disabled={!selectedTemplate}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        편집
                      </Button>
                    </div>
                  </div>
                  <Select
                    value={selectedTemplateId || "__none__"}
                    onValueChange={(v) =>
                      applyTemplate(v === "__none__" ? "" : v)
                    }
                    disabled={templatesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="템플릿 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">템플릿 선택</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.isSystem ? " (기본)" : ""}
                          {t.kakaoTemplateCode ? " · 알림톡" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templatesLoading && (
                    <div className="text-xs text-muted-foreground">
                      템플릿 불러오는 중...
                    </div>
                  )}
                  {!templatesLoading && templatesError && (
                    <div className="text-xs text-destructive">
                      {templatesError}
                    </div>
                  )}
                  {!templatesLoading &&
                    !templatesError &&
                    templates.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        저장된 템플릿이 없습니다. 추가해 주세요.
                      </div>
                    )}
                </div>

                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium">수신자</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => void openRecipientPicker()}
                    >
                      선택
                    </Button>
                  </div>
                  {selectedRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 content-start">
                      {selectedRecipients.map((r) => (
                        <Badge
                          key={r.key}
                          variant="secondary"
                          className="gap-1 pr-1 font-normal"
                        >
                          <span className="max-w-[180px] truncate">
                            {r.label}
                          </span>
                          <button
                            type="button"
                            className="rounded-sm p-0.5 hover:bg-muted"
                            onClick={() => removeSelectedRecipient(r.key)}
                            aria-label={`${r.label} 제거`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Input
                    placeholder="직접 입력 (예: 01012345678 · 휴대폰만)"
                    value={manualTo}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setManualTo(e.target.value)
                    }
                  />
                </div>
              </div>

              <Textarea
                placeholder="템플릿을 선택하면 내용이 채워집니다. #{변수}를 실제 값으로 바꾸세요."
                value={body}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setBody(e.target.value)
                }
                rows={6}
              />
              {selectedTemplate?.emphasizeTitle && (
                <div className="text-xs text-muted-foreground">
                  강조표기 타이틀(팝빌 등록용): {selectedTemplate.emphasizeTitle}
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={sendSms} disabled={!canSend}>
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

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>수신자 선택</DialogTitle>
            <DialogDescription>
              휴대폰 번호가 등록된 사업자/사용자만 표시됩니다. 유선전화는
              제외됩니다.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={pickerTab}
            onValueChange={(v) => setPickerTab(v as "business" | "user")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="business" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                사업자 ({businessCandidates.length})
              </TabsTrigger>
              <TabsTrigger value="user" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                사용자 ({userCandidates.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="이름·번호·이메일 검색"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border rounded-md divide-y max-h-[360px]">
            {pickerLoading && (
              <div className="p-4 text-sm text-muted-foreground">
                불러오는 중...
              </div>
            )}
            {!pickerLoading && filteredCandidates.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                휴대폰 번호가 있는 대상이 없습니다.
              </div>
            )}
            {!pickerLoading &&
              filteredCandidates.map((c) => {
                const checked = pickerDraftKeys.has(c.key);
                return (
                  <label
                    key={c.key}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePickerDraft(c.key)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.subtitle}
                      </div>
                      <div className="text-xs font-mono mt-0.5">
                        {c.phoneDisplay}
                      </div>
                    </div>
                  </label>
                );
              })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <div className="mr-auto text-xs text-muted-foreground self-center">
              {pickerDraftKeys.size}명 선택
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(false)}
            >
              취소
            </Button>
            <Button type="button" onClick={confirmPickerSelection}>
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateManageOpen} onOpenChange={setTemplateManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? "템플릿 편집" : "템플릿 추가"}
            </DialogTitle>
            <DialogDescription>
              서버에 저장해 두고 재사용합니다. 알림톡은 팝빌에 승인된
              템플릿 코드(12자리)가 필요합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">이름</label>
              <Input
                value={templateFormName}
                onChange={(e) => setTemplateFormName(e.target.value)}
                placeholder="예: 배송 안내"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">내용</label>
              <Textarea
                value={templateFormBody}
                onChange={(e) => setTemplateFormBody(e.target.value)}
                rows={7}
                placeholder="[어벗츠] 메시지 내용"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">
                  팝빌 알림톡 코드 (선택)
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void loadPopbillTemplates()}
                  disabled={popbillTemplatesLoading}
                >
                  새로고침
                </Button>
              </div>
              <Select
                value={templateFormKakaoCode || "__none__"}
                onValueChange={applyPopbillTemplateCode}
                disabled={popbillTemplatesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="팝빌 승인 템플릿 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">사용 안 함 (SMS/LMS)</SelectItem>
                  {templateFormKakaoCode &&
                    !popbillTemplates.some(
                      (t) => t.templateCode === templateFormKakaoCode,
                    ) && (
                      <SelectItem value={templateFormKakaoCode}>
                        {templateFormKakaoCode} (저장됨)
                      </SelectItem>
                    )}
                  {popbillTemplates.map((t) => (
                    <SelectItem key={t.templateCode} value={t.templateCode}>
                      {t.templateName} ({t.templateCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {popbillTemplatesLoading && (
                <div className="text-xs text-muted-foreground">
                  팝빌 승인 템플릿 불러오는 중...
                </div>
              )}
              {!popbillTemplatesLoading && popbillTemplatesError && (
                <div className="text-xs text-destructive">
                  {popbillTemplatesError}
                </div>
              )}
              {!popbillTemplatesLoading &&
                !popbillTemplatesError &&
                popbillTemplates.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    승인된 알림톡 템플릿이 없습니다. 팝빌사이트 또는
                    GetATSTemplateMgtURL로 템플릿을 등록·승인하세요.
                  </div>
                )}
              <div className="text-[11px] text-muted-foreground">
                코드는 팝빌 ListATSTemplate 기준으로 조회됩니다. 발송 내용은
                승인 템플릿과 변수만 다르게 맞춰야 합니다.
              </div>
            </div>
            {editingTemplateId &&
              (() => {
                const editing = templates.find((t) => t.id === editingTemplateId);
                if (!editing) return null;
                if (editing.isSystem) {
                  return (
                    <div className="text-xs text-muted-foreground">
                      기본 템플릿은 내용 수정은 가능하고 삭제는 할 수 없습니다.
                    </div>
                  );
                }
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive px-0"
                    onClick={() => void deleteTemplate(editing)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    이 템플릿 삭제
                  </Button>
                );
              })()}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTemplateManageOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => void saveTemplate()}
              disabled={templateSaving}
            >
              {templateSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
