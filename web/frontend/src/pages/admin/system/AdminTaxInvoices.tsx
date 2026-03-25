import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  FileText,
  RefreshCw,
  Search,
  Plus,
  AlertTriangle,
  PenLine,
  Upload,
} from "lucide-react";
import {
  BizRegOcrUploader,
  type BizRegExtracted,
  type BizVerifyResult,
} from "@/shared/components/business/BizRegOcrUploader";

type DraftStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT"
  | "FAILED"
  | "CANCELLED";

type TaxInvoiceDraft = {
  _id: string;
  chargeOrderId: string;
  businessAnchorId?: string;
  status: DraftStatus;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  hometaxTrxId?: string | null;
  attemptCount?: number;
  buyer?: {
    bizNo?: string;
    corpName?: string;
    ceoName?: string;
    addr?: string;
    bizType?: string;
    bizClass?: string;
    contactName?: string;
    contactEmail?: string;
    contactTel?: string;
  };
  failReason?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type EditForm = {
  bizNo: string;
  corpName: string;
  ceoName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  contactName: string;
  contactEmail: string;
  contactTel: string;
  supplyAmount: string;
  vatAmount: string;
  totalAmount: string;
};

const STATUS_TABS: DraftStatus[] = ["SENT", "FAILED", "CANCELLED"];

const STATUS_LABEL: Record<DraftStatus, string> = {
  PENDING_APPROVAL: "승인대기",
  APPROVED: "승인됨",
  SENT: "발행완료",
  FAILED: "발행실패",
  REJECTED: "반려",
  CANCELLED: "취소",
};

function fmtMoney(n: number) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString("ko-KR") : "0";
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function StatusBadge({ status }: { status: DraftStatus }) {
  const map: Record<DraftStatus, string> = {
    PENDING_APPROVAL: "bg-yellow-100 text-yellow-800 border-yellow-200",
    APPROVED: "bg-blue-100 text-blue-800 border-blue-200",
    SENT: "bg-green-100 text-green-800 border-green-200",
    FAILED: "bg-red-100 text-red-800 border-red-200",
    REJECTED: "bg-gray-100 text-gray-700 border-gray-200",
    CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <Badge className={`text-xs ${map[status] || ""}`}>
      {STATUS_LABEL[status] || status}
    </Badge>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className || ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <Input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        className="h-8 text-sm placeholder:text-slate-300"
      />
    </div>
  );
}

export const AdminTaxInvoices = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<DraftStatus>("SENT");
  const [items, setItems] = useState<TaxInvoiceDraft[]>([]);
  const [stats, setStats] = useState<Partial<Record<DraftStatus, number>>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<TaxInvoiceDraft | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    bizNo: "",
    corpName: "",
    ceoName: "",
    addr: "",
    bizType: "",
    bizClass: "",
    contactName: "",
    contactEmail: "",
    contactTel: "",
    supplyAmount: "",
    vatAmount: "",
    totalAmount: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualCreating, setManualCreating] = useState(false);
  const [manualInputMode, setManualInputMode] = useState<"ocr" | "manual">(
    "ocr",
  );
  const [issueForm, setIssueForm] = useState({
    bizNo: "",
    corpName: "",
    ceoName: "",
    addr: "",
    bizType: "",
    bizClass: "",
    contactName: "",
    contactEmail: "",
    contactTel: "",
    supplyAmount: "",
    vatAmount: "",
    totalAmount: "",
    writeDate: new Date().toISOString().slice(0, 10),
    itemName: "서비스 이용료",
  });
  const [bizVerified, setBizVerified] = useState<BizVerifyResult | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<any>({
        path: "/api/admin/tax-invoices/stats",
        method: "GET",
        token,
      });
      if (res.ok) setStats((res.data as any)?.data || {});
    } catch {}
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: tab });
      if (debouncedSearch) qs.set("search", debouncedSearch);
      const res = await request<any>({
        path: `/api/admin/tax-invoices/drafts?${qs}`,
        method: "GET",
        token,
      });
      if (res.ok) {
        const data = (res.data as any)?.data ?? res.data ?? [];
        setItems(Array.isArray(data) ? data : []);
      } else {
        toast({
          title: "목록 조회 실패",
          variant: "destructive",
          duration: 4000,
        });
      }
    } catch {
      toast({
        title: "목록 조회 실패",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [token, tab, debouncedSearch, toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const reload = useCallback(async () => {
    await Promise.all([loadStats(), loadItems()]);
  }, [loadStats, loadItems]);

  const postAction = useCallback(
    async ({
      id,
      action,
      body,
    }: {
      id: string;
      action: string;
      body?: Record<string, unknown>;
    }) => {
      if (!token) return;
      setActionLoadingId(id);
      try {
        const res = await request<any>({
          path: `/api/admin/tax-invoices/drafts/${id}/${action}`,
          method: "POST",
          token,
          jsonBody: body,
        });
        if (!res.ok) {
          toast({
            title: "처리 실패",
            description:
              (res.data as any)?.message || "잠시 후 다시 시도해주세요.",
            variant: "destructive",
            duration: 5000,
          });
          return;
        }
        const msgMap: Record<string, string> = {
          cancel: "취소 처리됨",
          issue: "팝빌 발행 완료",
        };
        toast({ title: msgMap[action] || "처리 완료", duration: 3000 });
        await reload();
      } catch {
        toast({
          title: "처리 실패",
          variant: "destructive",
          duration: 4000,
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [token, toast, reload],
  );

  const openEdit = (d: TaxInvoiceDraft) => {
    setEditDraft(d);
    setEditForm({
      bizNo: d.buyer?.bizNo || "",
      corpName: d.buyer?.corpName || "",
      ceoName: d.buyer?.ceoName || "",
      addr: d.buyer?.addr || "",
      bizType: d.buyer?.bizType || "",
      bizClass: d.buyer?.bizClass || "",
      contactName: d.buyer?.contactName || "",
      contactEmail: d.buyer?.contactEmail || "",
      contactTel: d.buyer?.contactTel || "",
      supplyAmount: String(d.supplyAmount || ""),
      vatAmount: String(d.vatAmount || ""),
      totalAmount: String(d.totalAmount || ""),
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editDraft || !token) return;
    setEditSaving(true);
    try {
      const res = await request<any>({
        path: `/api/admin/tax-invoices/drafts/${editDraft._id}`,
        method: "PATCH",
        token,
        jsonBody: {
          buyer: {
            bizNo: editForm.bizNo,
            corpName: editForm.corpName,
            ceoName: editForm.ceoName,
            addr: editForm.addr,
            bizType: editForm.bizType,
            bizClass: editForm.bizClass,
            contactName: editForm.contactName,
            contactEmail: editForm.contactEmail,
            contactTel: editForm.contactTel,
          },
          ...(editForm.supplyAmount
            ? { supplyAmount: Number(editForm.supplyAmount) }
            : {}),
          ...(editForm.vatAmount
            ? { vatAmount: Number(editForm.vatAmount) }
            : {}),
          ...(editForm.totalAmount
            ? { totalAmount: Number(editForm.totalAmount) }
            : {}),
        },
      });
      if (!res.ok) {
        toast({ title: "수정 실패", variant: "destructive", duration: 4000 });
        return;
      }
      toast({ title: "수정 완료", duration: 3000 });
      setEditOpen(false);
      await reload();
    } catch {
      toast({ title: "수정 실패", variant: "destructive", duration: 4000 });
    } finally {
      setEditSaving(false);
    }
  };

  const resetIssueForm = () => {
    setIssueForm({
      bizNo: "",
      corpName: "",
      ceoName: "",
      addr: "",
      bizType: "",
      bizClass: "",
      contactName: "",
      contactEmail: "",
      contactTel: "",
      supplyAmount: "",
      vatAmount: "",
      totalAmount: "",
      writeDate: new Date().toISOString().slice(0, 10),
      itemName: "서비스 이용료",
    });
    setBizVerified(null);
    setManualInputMode("ocr");
  };

  const handleOcrExtracted = (
    data: BizRegExtracted,
    verify: BizVerifyResult | null,
  ) => {
    setIssueForm((f) => ({
      ...f,
      bizNo: data.businessNumber,
      corpName: data.companyName,
      ceoName: data.representativeName,
      addr: data.address,
      bizType: data.bizType,
      bizClass: data.bizClass,
      contactEmail: data.email,
      contactTel: data.phoneNumber,
    }));
    setBizVerified(verify);
  };

  const setIf =
    (key: keyof typeof issueForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setIssueForm((f) => ({ ...f, [key]: e.target.value }));

  const manualCreate = async () => {
    if (!token) return;
    if (!issueForm.bizNo.trim() || !issueForm.corpName.trim()) {
      toast({
        title: "사업자번호와 상호는 필수입니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    if (!issueForm.supplyAmount || !issueForm.totalAmount) {
      toast({
        title: "공급가액과 합계금액을 입력해주세요",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    setManualCreating(true);
    try {
      const res = await request<any>({
        path: "/api/admin/tax-invoices/direct-issue",
        method: "POST",
        token,
        jsonBody: {
          buyer: {
            bizNo: issueForm.bizNo.replace(/-/g, ""),
            corpName: issueForm.corpName,
            ceoName: issueForm.ceoName,
            addr: issueForm.addr,
            bizType: issueForm.bizType,
            bizClass: issueForm.bizClass,
            contactName: issueForm.contactName,
            contactEmail: issueForm.contactEmail,
            contactTel: issueForm.contactTel,
          },
          supplyAmount: Number(issueForm.supplyAmount) || 0,
          vatAmount: Number(issueForm.vatAmount) || 0,
          totalAmount: Number(issueForm.totalAmount) || 0,
          writeDate: issueForm.writeDate,
          itemName: issueForm.itemName,
        },
      });
      if (!res.ok) {
        toast({
          title: "발행 실패",
          description:
            (res.data as any)?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      toast({ title: "세금계산서 발행 완료", duration: 3000 });
      setManualOpen(false);
      resetIssueForm();
      await reload();
    } catch {
      toast({ title: "발행 실패", variant: "destructive", duration: 4000 });
    } finally {
      setManualCreating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          세금계산서 관리
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setManualOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            수동 생성
          </Button>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-lg border p-2 text-center cursor-pointer transition-colors ${
              tab === s
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/40 border-border"
            }`}
          >
            <div className="text-lg font-bold leading-tight">
              {stats[s] ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {STATUS_LABEL[s]}
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 placeholder:text-slate-300"
          placeholder="상호명 또는 사업자번호로 검색"
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
        />
      </div>

      {/* Status Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as DraftStatus)}>
        <TabsList className="flex flex-wrap h-auto gap-0.5">
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s} className="text-xs px-3 py-1.5">
              {STATUS_LABEL[s]}
              {(stats[s] ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs font-medium">
                  {stats[s]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((s) => (
          <TabsContent key={s} value={s} className="space-y-2 pt-3">
            {loading && (
              <p className="text-center text-sm text-muted-foreground py-8">
                불러오는 중...
              </p>
            )}
            {!loading && items.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {search
                    ? `"${search}" 검색 결과가 없습니다.`
                    : "데이터가 없습니다."}
                </CardContent>
              </Card>
            )}
            {!loading &&
              items.map((d) => (
                <DraftCard
                  key={d._id}
                  draft={d}
                  isLoading={actionLoadingId === d._id}
                  onCancel={() => postAction({ id: d._id, action: "cancel" })}
                  onIssue={() => postAction({ id: d._id, action: "issue" })}
                  onEdit={() => openEdit(d)}
                />
              ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit Buyer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>세금계산서 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput
                label="상호"
                value={editForm.corpName}
                onChange={(v) => setEditForm((f) => ({ ...f, corpName: v }))}
              />
              <LabeledInput
                label="사업자번호"
                value={editForm.bizNo}
                onChange={(v) => setEditForm((f) => ({ ...f, bizNo: v }))}
              />
              <LabeledInput
                label="대표자"
                value={editForm.ceoName}
                onChange={(v) => setEditForm((f) => ({ ...f, ceoName: v }))}
              />
              <LabeledInput
                label="담당자"
                value={editForm.contactName}
                onChange={(v) => setEditForm((f) => ({ ...f, contactName: v }))}
              />
              <LabeledInput
                label="업태"
                value={editForm.bizType}
                onChange={(v) => setEditForm((f) => ({ ...f, bizType: v }))}
              />
              <LabeledInput
                label="업종"
                value={editForm.bizClass}
                onChange={(v) => setEditForm((f) => ({ ...f, bizClass: v }))}
              />
              <LabeledInput
                label="이메일"
                value={editForm.contactEmail}
                onChange={(v) =>
                  setEditForm((f) => ({ ...f, contactEmail: v }))
                }
              />
              <LabeledInput
                label="전화"
                value={editForm.contactTel}
                onChange={(v) => setEditForm((f) => ({ ...f, contactTel: v }))}
              />
            </div>
            <LabeledInput
              label="주소"
              value={editForm.addr}
              onChange={(v) => setEditForm((f) => ({ ...f, addr: v }))}
            />
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2">금액 (원)</p>
              <div className="grid grid-cols-3 gap-3">
                <LabeledInput
                  label="공급가액"
                  value={editForm.supplyAmount}
                  onChange={(v) =>
                    setEditForm((f) => ({ ...f, supplyAmount: v }))
                  }
                />
                <LabeledInput
                  label="세액"
                  value={editForm.vatAmount}
                  onChange={(v) => setEditForm((f) => ({ ...f, vatAmount: v }))}
                />
                <LabeledInput
                  label="합계"
                  value={editForm.totalAmount}
                  onChange={(v) =>
                    setEditForm((f) => ({ ...f, totalAmount: v }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={submitEdit} disabled={editSaving}>
              {editSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Direct Issue Dialog */}
      <Dialog
        open={manualOpen}
        onOpenChange={(o) => {
          setManualOpen(o);
          if (!o) resetIssueForm();
        }}
      >
        <DialogContent className="max-w-[540px] max-h-[88vh] overflow-y-auto p-0 gap-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              세금계산서 직접 발행
            </DialogTitle>
            {/* Mode toggle – segmented control */}
            <div className="flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setManualInputMode("ocr")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  manualInputMode === "ocr"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="h-3 w-3" />
                업로드 인식
              </button>
              <button
                type="button"
                onClick={() => setManualInputMode("manual")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  manualInputMode === "manual"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <PenLine className="h-3 w-3" />
                직접 입력
              </button>
            </div>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* OCR 업로드 */}
            {manualInputMode === "ocr" && (
              <div className="rounded-lg border bg-slate-50 px-4 py-3">
                <BizRegOcrUploader
                  token={token}
                  onExtracted={handleOcrExtracted}
                />
              </div>
            )}

            {/* ── 매입처 정보 ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                매입처 정보
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    사업자번호 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="000-00-00000"
                    value={issueForm.bizNo}
                    onChange={setIf("bizNo")}
                    className="h-8 text-sm placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    상호 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="주식회사 예시"
                    value={issueForm.corpName}
                    onChange={setIf("corpName")}
                    className="h-8 text-sm placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    대표자명
                  </Label>
                  <Input
                    value={issueForm.ceoName}
                    onChange={setIf("ceoName")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">업태</Label>
                  <Input
                    value={issueForm.bizType}
                    onChange={setIf("bizType")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">주소</Label>
                  <Input
                    value={issueForm.addr}
                    onChange={setIf("addr")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">종목</Label>
                  <Input
                    value={issueForm.bizClass}
                    onChange={setIf("bizClass")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    담당자 이메일
                  </Label>
                  <Input
                    type="email"
                    value={issueForm.contactEmail}
                    onChange={setIf("contactEmail")}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── 금액 ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                금액
              </p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    공급가액 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={issueForm.supplyAmount}
                    onChange={(e) => {
                      const sup = Number(e.target.value) || 0;
                      setIssueForm((f) => ({
                        ...f,
                        supplyAmount: e.target.value,
                        vatAmount: String(Math.round(sup * 0.1)),
                        totalAmount: String(sup + Math.round(sup * 0.1)),
                      }));
                    }}
                    className="h-8 text-sm placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    세액 (10%)
                  </Label>
                  <Input
                    type="number"
                    value={issueForm.vatAmount}
                    onChange={setIf("vatAmount")}
                    className="h-8 text-sm bg-muted/40"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    합계금액 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={issueForm.totalAmount}
                    onChange={setIf("totalAmount")}
                    className="h-8 text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── 발행 정보 ── */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                발행 정보
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    작성일자
                  </Label>
                  <Input
                    type="date"
                    value={issueForm.writeDate}
                    onChange={setIf("writeDate")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    품목명
                  </Label>
                  <Input
                    value={issueForm.itemName}
                    onChange={setIf("itemName")}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setManualOpen(false);
                resetIssueForm();
              }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={manualCreate}
              disabled={
                manualCreating ||
                !issueForm.bizNo.trim() ||
                !issueForm.corpName.trim() ||
                !issueForm.supplyAmount ||
                !issueForm.totalAmount
              }
            >
              {manualCreating ? "발행 중..." : "팝빌 발행"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function DraftCard({
  draft: d,
  isLoading,
  onCancel,
  onIssue,
  onEdit,
}: {
  draft: TaxInvoiceDraft;
  isLoading: boolean;
  onCancel: () => void;
  onIssue: () => void;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={d.status} />
              {d.buyer?.corpName ? (
                <span className="text-sm font-medium truncate">
                  {d.buyer.corpName}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  상호 미기재
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {d.buyer?.bizNo && <span>사업자: {d.buyer.bizNo}</span>}
              {d.buyer?.ceoName && <span>대표: {d.buyer.ceoName}</span>}
              {d.sentAt && <span>발행일: {fmtDate(d.sentAt)}</span>}
              <span className="opacity-60">생성: {fmtDate(d.createdAt)}</span>
            </div>
            {d.failReason && (
              <p className="text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                {d.failReason}
              </p>
            )}
            {d.hometaxTrxId && (
              <p className="text-xs text-muted-foreground">
                TrxID: {d.hometaxTrxId}
              </p>
            )}
            <p className="text-xs text-muted-foreground opacity-50 truncate">
              {d._id}
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-sm font-semibold">
              {fmtMoney(d.totalAmount)}원
            </div>
            <div className="text-xs text-muted-foreground">
              공급 {fmtMoney(d.supplyAmount)} · VAT {fmtMoney(d.vatAmount)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 justify-end">
          {d.status !== "SENT" && d.status !== "CANCELLED" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={isLoading}
              onClick={onEdit}
            >
              수정
            </Button>
          )}

          {d.status === "FAILED" && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isLoading}
                onClick={onIssue}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                재발행
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isLoading}
                onClick={onCancel}
              >
                취소
              </Button>
            </>
          )}

          {d.status === "SENT" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
              disabled={isLoading}
              onClick={onCancel}
            >
              발행취소
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminTaxInvoices;
