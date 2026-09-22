// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/admin/adminTaxInvoice.controller.js
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// change-log:
// - 2026-09-23: 최신 발행 정책(기공비=어벗츠→고객)·CreditPanel UI·문구 정리. LAB_TO_PRACTICE 초안 생성 제거.
// - 2026-09-20: 상태 요약 카드 그리드 p-0.5 — 선택 border가 overflow에 잘리지 않게.
// - 2026-09-20: 재무 허브 embedded 스크롤(overflow-auto) — 목록이 잘리지 않게.
// - 2026-09-20: 승인대기 탭·승인(승인 후 발행) 버튼.
// - 2026-09-20: 월정산 콘솔 — 기간·방향·월합 초안 생성·메타 표시.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  CreditPanel,
  CreditSectionHeader,
} from "@/pages/admin/credits/creditPageUi";
import { cn } from "@/shared/ui/cn";

import {
  invoiceTaxTypeBadge,
  toInclusiveVat,
  TAX_INVOICE_LANE_LABEL,
  taxInvoiceLaneLabel,
  type InvoiceTaxType,
  type TaxInvoiceDirection,
  type TaxInvoiceLane,
} from "@/shared/tax/invoiceLabels";

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
  direction?: TaxInvoiceDirection;
  buyerKind?: "practice" | "lab" | null;
  issuanceMode?: "SELF" | "TRUSTEE";
  taxType?: "과세" | "면세";
  kind?: "NORMAL" | "REVERSE";
  reversesDraftId?: string | null;
  reversedByDraftId?: string | null;
  seller?: { corpName?: string; bizNo?: string };
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
  writeDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  itemName?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type LaneFilter = "ALL" | TaxInvoiceLane;
type TaxTypeFilter = "ALL" | InvoiceTaxType;

function applyLaneToQuery(qs: URLSearchParams, lane: LaneFilter) {
  if (lane === "ALL") return;
  if (lane === "LAB_TO_PRACTICE") {
    qs.set("direction", "LAB_TO_PRACTICE");
    return;
  }
  if (lane === "AFFILIATE_TO_ABUTS") {
    qs.set("direction", "AFFILIATE_TO_ABUTS");
    return;
  }
  qs.set("direction", "ABUTS_TO_CUSTOMER");
  qs.set("buyerKind", lane === "ABUTS_TO_LAB" ? "lab" : "practice");
}

function kstMonthKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

/** 지난달 KST YYYY-MM */
function previousKstMonthKey(d = new Date()): string {
  const [y, m] = kstMonthKey(d).split("-").map(Number);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return `${prev.y}-${String(prev.m).padStart(2, "0")}`;
}

function monthRangeYmd(ym: string): { periodStart: string; periodEnd: string } {
  const [y, m] = ym.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return {
    periodStart: `${y}-${String(m).padStart(2, "0")}-01`,
    periodEnd: `${nextY}-${String(nextM).padStart(2, "0")}-01`,
  };
}

function fmtWriteDate(writeDate?: string | null) {
  const raw = String(writeDate || "").replace(/\D/g, "");
  if (raw.length !== 8) return "-";
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`;
}

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

type ListTab = DraftStatus | "REVERSE";

const STATUS_TABS: ListTab[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "REVERSE",
  "FAILED",
  "CANCELLED",
];

const STATUS_LABEL: Record<ListTab, string> = {
  PENDING_APPROVAL: "승인대기",
  APPROVED: "승인됨",
  SENT: "발행완료",
  REVERSE: "마이너스 발행",
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
    PENDING_APPROVAL: "bg-accent-muted/50 text-accent-strong border-accent-muted",
    APPROVED: "bg-primary-soft text-primary-strong border-primary-muted",
    SENT: "bg-primary-muted/50 text-primary-strong border-primary-muted",
    FAILED: "bg-destructive-soft text-destructive border-destructive-muted",
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

export const AdminTaxInvoices = ({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<ListTab>("PENDING_APPROVAL");
  const [items, setItems] = useState<TaxInvoiceDraft[]>([]);
  const [stats, setStats] = useState<Partial<Record<ListTab, number>>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [directionFilter, setDirectionFilter] =
    useState<LaneFilter>("ALL");
  const [taxTypeFilter, setTaxTypeFilter] = useState<TaxTypeFilter>("ALL");
  const [periodMonth, setPeriodMonth] = useState(previousKstMonthKey);
  const [filterByPeriod, setFilterByPeriod] = useState(false);
  const [generating, setGenerating] = useState(false);

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
    taxType: "면세" as InvoiceTaxType,
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
      if (res.ok) {
        const raw = (res.data as any)?.data || {};
        setStats({
          ...raw,
          REVERSE: raw.REVERSE_SENT ?? raw.REVERSE ?? 0,
        });
      }
    } catch {}
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (tab === "REVERSE") {
        qs.set("kind", "REVERSE");
        qs.set("status", "SENT");
      } else {
        qs.set("status", tab);
        if (tab === "SENT" || tab === "PENDING_APPROVAL" || tab === "APPROVED") {
          qs.set("kind", "NORMAL");
        }
      }
      if (directionFilter !== "ALL") applyLaneToQuery(qs, directionFilter);
      if (taxTypeFilter !== "ALL") qs.set("taxType", taxTypeFilter);
      if (filterByPeriod && periodMonth) qs.set("periodMonth", periodMonth);
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
  }, [
    token,
    tab,
    debouncedSearch,
    directionFilter,
    taxTypeFilter,
    filterByPeriod,
    periodMonth,
    toast,
  ]);

  const periodOptions = useMemo(() => {
    const keys: string[] = [];
    let [y, m] = previousKstMonthKey().split("-").map(Number);
    for (let i = 0; i < 12; i++) {
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
      if (m === 1) {
        y -= 1;
        m = 12;
      } else {
        m -= 1;
      }
    }
    return keys;
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const reload = useCallback(async () => {
    await Promise.all([loadStats(), loadItems()]);
  }, [loadStats, loadItems]);

  const generateMonthlyDrafts = useCallback(async () => {
    if (!token) return;
    setGenerating(true);
    try {
      const range = monthRangeYmd(periodMonth);
      const res = await request({
        path: "/api/admin/tax-invoices/customer-monthly/generate",
        method: "POST",
        token,
        jsonBody: range,
      });
      if (!res.ok) {
        toast({
          title: "초안 생성 실패",
          description:
            (res.data as any)?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      const s = (res.data as any)?.data || {};
      toast({
        title: `${periodMonth} 월합 초안`,
        description: `면세 ${s.exempt?.created ?? 0} · 과세 ${s.taxable?.created ?? 0}`,
        duration: 5000,
      });
      setFilterByPeriod(true);
      setTab("PENDING_APPROVAL");
      await reload();
    } catch {
      toast({
        title: "초안 생성 실패",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setGenerating(false);
    }
  }, [token, periodMonth, toast, reload]);

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
          cancel: "마이너스 발행/취소 처리됨",
          issue: "팝빌 발행 완료",
          approve: "승인 완료",
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

  /** 승인대기 → 승인 후 팝빌 발행까지 한 번에 */
  const approveAndIssue = useCallback(
    async (id: string) => {
      if (!token) return;
      setActionLoadingId(id);
      try {
        const approveRes = await request<any>({
          path: `/api/admin/tax-invoices/drafts/${id}/approve`,
          method: "POST",
          token,
        });
        if (!approveRes.ok) {
          toast({
            title: "승인 실패",
            description:
              (approveRes.data as any)?.message || "잠시 후 다시 시도해주세요.",
            variant: "destructive",
            duration: 5000,
          });
          return;
        }

        const issueRes = await request<any>({
          path: `/api/admin/tax-invoices/drafts/${id}/issue`,
          method: "POST",
          token,
        });
        if (!issueRes.ok) {
          toast({
            title: "승인은 됐지만 발행 실패",
            description:
              (issueRes.data as any)?.message ||
              "발행실패 탭에서 재발행할 수 있습니다.",
            variant: "destructive",
            duration: 6000,
          });
          await reload();
          return;
        }

        toast({ title: "승인·발행 완료", duration: 3000 });
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
      taxType: "면세",
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
          taxType: issueForm.taxType,
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
      toast({ title: "(세금)계산서 발행 완료", duration: 3000 });
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
    <div
      className={
        embedded
          ? "custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto pt-2"
          : "custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto p-4"
      }
    >
      <div className="space-y-4">
        <CreditPanel>
          <div className="space-y-4 p-4 sm:p-5">
            <CreditSectionHeader
              icon={FileText}
              title="(세금)계산서"
              description={
                <>
                  기공·커스텀어벗=면세 계산서, 스토어=과세 세금계산서.
                  <br />
                  익월 1일 초안 → 여기서 검토·발행. 관계사 입금은 발행 후.
                  <br />
                  관계사→어벗츠는{" "}
                  <Link
                    to="/dashboard/finance?tab=payments"
                    className="underline underline-offset-2"
                  >
                    정산
                  </Link>
                  배치 확정 시 생성.
                </>
              }
              trailing={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManualOpen(true)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    수동 발행
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void reload()}
                    disabled={loading}
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loading && "animate-spin")}
                    />
                  </Button>
                </div>
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodMonth} onValueChange={setPeriodMonth}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="정산월" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((ym) => (
                    <SelectItem key={ym} value={ym} className="text-xs">
                      {ym.replace("-", "년 ")}월
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={generating}
                onClick={() => void generateMonthlyDrafts()}
              >
                {generating ? "생성 중…" : "고객 월합 초안"}
              </Button>
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={filterByPeriod}
                  onChange={(e) => setFilterByPeriod(e.target.checked)}
                />
                이 정산월만
              </label>
            </div>
          </div>
        </CreditPanel>

        <div className="grid grid-cols-2 gap-2 p-0.5 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={cn(
                "cursor-pointer rounded-2xl border p-2.5 text-center transition-colors",
                tab === s
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-slate-200/80 bg-white/80 hover:bg-slate-50",
              )}
            >
              <div className="text-lg font-bold tabular-nums leading-tight text-slate-900">
                {stats[s] ?? 0}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {STATUS_LABEL[s]}
              </div>
            </button>
          ))}
        </div>

        <CreditPanel>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={directionFilter}
                onValueChange={(v) => setDirectionFilter(v as LaneFilter)}
              >
                <SelectTrigger className="h-8 w-[168px] text-xs">
                  <SelectValue placeholder="발행 방향" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">
                    전체 방향
                  </SelectItem>
                  {(Object.keys(TAX_INVOICE_LANE_LABEL) as TaxInvoiceLane[]).map(
                    (key) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {TAX_INVOICE_LANE_LABEL[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Select
                value={taxTypeFilter}
                onValueChange={(v) => setTaxTypeFilter(v as TaxTypeFilter)}
              >
                <SelectTrigger className="h-8 w-[148px] text-xs">
                  <SelectValue placeholder="과세구분" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL" className="text-xs">
                    전체 과세구분
                  </SelectItem>
                  <SelectItem value="면세" className="text-xs">
                    면세 · 계산서
                  </SelectItem>
                  <SelectItem value="과세" className="text-xs">
                    과세 · 세금계산서
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-9 text-sm placeholder:text-slate-300"
                  placeholder="상호 · 사업자번호"
                  value={search}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(e.target.value)
                  }
                />
              </div>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                불러오는 중…
              </p>
            ) : null}

            {!loading && items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-muted-foreground">
                {search
                  ? `"${search}" 검색 결과가 없습니다.`
                  : "초안이 없습니다."}
              </div>
            ) : null}

            {!loading && items.length > 0 ? (
              <div className="space-y-2">
                {items.map((d) => (
                  <DraftCard
                    key={d._id}
                    draft={d}
                    isLoading={actionLoadingId === d._id}
                    onCancel={() => postAction({ id: d._id, action: "cancel" })}
                    onIssue={() => postAction({ id: d._id, action: "issue" })}
                    onApprove={() => approveAndIssue(d._id)}
                    onEdit={() => openEdit(d)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </CreditPanel>

      {/* Edit Buyer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>(세금)계산서 정보 수정</DialogTitle>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-[540px] max-h-[88vh] overflow-y-auto p-0 gap-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              (세금)계산서 직접 발행
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">과세 구분</Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={issueForm.taxType}
                  onChange={(e) => {
                    const taxType = e.target.value as InvoiceTaxType;
                    setIssueForm((f) => {
                      const supply = Number(f.supplyAmount) || 0;
                      if (taxType === "과세" && supply > 0) {
                        const split = toInclusiveVat(supply);
                        return {
                          ...f,
                          taxType,
                          vatAmount: String(split.vat),
                          totalAmount: String(split.total),
                        };
                      }
                      return {
                        ...f,
                        taxType,
                        vatAmount: "0",
                        totalAmount: f.supplyAmount || "0",
                      };
                    });
                  }}
                >
                  <option value="면세">면세 · 계산서</option>
                  <option value="과세">과세 · 세금계산서</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    공급가액 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={issueForm.supplyAmount}
                    onChange={(e) => {
                      const supplyAmount = e.target.value;
                      const supply = Number(supplyAmount) || 0;
                      setIssueForm((f) => {
                        if (f.taxType === "과세" && supply > 0) {
                          const split = toInclusiveVat(supply);
                          return {
                            ...f,
                            supplyAmount,
                            vatAmount: String(split.vat),
                            totalAmount: String(split.total),
                          };
                        }
                        return {
                          ...f,
                          supplyAmount,
                          vatAmount: "0",
                          totalAmount: supplyAmount,
                        };
                      });
                    }}
                    className="h-8 text-sm placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    세액 (과세 시 자동)
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
    </div>
  );
};

function DraftCard({
  draft: d,
  isLoading,
  onCancel,
  onIssue,
  onApprove,
  onEdit,
}: {
  draft: TaxInvoiceDraft;
  isLoading: boolean;
  onCancel: () => void;
  onIssue: () => void;
  onApprove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            {d.direction ? (
              <Badge variant="outline" className="text-xs">
                {taxInvoiceLaneLabel(d)}
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-xs">
              {invoiceTaxTypeBadge(d.taxType)} ·{" "}
              {d.issuanceMode === "TRUSTEE" ? "위수탁" : "정발행"}
            </Badge>
            {d.kind === "REVERSE" ? (
              <Badge variant="secondary" className="text-xs">
                마이너스
              </Badge>
            ) : null}
            {d.reversedByDraftId && d.kind !== "REVERSE" ? (
              <Badge variant="secondary" className="text-xs">
                역발행됨
              </Badge>
            ) : null}
            {d.buyer?.corpName ? (
              <span className="truncate text-sm font-medium text-slate-900">
                {d.buyer.corpName}
              </span>
            ) : (
              <span className="text-sm italic text-muted-foreground">
                상호 미기재
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {d.itemName ? <span>{d.itemName}</span> : null}
            {d.buyer?.bizNo ? <span>{d.buyer.bizNo}</span> : null}
            {d.seller?.corpName ? (
              <span>공급 {d.seller.corpName}</span>
            ) : null}
            {d.writeDate ? <span>작성 {fmtWriteDate(d.writeDate)}</span> : null}
            {d.periodStart ? (
              <span>
                기간 {fmtDate(d.periodStart)}
                {d.periodEnd ? ` ~ ${fmtDate(d.periodEnd)}` : ""}
              </span>
            ) : null}
            {d.sentAt ? <span>발행 {fmtDate(d.sentAt)}</span> : null}
          </div>
          {d.failReason ? (
            <p className="flex items-start gap-1 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {d.failReason}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-900">
            {fmtMoney(d.totalAmount)}원
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">
            공급 {fmtMoney(d.supplyAmount)} · 세액 {fmtMoney(d.vatAmount)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        {d.status !== "SENT" && d.status !== "CANCELLED" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={isLoading}
            onClick={onEdit}
          >
            수정
          </Button>
        ) : null}

        {d.status === "PENDING_APPROVAL" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={isLoading}
              onClick={onApprove}
            >
              {isLoading ? "처리 중…" : "승인·발행"}
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
        ) : null}

        {d.status === "APPROVED" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={isLoading}
              onClick={onIssue}
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
              발행
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
        ) : null}

        {d.status === "FAILED" ? (
          <>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={isLoading}
              onClick={onIssue}
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
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
        ) : null}

        {d.status === "SENT" &&
        d.kind !== "REVERSE" &&
        !d.reversedByDraftId ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
            disabled={isLoading}
            onClick={onCancel}
          >
            마이너스 발행
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default AdminTaxInvoices;
