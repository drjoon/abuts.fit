
// change-log:
// - 2026-08-24: 미처리 통신 카드 제거 후 뒤 카드를 끌어올려 4열 유지.
// - 2026-08-23: ExoCAD 헥스 확인 모달에 확정 계정 보기/수정.
// - 2026-08-21: ExoCAD 헥스 회전 확인 진행중 카드·완료 다이얼로그.
// - 2026-08-04: 진행 건수를 묶음배송+신속배송 합으로 표시.
// - 2026-08-04: 진행/완료 카드에서 취소 제거, 진행 중 묶음배송·신속배송 건수 표시.
// - 2026-08-04: 진행 합계를 준비~포장.발송으로 맞추고, 미처리 통신의 '의뢰'를 '메시지'로 변경.
// - 2026-08-04: 의뢰 리스트에 신속배송/묶음배송 뱃지 표시.
// - 2026-08-03: Display-layer normalization — show '준비' when manufacturerStage indicates the first workflow stage (의뢰) in admin dashboard displays. No DB changes.
// related files:
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/creditBalance.service.js
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/backend/controllers/requests/common.nc.controller.js
// - web/backend/rules.md
import { useEffect, useMemo, useState } from "react";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import { useNavigate } from "react-router-dom";
import { usePeriodStore } from "@/store/usePeriodStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import {
  Users,
  FileText,
  CheckCircle,
  AlertCircle,
  DollarSign,
  PhoneCall,
  RotateCcw,
  Trash2,
  Code2,
  UploadCloud,
  Puzzle,
  RotateCw,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { MachiningStatisticsModal } from "@/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningStatisticsModal";

type PricingSummary = {
  totalOrders?: number;
  paidOrders?: number;
  bonusOrders?: number;
  totalRevenue?: number;
  totalBonusRevenue?: number;
  totalBaseAmount?: number;
  totalDiscountAmount?: number;
  totalShippingFeeSupply?: number;
  avgShippingFeeSupply?: number;
  avgUnitPrice?: number;
  avgBonusUnitPrice?: number;
  avgDiscountPerOrder?: number;
};

type DashboardStat = {
  label: string;
  value: string;
  change?: string;
  icon: LucideIcon;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type RiskSummaryData = {
  riskSummary?: {
    items?: Array<Record<string, unknown>>;
    delayedCount?: number;
    warningCount?: number;
    onTimeRate?: number;
    expressOnTimeRate?: number;
    expressOnTimeCount?: number;
    expressEvaluatedCount?: number;
    normalOnTimeRate?: number;
    normalOnTimeCount?: number;
    normalEvaluatedCount?: number;
  };
};

type HappyCallCompletionsData = {
  items?: HappyCallCompletionItem[];
  totalCount?: number;
};

type HappyCallMemoSaveData = {
  entries?: Array<{ id?: string; message?: string; savedAt?: string }>;
};

type HappyCallCompletionMemoSaveData = {
  note?: string;
  memoEntries?: Array<{ id?: string; message?: string; savedAt?: string }>;
};

type HappyCallMemoDialogItem = {
  mode: "target" | "completion";
  businessAnchorId: string;
  completionId?: string;
  businessName?: string;
  companyName?: string;
};

type AdminDashboardResponseData = {
  happyCallSummary?: HappyCallSummary;
  unmachinableSummary?: {
    potentialCount?: number;
    judgedCount?: number;
    confirmedCount?: number;
    items?: UnmachinableSummaryItem[];
  };
  pricingSummary?: PricingSummary;
  completionSummary?: {
    total?: number;
    paid?: number;
    free?: number;
  };
  requestStats?: {
    total?: number;
    byStatus?: Record<string, number>;
    inProgressByShippingMode?: {
      normal?: number;
      express?: number;
    };
  };
  userStats?: {
    total?: number;
    requestorBusinessCount?: number;
  };
  systemAlerts?: DashboardData["systemAlerts"];
  practiceTransferStats?: PracticeTransferStats;
  unsupportedAbutmentStats?: UnsupportedAbutmentStats;
};

type DashboardData = {
  stats: DashboardStat[];
  systemAlerts: Array<{
    id: string;
    message: string;
    type: string;
    date: string;
  }>;
};

type HappyCallReason = {
  code: string;
  label: string;
  description: string;
  severity: "high" | "medium" | "low";
};

type HappyCallItem = {
  businessAnchorId: string;
  businessName: string;
  designSoftware?: string;
  companyName?: string;
  representativeName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  businessNumber?: string;
  memoEntries?: Array<{
    id?: string;
    message?: string;
    savedAt?: string | null;
  }>;
  createdAt?: string | null;
  firstCompletedAt?: string | null;
  lastCompletedAt?: string | null;
  lastRequestAt?: string | null;
  firstCompletedRequestId?: string;
  firstCompletedRequestMongoId?: string;
  stats?: {
    totalRequests?: number;
    completedCount?: number;
    recent30Total?: number;
    recent30Canceled?: number;
    recent30Completed?: number;
    recent14UnmachinableJudged?: number;
  };
  reasons: HappyCallReason[];
};

type HappyCallSummary = {
  generatedAt?: string;
  weekRange?: {
    start?: string;
    end?: string;
  };
  totalRequestorCount?: number;
  totalReasonCount?: number;
  reasonCounts?: Array<{
    code: string;
    label: string;
    severity: "high" | "medium" | "low";
    count: number;
  }>;
  allItems?: HappyCallItem[];
  items?: HappyCallItem[];
};

type HappyCallCompletionItem = {
  id: string;
  businessAnchorId: string;
  businessName?: string;
  companyName?: string;
  representativeName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  businessNumber?: string;
  reasonCode?: string;
  note?: string;
  completedAt?: string | null;
  suppressUntil?: string | null;
  completedByName?: string;
  completedByEmail?: string;
  memoEntries?: Array<{
    id?: string;
    message?: string;
    savedAt?: string;
  }>;
};

type HappyCallBusinessDetail = {
  businessAnchorId: string;
  businessName?: string;
  companyName?: string;
  representativeName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  businessNumber?: string;
};

type HappyCallMemoEntry = {
  id: string;
  message: string;
  savedAt: string;
};

type HexVerificationInProgressItem = {
  businessAnchorId: string;
  businessName?: string | null;
  businessType?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  designSoftware?: string;
  exoCadVersion?: string | null;
  status?: "pending" | "confirmed";
  hexVerificationSamplePending?: boolean;
  manufacturerDefaultHex?: string | null;
  adminVerifiedHex?: string | null;
  completedAt?: string | null;
  sampleRequestId?: string | null;
  sampleStage?: string | null;
  sampleCreatedAt?: string | null;
};

type HexVerificationInProgressData = {
  count?: number;
  pendingCount?: number;
  confirmedCount?: number;
  items?: HexVerificationInProgressItem[];
};

type PracticeTransferStats = {
  totalTransfers?: number;
  totalFiles?: number;
  totalPractices?: number;
  totalLabs?: number;
  unreadTransfers?: number;
  activeTransfers?: number;
  canceledTransfers?: number;
  topPractices?: Array<{
    practiceAnchorId?: string;
    practiceName?: string;
    transferCount?: number;
    fileCount?: number;
  }>;
  topLabs?: Array<{
    labAnchorId?: string;
    labName?: string;
    transferCount?: number;
    fileCount?: number;
  }>;
  recentTransfers?: Array<{
    transferId?: string;
    transferMongoId?: string;
    practiceName?: string;
    labName?: string;
    status?: string;
    fileCount?: number;
    createdAt?: string;
  }>;
};

type UnsupportedAbutmentStatus =
  | "pending"
  | "adopted_cnc"
  | "adopted_round_bar";

type UnsupportedAbutmentTransferUsage = {
  transferId?: string;
  transferMongoId?: string;
  labName?: string;
  labAnchorId?: string;
  matchingMode?: string | null;
  createdAt?: string | null;
  teeth?: string[];
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
};

type UnsupportedAbutmentItem = {
  id: string;
  status: UnsupportedAbutmentStatus;
  practiceAnchorId?: string;
  practiceName?: string;
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  implantLabel?: string;
  isManufacturerAddRequest?: boolean;
  adopted?: boolean;
  adoptedKind?: string;
  adoptedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  labs?: Array<{ labName?: string; labAnchorId?: string }>;
  transfers?: UnsupportedAbutmentTransferUsage[];
  transferCount?: number;
  source?: string;
};

type UnsupportedAbutmentStats = {
  pending?: number;
  adoptedCnc?: number;
  adoptedRoundBar?: number;
  total?: number;
  items?: UnsupportedAbutmentItem[];
};

type UnmachinableDetailCode = "potential" | "judged" | "confirmed" | "none";

type UnmachinableSummaryItem = {
  _id?: string;
  requestId?: string;
  businessAnchorId?: string;
  businessName?: string;
  companyName?: string;
  representativeName?: string;
  phoneNumber?: string;
  email?: string;
  title?: string;
  manufacturerStage?: string;
  createdAt?: string | null;
  shippingMode?: string | null;
  finalShipping?: { mode?: string | null } | null;
  originalShipping?: { mode?: string | null } | null;
  caseInfos?: Record<string, unknown>;
  rnd?: {
    unmachinablePotentialAt?: string | null;
    unmachinableAt?: string | null;
    unmachinableConfirmedAt?: string | null;
    unmachinableReason?: string;
  };
  unmachinableDetailCode?: UnmachinableDetailCode;
};

const UNMACHINABLE_DETAIL_LABEL: Record<UnmachinableDetailCode, string> = {
  potential: "불완전가공 가능성 있음",
  judged: "제조사 불완전가공 판정",
  confirmed: "의뢰자 불완전가공 확인",
  none: "-",
};

const UNMACHINABLE_DETAIL_BADGE_VARIANT = (
  code: UnmachinableDetailCode,
): "outline" | "secondary" => {
  if (code === "confirmed") return "secondary";
  return "outline";
};

const getAlertIcon = (type: string) => {
  switch (type) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-primary" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-accent" />;
    case "info":
    default:
      return <AlertCircle className="h-4 w-4 text-primary" />;
  }
};

const HAPPY_CALL_SEVERITY_BADGE: Record<
  "high" | "medium" | "low",
  "destructive" | "secondary" | "outline"
> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const HAPPY_CALL_REASON_DISPLAY_ORDER = [
  "no_completion_30d_from_join",
  "first_completion_after_signup",
  "new_signup_no_first_request_14d",
  "first_completion_this_week",
  "recent_unmachinable_14d",
  "high_cancel_rate_30d",
  "active_but_no_completion_30d",
  "dormant_60d_since_last_completion",
] as const;

const HAPPY_CALL_COMPLETION_PERIOD_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
] as const;

const toDateLabel = (raw?: string | null) => {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR");
};

const toDateTimeLabel = (raw?: string | null) => {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR");
};

const toHappyCallMemoLine = (entry: HappyCallMemoEntry) => {
  return `[${toDateTimeLabel(entry.savedAt)}] ${String(entry.message || "").trim()}`;
};

const toHappyCallMemoPayload = (entries: HappyCallMemoEntry[]) => {
  return entries
    .map((entry) => toHappyCallMemoLine(entry))
    .filter((line) => Boolean(String(line || "").trim()))
    .join("\n");
};

const toHappyCallMemoEntries = (
  rows: Array<{ id?: string; message?: string; savedAt?: string }> | undefined,
  fallbackKey: string,
) => {
  const source = Array.isArray(rows) ? rows : [];
  return source
    .map((entry, idx: number) => {
      const message = String(entry?.message || "").trim();
      const savedAt = String(entry?.savedAt || "").trim();
      const id = String(entry?.id || `${fallbackKey}-${savedAt}-${idx}`).trim();
      if (!message || !savedAt) return null;
      return {
        id,
        message,
        savedAt,
      } as HappyCallMemoEntry;
    })
    .filter(Boolean) as HappyCallMemoEntry[];
};

export const AdminDashboardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { period, setPeriod } = usePeriodStore();
  const [happyCallDialogOpen, setHappyCallDialogOpen] = useState(false);
  const [riskSummaryDialogOpen, setRiskSummaryDialogOpen] = useState(false);
  const [hexVerificationDialogOpen, setHexVerificationDialogOpen] =
    useState(false);
  const [hexChoiceByAnchor, setHexChoiceByAnchor] = useState<
    Record<string, "STL모델대로" | "헥스30도회전">
  >({});
  const [completingHexByAnchor, setCompletingHexByAnchor] = useState<
    Record<string, boolean>
  >({});
  const [happyCallDialogTab, setHappyCallDialogTab] = useState<"targets" | "completed">("targets");
  const [happyCallReasonFilter, setHappyCallReasonFilter] = useState<string>("all");
  const [phoneConfirm, setPhoneConfirm] = useState<{
    open: boolean;
    phone: string;
    businessName: string;
  }>({
    open: false,
    phone: "",
    businessName: "",
  });
  const [completingHappyCallByAnchor, setCompletingHappyCallByAnchor] =
    useState<Record<string, boolean>>({});
  const [revertingHappyCallByAnchor, setRevertingHappyCallByAnchor] =
    useState<Record<string, boolean>>({});
  const [happyCallCompletionPeriod, setHappyCallCompletionPeriod] = useState<
    "all" | "7" | "30" | "90"
  >("all");
  const [happyCallCompletionSearch, setHappyCallCompletionSearch] = useState("");
  const [happyCallConfirm, setHappyCallConfirm] = useState<{
    open: boolean;
    item: HappyCallItem | null;
  }>({
    open: false,
    item: null,
  });
  const [happyCallMemoDialog, setHappyCallMemoDialog] = useState<{
    open: boolean;
    item: HappyCallMemoDialogItem | null;
  }>({
    open: false,
    item: null,
  });
  const [happyCallMemoDraft, setHappyCallMemoDraft] = useState("");
  const [happyCallSelectedMemoId, setHappyCallSelectedMemoId] = useState<string | null>(null);
  const [happyCallNotesByAnchor, setHappyCallNotesByAnchor] = useState<
    Record<string, HappyCallMemoEntry[]>
  >({});
  const [happyCallCompletionNotesById, setHappyCallCompletionNotesById] = useState<
    Record<string, HappyCallMemoEntry[]>
  >({});
  const [savingHappyCallMemo, setSavingHappyCallMemo] = useState(false);
  const [happyCallDetailItem, setHappyCallDetailItem] = useState<HappyCallBusinessDetail | null>(null);
  const [unmachinableDetailDialog, setUnmachinableDetailDialog] = useState<{
    open: boolean;
    item: UnmachinableSummaryItem | null;
  }>({
    open: false,
    item: null,
  });
  const [designSoftwareStatsDialogOpen, setDesignSoftwareStatsDialogOpen] =
    useState(false);
  const [machiningStatsDialogOpen, setMachiningStatsDialogOpen] =
    useState(false);
  const [unsupportedAbutmentStatsDialogOpen, setUnsupportedAbutmentStatsDialogOpen] =
    useState(false);
  const [unsupportedAbutmentDetailItem, setUnsupportedAbutmentDetailItem] =
    useState<UnsupportedAbutmentItem | null>(null);
  const [practiceTransferStatsDialogOpen, setPracticeTransferStatsDialogOpen] =
    useState(false);
  const [restoreTransferTarget, setRestoreTransferTarget] = useState<{
    transferId: string;
    transferMongoId: string;
  } | null>(null);
  const [restoringTransfer, setRestoringTransfer] = useState(false);
  const [deleteTransferTarget, setDeleteTransferTarget] = useState<{
    transferId: string;
    transferMongoId: string;
  } | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);
  const [designSoftwareStatsFilter, setDesignSoftwareStatsFilter] = useState<
    "all" | "3shape" | "exocad" | "other"
  >("all");
  const [unsupportedAbutmentStatsFilter, setUnsupportedAbutmentStatsFilter] =
    useState<"all" | UnsupportedAbutmentStatus>("all");

  const openHappyCallBusinessDetail = (
    source: Partial<HappyCallBusinessDetail> | null | undefined,
  ) => {
    if (!source) return;
    setHappyCallDetailItem({
      businessAnchorId: String(source.businessAnchorId || "").trim(),
      businessName: String(source.businessName || "").trim(),
      companyName: String(source.companyName || "").trim(),
      representativeName: String(source.representativeName || "").trim(),
      phoneNumber: String(source.phoneNumber || "").trim(),
      email: String(source.email || "").trim(),
      address: String(source.address || "").trim(),
      addressDetail: String(source.addressDetail || "").trim(),
      zipCode: String(source.zipCode || "").trim(),
      businessNumber: String(source.businessNumber || "").trim(),
    });
  };

  const openHappyCallMemoDialogForTarget = (item: HappyCallItem) => {
    setHappyCallMemoDraft("");
    setHappyCallMemoDialog({
      open: true,
      item: {
        mode: "target",
        businessAnchorId: String(item?.businessAnchorId || "").trim(),
        businessName: String(item?.businessName || "").trim(),
        companyName: String(item?.companyName || "").trim(),
      },
    });
  };

  const openHappyCallMemoDialogForCompletion = (row: HappyCallCompletionItem) => {
    setHappyCallMemoDraft("");
    setHappyCallMemoDialog({
      open: true,
      item: {
        mode: "completion",
        businessAnchorId: String(row?.businessAnchorId || "").trim(),
        completionId: String(row?.id || "").trim(),
        businessName: String(row?.businessName || "").trim(),
        companyName: String(row?.companyName || "").trim(),
      },
    });
  };

  const { data: riskSummaryResponse, refetch: refetchRiskSummary } = useQuery({
    queryKey: ["admin-dashboard-risk-summary", period],
    enabled: Boolean(token) && user?.role === "admin",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<ApiEnvelope<RiskSummaryData>>({
          path: `/api/requests/dashboard-risk-summary?period=${period}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("지연 위험 요약 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("요청 시간이 초과되었습니다.");
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
  });

  const { data: adminDashboardResponse, refetch: refetchAdminDashboard } = useQuery({
    queryKey: ["admin-dashboard-page", period],
    enabled: Boolean(token) && user?.role === "admin",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<ApiEnvelope<AdminDashboardResponseData>>({
          path: `/api/admin/dashboard?period=${encodeURIComponent(period)}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("관리자 대시보드 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("요청 시간이 초과되었습니다.");
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    retry: false,
  });

  const {
    data: hexVerificationResponse,
    isFetching: loadingHexVerification,
    refetch: refetchHexVerification,
  } = useQuery({
    queryKey: ["admin-hex-verification-in-progress"],
    enabled: Boolean(token) && user?.role === "admin",
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await apiFetch<ApiEnvelope<HexVerificationInProgressData>>({
        path: "/api/admin/hex-verification/in-progress",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message || "헥스 확인 진행중 목록 조회에 실패했습니다.",
        );
      }
      return res.data;
    },
    retry: false,
  });

  const hexVerificationItems = useMemo(() => {
    const rows = hexVerificationResponse?.data?.items;
    return Array.isArray(rows) ? rows : [];
  }, [hexVerificationResponse]);

  const pendingHexVerificationItems = useMemo(
    () =>
      hexVerificationItems.filter(
        (row) =>
          row.status === "pending" ||
          (row.status == null && Boolean(row.hexVerificationSamplePending)),
      ),
    [hexVerificationItems],
  );

  const confirmedHexVerificationItems = useMemo(
    () =>
      hexVerificationItems.filter(
        (row) =>
          row.status === "confirmed" ||
          (row.status == null &&
            !row.hexVerificationSamplePending &&
            Boolean(row.adminVerifiedHex)),
      ),
    [hexVerificationItems],
  );

  const hexVerificationCount = Number(
    hexVerificationResponse?.data?.pendingCount ??
      hexVerificationResponse?.data?.count ??
      pendingHexVerificationItems.length,
  );

  const confirmedHexVerificationCount = Number(
    hexVerificationResponse?.data?.confirmedCount ??
      confirmedHexVerificationItems.length,
  );

  const completeHexVerificationForAnchor = async (
    item: HexVerificationInProgressItem,
  ) => {
    const anchorId = String(item.businessAnchorId || "").trim();
    if (!anchorId || !token) return;
    const isEdit = item.status === "confirmed" || Boolean(item.adminVerifiedHex);
    const hexRotation =
      hexChoiceByAnchor[anchorId] ||
      item.adminVerifiedHex ||
      (item.exoCadVersion === "ge_3_2" ? "STL모델대로" : "헥스30도회전");

    setCompletingHexByAnchor((prev) => ({ ...prev, [anchorId]: true }));
    try {
      const res = await apiFetch<ApiEnvelope<{ hexRotation?: string }>>({
        path: `/api/admin/hex-verification/${encodeURIComponent(anchorId)}/complete`,
        method: "POST",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: { hexRotation },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "헥스 확인 저장에 실패했습니다.");
      }
      toast({
        title: isEdit ? "헥스 확인 수정" : "헥스 확인 완료",
        description: `${item.businessName || "사업자"} → ${hexRotation}`,
      });
      await refetchHexVerification();
      queryClient.invalidateQueries({
        queryKey: ["admin-hex-verification-in-progress"],
      });
    } catch (e: unknown) {
      toast({
        title: isEdit ? "헥스 확인 수정 실패" : "헥스 확인 완료 실패",
        description: e instanceof Error ? e.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setCompletingHexByAnchor((prev) => {
        const next = { ...prev };
        delete next[anchorId];
        return next;
      });
    }
  };

  const {
    data: happyCallCompletionsResponse,
    isFetching: loadingHappyCallCompletions,
    refetch: refetchHappyCallCompletions,
  } = useQuery({
    queryKey: [
      "admin-happy-call-completions",
      happyCallCompletionPeriod,
      happyCallCompletionSearch,
    ],
    enabled: Boolean(token) && user?.role === "admin" && happyCallDialogOpen,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", "100");

      if (happyCallCompletionPeriod !== "all") {
        qs.set("days", happyCallCompletionPeriod);
      }

      const trimmedSearch = String(happyCallCompletionSearch || "").trim();
      if (trimmedSearch) {
        qs.set("q", trimmedSearch);
      }

      const res = await apiFetch<ApiEnvelope<HappyCallCompletionsData>>({
        path: `/api/admin/dashboard/happy-call/completions?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "해피콜 완료 내역 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
  });

  useAppEventDebouncedReload({
    enabled: Boolean(token) && user?.role === "admin",
    eventTypes: [
      "request:stage-changed",
      "request:delivery-updated",
      "request:delivery-updated-batch",
      "credit:balance-updated",
      "worksheet:count-update",
    ],
    delayMs: 120,
    deferWhenEditing: false,
    onMatch: () => {
      void refetchAdminDashboard();
      void refetchRiskSummary();
    },
  });

  useEffect(() => {
    const summary = adminDashboardResponse?.success
      ? (adminDashboardResponse.data?.happyCallSummary ?? null)
      : null;

    const sourceItems: HappyCallItem[] = Array.isArray(summary?.allItems)
      ? summary.allItems
      : Array.isArray(summary?.items)
        ? summary.items
        : [];

    const next: Record<string, HappyCallMemoEntry[]> = {};

    sourceItems.forEach((item) => {
      const anchorId = String(item?.businessAnchorId || "").trim();
      if (!anchorId) return;
      next[anchorId] = toHappyCallMemoEntries(item?.memoEntries, anchorId);
    });

    setHappyCallNotesByAnchor(next);
  }, [adminDashboardResponse]);

  useEffect(() => {
    const rows: HappyCallCompletionItem[] = Array.isArray(happyCallCompletionsResponse?.data?.items)
      ? happyCallCompletionsResponse.data.items
      : [];

    const next: Record<string, HappyCallMemoEntry[]> = {};
    rows.forEach((row) => {
      const completionId = String(row?.id || "").trim();
      if (!completionId) return;
      next[completionId] = toHappyCallMemoEntries(row?.memoEntries, completionId);
    });
    setHappyCallCompletionNotesById(next);
  }, [happyCallCompletionsResponse]);

  useEffect(() => {
    if (!happyCallMemoDialog.open) return;

    const mode = happyCallMemoDialog.item?.mode;
    const anchorId = String(happyCallMemoDialog.item?.businessAnchorId || "").trim();
    const completionId = String(happyCallMemoDialog.item?.completionId || "").trim();

    const entries =
      mode === "completion"
        ? Array.isArray(happyCallCompletionNotesById[completionId])
          ? happyCallCompletionNotesById[completionId]
          : []
        : Array.isArray(happyCallNotesByAnchor[anchorId])
          ? happyCallNotesByAnchor[anchorId]
          : [];

    if (!entries.length) {
      setHappyCallSelectedMemoId(null);
      return;
    }

    const hasCurrent = entries.some((entry) => entry.id === happyCallSelectedMemoId);
    if (!hasCurrent) {
      setHappyCallSelectedMemoId(entries[entries.length - 1]?.id || null);
    }
  }, [
    happyCallMemoDialog,
    happyCallNotesByAnchor,
    happyCallCompletionNotesById,
    happyCallSelectedMemoId,
  ]);

  if (!user || user.role !== "admin") return null;

  const baseData: DashboardData = {
    stats: [
      { label: "전체 의뢰자", value: "0", change: "+0%", icon: Users },
      { label: "진행", value: "0", change: "+0%", icon: FileText },
      { label: "완료", value: "0", change: "+0%", icon: CheckCircle },
      { label: "취소", value: "0", change: "+0%", icon: AlertCircle },
      {
        label: "시스템 상태",
        value: "정상",
        change: "99.9%",
        icon: CheckCircle,
      },
    ],
    systemAlerts: [],
  };

  let data: DashboardData = baseData;

  const unmachinableSummary = adminDashboardResponse?.success
    ? (adminDashboardResponse.data?.unmachinableSummary ?? null)
    : null;

  const unmachinableItems: UnmachinableSummaryItem[] = Array.isArray(
    unmachinableSummary?.items,
  )
    ? unmachinableSummary.items
    : [];

  const unmachinableRequestIdSet = new Set(
    unmachinableItems
      .map((item) => String(item?.requestId || "").trim())
      .filter(Boolean),
  );

  const riskSummary = (() => {
    if (!riskSummaryResponse?.success) return null;
    const baseSummary = riskSummaryResponse.data?.riskSummary ?? null;
    if (!baseSummary) return null;

    const originalItems = Array.isArray(baseSummary.items)
      ? baseSummary.items
      : [];
    const filteredItems = originalItems.filter(
      (item: Record<string, unknown>) =>
        !unmachinableRequestIdSet.has(String(item?.id || "").trim()),
    );

    if (filteredItems.length === originalItems.length) {
      return baseSummary;
    }

    const delayedCount = filteredItems.filter(
      (item: Record<string, unknown>) => item?.riskLevel === "danger",
    ).length;
    const warningCount = filteredItems.length - delayedCount;

    return {
      ...baseSummary,
      items: filteredItems,
      delayedCount,
      warningCount,
    };
  })();

  const pricingSummary: PricingSummary | null = adminDashboardResponse?.success
    ? (adminDashboardResponse.data?.pricingSummary ?? null)
    : null;

  const completionSummary = adminDashboardResponse?.success
    ? (adminDashboardResponse.data?.completionSummary ?? null)
    : null;

  const happyCallSummary: HappyCallSummary | null = adminDashboardResponse?.success
    ? (adminDashboardResponse.data?.happyCallSummary ?? null)
    : null;

  // change-log: 2026-08-04 - 진행 = 진행 중 묶음배송 + 신속배송 합계 (준비~포장.발송, 추적관리 이후 제외)
  const inProgressNormalCount = Number(
    adminDashboardResponse?.data?.requestStats?.inProgressByShippingMode
      ?.normal || 0,
  );
  const inProgressExpressCount = Number(
    adminDashboardResponse?.data?.requestStats?.inProgressByShippingMode
      ?.express || 0,
  );
  const inProgressRequestCount = inProgressNormalCount + inProgressExpressCount;

  const riskWarningCount = Number(riskSummary?.warningCount || 0);
  const riskDelayedCount = Number(riskSummary?.delayedCount || 0);
  const riskOnTimeRate = Number(riskSummary?.onTimeRate || 0);
  const riskExpressOnTimeRate = Number(
    riskSummary?.expressOnTimeRate ?? riskOnTimeRate,
  );
  const riskNormalOnTimeRate = Number(
    riskSummary?.normalOnTimeRate ?? riskOnTimeRate,
  );
  const riskExpressEvaluatedCount = Number(
    riskSummary?.expressEvaluatedCount || 0,
  );
  const riskNormalEvaluatedCount = Number(
    riskSummary?.normalEvaluatedCount || 0,
  );
  const riskSummaryItems = Array.isArray(riskSummary?.items)
    ? riskSummary.items
    : [];

  const totalRequestorBusinessCount = Number(
    adminDashboardResponse?.data?.userStats?.requestorBusinessCount ?? 0,
  );

  const happyCallItems = Array.isArray(happyCallSummary?.items)
    ? happyCallSummary.items
    : [];

  const allRequestorItems = Array.isArray(happyCallSummary?.allItems)
    ? happyCallSummary.allItems
    : [];

  const happyCallCompletionItems: HappyCallCompletionItem[] = Array.isArray(
    happyCallCompletionsResponse?.data?.items,
  )
    ? happyCallCompletionsResponse.data.items
    : [];

  const happyCallCompletionTotalCount = Number(
    happyCallCompletionsResponse?.data?.totalCount || 0,
  );

  const happyCallReasonCounts = Array.isArray(happyCallSummary?.reasonCounts)
    ? happyCallSummary.reasonCounts
    : [];

  const sortedHappyCallReasonCounts = [...happyCallReasonCounts].sort((a, b) => {
    const aCode = String(a?.code || "").trim();
    const bCode = String(b?.code || "").trim();
    const aIdx = HAPPY_CALL_REASON_DISPLAY_ORDER.indexOf(
      aCode as (typeof HAPPY_CALL_REASON_DISPLAY_ORDER)[number],
    );
    const bIdx = HAPPY_CALL_REASON_DISPLAY_ORDER.indexOf(
      bCode as (typeof HAPPY_CALL_REASON_DISPLAY_ORDER)[number],
    );

    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;

    return Number(b?.count || 0) - Number(a?.count || 0);
  });

  const filteredHappyCallItems =
    happyCallReasonFilter === "all_requestors"
      ? allRequestorItems
      : happyCallReasonFilter === "all"
        ? happyCallItems
        : happyCallItems.filter((item) =>
            Array.isArray(item?.reasons)
              ? item.reasons.some(
                  (reason) =>
                    String(reason?.code || "").trim() === happyCallReasonFilter,
                )
              : false,
          );

  const designSoftwareBusinesses = (() => {
    const map = new Map<string, HappyCallItem>();
    for (const item of allRequestorItems) {
      const anchorId = String(item?.businessAnchorId || "").trim();
      if (!anchorId) continue;
      if (!map.has(anchorId)) {
        map.set(anchorId, item);
      }
    }
    return [...map.values()];
  })();

  const classifyDesignSoftware = (rawValue?: string | null) => {
    const normalized = String(rawValue || "").trim().toLowerCase();
    if (normalized === "3shape") return "3shape" as const;
    if (normalized === "exocad") return "exocad" as const;
    return "other" as const;
  };

  const getDesignSoftwareToneClasses = (
    category: "3shape" | "exocad" | "other",
  ) => {
    if (category === "3shape") {
      return {
        bar: "bg-primary",
        count: "text-primary-strong",
        item: "border-primary-muted bg-primary-soft/70 hover:bg-primary-soft",
        badge: "border-primary-muted bg-primary-soft text-primary-strong",
        chip: "border-primary-muted bg-primary-soft/70 text-primary-strong hover:bg-primary-soft",
        chipActive:
          "border-primary/70 bg-primary-soft text-primary-strong ring-1 ring-primary/30",
      };
    }

    if (category === "exocad") {
      return {
        bar: "bg-accent",
        count: "text-accent-strong",
        item: "border-accent-muted bg-accent-soft/70 hover:bg-accent-soft",
        badge: "border-accent-muted bg-accent-soft text-accent-strong",
        chip: "border-accent-muted bg-accent-soft/70 text-accent-strong hover:bg-accent-soft",
        chipActive:
          "border-accent/70 bg-accent-soft text-accent-strong ring-1 ring-accent/30",
      };
    }

    return {
      bar: "bg-slate-500",
      count: "text-slate-700",
      item: "border-slate-200 bg-slate-50 hover:bg-slate-100",
      badge: "border-slate-200 bg-slate-100 text-slate-700",
      chip: "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
      chipActive: "border-slate-400 bg-slate-100 text-slate-800 ring-1 ring-slate-300",
    };
  };

  const designSoftwareStats = designSoftwareBusinesses.reduce(
    (acc, item) => {
      const key = classifyDesignSoftware(item.designSoftware);
      acc[key] += 1;
      return acc;
    },
    { "3shape": 0, exocad: 0, other: 0 } as Record<
      "3shape" | "exocad" | "other",
      number
    >,
  );

  const filteredDesignSoftwareBusinesses = designSoftwareBusinesses.filter(
    (item) => {
      if (designSoftwareStatsFilter === "all") return true;
      const category = classifyDesignSoftware(item.designSoftware);
      return category === designSoftwareStatsFilter;
    },
  );

  const designSoftwareTotalCount =
    Number(designSoftwareStats["3shape"] || 0) +
    Number(designSoftwareStats.exocad || 0) +
    Number(designSoftwareStats.other || 0);

  const designSoftwareMaxCount = Math.max(
    1,
    Number(designSoftwareStats["3shape"] || 0),
    Number(designSoftwareStats.exocad || 0),
    Number(designSoftwareStats.other || 0),
  );

  const designSoftwareStatRows = [
    { key: "3shape" as const, label: "3Shape", count: Number(designSoftwareStats["3shape"] || 0) },
    { key: "exocad" as const, label: "ExoCAD", count: Number(designSoftwareStats.exocad || 0) },
    { key: "other" as const, label: "기타", count: Number(designSoftwareStats.other || 0) },
  ];

  const unsupportedAbutmentStats =
    ((adminDashboardResponse?.data as
      | { unsupportedAbutmentStats?: UnsupportedAbutmentStats }
      | undefined)?.unsupportedAbutmentStats as UnsupportedAbutmentStats | undefined) ||
    {};
  const unsupportedAbutmentItems = Array.isArray(unsupportedAbutmentStats.items)
    ? unsupportedAbutmentStats.items
    : [];
  const unsupportedAbutmentPending = Number(unsupportedAbutmentStats.pending || 0);
  const unsupportedAbutmentAdoptedCnc = Number(
    unsupportedAbutmentStats.adoptedCnc || 0,
  );
  const unsupportedAbutmentAdoptedRoundBar = Number(
    unsupportedAbutmentStats.adoptedRoundBar || 0,
  );
  const unsupportedAbutmentTotal =
    Number(unsupportedAbutmentStats.total || 0) ||
    unsupportedAbutmentPending +
      unsupportedAbutmentAdoptedCnc +
      unsupportedAbutmentAdoptedRoundBar;

  const getUnsupportedAbutmentToneClasses = (
    status: UnsupportedAbutmentStatus,
  ) => {
    if (status === "pending") {
      return {
        bar: "bg-amber-500",
        count: "text-amber-800",
        item: "border-amber-200 bg-amber-50/80 hover:bg-amber-50",
        badge: "border-amber-300 bg-amber-100 text-amber-900",
        chip: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
        chipActive:
          "border-amber-500 bg-amber-100 text-amber-950 ring-1 ring-amber-400/40",
      };
    }
    if (status === "adopted_cnc") {
      return {
        bar: "bg-primary",
        count: "text-primary-strong",
        item: "border-primary-muted bg-primary-soft/70 hover:bg-primary-soft",
        badge: "border-primary-muted bg-primary-soft text-primary-strong",
        chip: "border-primary-muted bg-primary-soft/70 text-primary-strong hover:bg-primary-soft",
        chipActive:
          "border-primary/70 bg-primary-soft text-primary-strong ring-1 ring-primary/30",
      };
    }
    return {
      bar: "bg-accent",
      count: "text-accent-strong",
      item: "border-accent-muted bg-accent-soft/70 hover:bg-accent-soft",
      badge: "border-accent-muted bg-accent-soft text-accent-strong",
      chip: "border-accent-muted bg-accent-soft/70 text-accent-strong hover:bg-accent-soft",
      chipActive:
        "border-accent/70 bg-accent-soft text-accent-strong ring-1 ring-accent/30",
    };
  };

  const unsupportedAbutmentStatusLabel = (status: UnsupportedAbutmentStatus) => {
    if (status === "pending") return "대기(미제공)";
    if (status === "adopted_cnc") return "CNC 도입";
    return "환봉 도입";
  };

  const unsupportedAbutmentStatRows = [
    {
      key: "pending" as const,
      label: "대기(미제공)",
      count: unsupportedAbutmentPending,
    },
    {
      key: "adopted_cnc" as const,
      label: "CNC 도입",
      count: unsupportedAbutmentAdoptedCnc,
    },
    {
      key: "adopted_round_bar" as const,
      label: "환봉 도입",
      count: unsupportedAbutmentAdoptedRoundBar,
    },
  ];

  const unsupportedAbutmentMaxCount = Math.max(
    1,
    unsupportedAbutmentPending,
    unsupportedAbutmentAdoptedCnc,
    unsupportedAbutmentAdoptedRoundBar,
  );

  const filteredUnsupportedAbutmentItems = unsupportedAbutmentItems.filter(
    (item) => {
      if (unsupportedAbutmentStatsFilter === "all") return true;
      return item.status === unsupportedAbutmentStatsFilter;
    },
  );

  const formatUnsupportedAbutmentDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  const practiceTransferStats =
    ((adminDashboardResponse?.data as { practiceTransferStats?: PracticeTransferStats } | undefined)
      ?.practiceTransferStats as PracticeTransferStats | undefined) || {};
  const practiceTransferTotal = Number(practiceTransferStats?.totalTransfers || 0);
  const practiceTransferTotalFiles = Number(practiceTransferStats?.totalFiles || 0);
  const practiceTransferTotalPractices = Number(practiceTransferStats?.totalPractices || 0);
  const practiceTransferTotalLabs = Number(practiceTransferStats?.totalLabs || 0);
  const practiceTransferUnread = Number(practiceTransferStats?.unreadTransfers || 0);
  const practiceTransferActive = Number(practiceTransferStats?.activeTransfers || 0);
  const practiceTransferCanceled = Number(practiceTransferStats?.canceledTransfers || 0);
  const practiceTransferTopPractices = Array.isArray(practiceTransferStats?.topPractices)
    ? practiceTransferStats.topPractices
    : [];
  const practiceTransferTopLabs = Array.isArray(practiceTransferStats?.topLabs)
    ? practiceTransferStats.topLabs
    : [];
  const practiceTransferRecentTransfers = Array.isArray(practiceTransferStats?.recentTransfers)
    ? practiceTransferStats.recentTransfers
    : [];
  const practiceTransferRecentActive = useMemo(
    () =>
      practiceTransferRecentTransfers.filter(
        (row) => String(row?.status || "").trim() !== "canceled",
      ),
    [practiceTransferRecentTransfers],
  );
  const practiceTransferRecentCanceled = useMemo(
    () =>
      practiceTransferRecentTransfers.filter(
        (row) => String(row?.status || "").trim() === "canceled",
      ),
    [practiceTransferRecentTransfers],
  );

  const patchPracticeTransferStatusInCache = (args: {
    transferId: string;
    transferMongoId: string;
    nextStatus: "canceled" | "active";
  }) => {
    const transferId = String(args.transferId || "").trim();
    const transferMongoId = String(args.transferMongoId || "").trim();
    if (!transferId && !transferMongoId) return;

    queryClient.setQueryData(
      ["admin-dashboard-page", period],
      (prev: ApiEnvelope<AdminDashboardResponseData> | undefined) => {
        if (!prev?.data?.practiceTransferStats) return prev;
        const stats = prev.data.practiceTransferStats;
        const recent = Array.isArray(stats.recentTransfers)
          ? stats.recentTransfers
          : [];
        let matched = false;
        const nextRecent = recent.map((row) => {
          const rowTransferId = String(row?.transferId || "").trim();
          const rowMongoId = String(row?.transferMongoId || "").trim();
          const isMatch =
            (transferId && rowTransferId === transferId) ||
            (transferMongoId && rowMongoId === transferMongoId);
          if (!isMatch) return row;
          matched = true;
          const prevStatus = String(row?.status || "").trim();
          if (args.nextStatus === "canceled" && prevStatus === "canceled") {
            return row;
          }
          if (args.nextStatus === "active" && prevStatus !== "canceled") {
            return row;
          }
          return {
            ...row,
            status: args.nextStatus === "canceled" ? "canceled" : "active",
          };
        });
        if (!matched) return prev;

        const activeDelta = args.nextStatus === "canceled" ? -1 : 1;
        const canceledDelta = args.nextStatus === "canceled" ? 1 : -1;
        return {
          ...prev,
          data: {
            ...prev.data,
            practiceTransferStats: {
              ...stats,
              activeTransfers: Math.max(
                0,
                Number(stats.activeTransfers || 0) + activeDelta,
              ),
              canceledTransfers: Math.max(
                0,
                Number(stats.canceledTransfers || 0) + canceledDelta,
              ),
              recentTransfers: nextRecent,
            },
          },
        };
      },
    );
  };

  const refetchAdminDashboardFresh = async () => {
    if (!token || user?.role !== "admin") return;
    try {
      const res = await apiFetch<ApiEnvelope<AdminDashboardResponseData>>({
        path: `/api/admin/dashboard?period=${encodeURIComponent(period)}&fresh=1`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) return;
      queryClient.setQueryData(["admin-dashboard-page", period], res.data);
    } catch {
      void refetchAdminDashboard();
    }
  };

  const handleRestorePracticeTransfer = async () => {
    if (restoringTransfer || !restoreTransferTarget || !token) return;
    setRestoringTransfer(true);
    try {
      const transferIds = restoreTransferTarget.transferId
        ? [restoreTransferTarget.transferId]
        : [];
      const transferMongoIds = restoreTransferTarget.transferMongoId
        ? [restoreTransferTarget.transferMongoId]
        : [];
      const res = await apiFetch<{
        success?: boolean;
        data?: { successCount?: number; failedIds?: string[] };
        message?: string;
      }>({
        path: "/api/practice/transfers/restore-batch",
        method: "POST",
        token,
        jsonBody: { transferIds, transferMongoIds },
      });
      if (!res.ok) {
        throw new Error(
          String(
            (res.data as { message?: string } | undefined)?.message ||
              "취소건 되살리기에 실패했습니다.",
          ),
        );
      }
      const successCount = Number(res.data?.data?.successCount || 0);
      if (successCount <= 0) {
        throw new Error("되살릴 수 있는 취소건을 찾지 못했습니다.");
      }
      toast({
        title: "취소건 되살리기 완료",
        description: `${restoreTransferTarget.transferId || "전송"}을 활성 상태로 복구했습니다.`,
      });
      patchPracticeTransferStatusInCache({
        transferId: restoreTransferTarget.transferId,
        transferMongoId: restoreTransferTarget.transferMongoId,
        nextStatus: "active",
      });
      setRestoreTransferTarget(null);
      void refetchAdminDashboardFresh();
    } catch (error) {
      toast({
        title: "되살리기 실패",
        description:
          error instanceof Error ? error.message : "취소건 되살리기 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setRestoringTransfer(false);
    }
  };

  const handleDeletePracticeTransfer = async () => {
    if (deletingTransfer || !deleteTransferTarget || !token) return;
    setDeletingTransfer(true);
    try {
      const transferIds = deleteTransferTarget.transferId
        ? [deleteTransferTarget.transferId]
        : [];
      const transferMongoIds = deleteTransferTarget.transferMongoId
        ? [deleteTransferTarget.transferMongoId]
        : [];
      const res = await apiFetch<{
        success?: boolean;
        data?: { successCount?: number; failedIds?: string[] };
        message?: string;
      }>({
        path: "/api/practice/transfers/cancel-batch",
        method: "POST",
        token,
        jsonBody: { transferIds, transferMongoIds },
      });
      if (!res.ok) {
        throw new Error(
          String(
            (res.data as { message?: string } | undefined)?.message ||
              "전송건 삭제에 실패했습니다.",
          ),
        );
      }
      const successCount = Number(res.data?.data?.successCount || 0);
      if (successCount <= 0) {
        throw new Error("삭제할 수 있는 활성 전송건을 찾지 못했습니다.");
      }
      toast({
        title: "전송건 삭제 완료",
        description: `${deleteTransferTarget.transferId || "전송"}을 취소건으로 이동했습니다.`,
      });
      patchPracticeTransferStatusInCache({
        transferId: deleteTransferTarget.transferId,
        transferMongoId: deleteTransferTarget.transferMongoId,
        nextStatus: "canceled",
      });
      setDeleteTransferTarget(null);
      void refetchAdminDashboardFresh();
    } catch (error) {
      toast({
        title: "삭제 실패",
        description:
          error instanceof Error ? error.message : "전송건 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  const handleCompleteHappyCall = async (
    item: HappyCallItem,
    noteRaw?: string,
  ) => {
    const businessAnchorId = String(item?.businessAnchorId || "").trim();
    if (!businessAnchorId || !token) return;

    const reasonCodes = Array.isArray(item?.reasons)
      ? Array.from(
          new Set(
            item.reasons
              .map((r) => String(r?.code || "").trim())
              .filter(Boolean),
          ),
        )
      : [];

    if (!reasonCodes.length) {
      toast({
        title: "해피콜 사유 없음",
        description: "완료 처리할 사유가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setCompletingHappyCallByAnchor((prev) => ({
      ...prev,
      [businessAnchorId]: true,
    }));

    try {
      const res = await apiFetch<ApiEnvelope<unknown>>({
        path: "/api/admin/dashboard/happy-call/complete",
        method: "POST",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: {
          businessAnchorId,
          reasonCodes,
          note: String(noteRaw || "").slice(0, 5000).trim(),
        },
      });

      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || "해피콜 완료 처리에 실패했습니다.");
      }

      toast({
        title: "해피콜 완료",
        description: "해당 의뢰자를 해피콜 목록에서 숨겼습니다.",
      });
      setHappyCallNotesByAnchor((prev) => {
        const next = { ...prev };
        delete next[businessAnchorId];
        return next;
      });
      void refetchAdminDashboard();
      void refetchHappyCallCompletions();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
      toast({
        title: "해피콜 완료 처리 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCompletingHappyCallByAnchor((prev) => ({
        ...prev,
        [businessAnchorId]: false,
      }));
    }
  };

  const handleRevertHappyCallByAnchor = async (
    businessAnchorIdRaw?: string,
    businessNameRaw?: string,
  ) => {
    const businessAnchorId = String(businessAnchorIdRaw || "").trim();
    if (!token || !businessAnchorId) return;
    if (revertingHappyCallByAnchor[businessAnchorId]) return;

    setRevertingHappyCallByAnchor((prev) => ({
      ...prev,
      [businessAnchorId]: true,
    }));

    try {
      const res = await apiFetch<ApiEnvelope<unknown>>({
        path: "/api/admin/dashboard/happy-call/revert-last",
        method: "POST",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: { businessAnchorId },
      });

      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || "롤백에 실패했습니다.");
      }

      toast({
        title: "롤백 완료",
        description: `${String(businessNameRaw || "해당 의뢰자").trim() || "해당 의뢰자"}의 해피콜 완료를 복구했습니다.`,
      });
      void refetchAdminDashboard();
      void refetchHappyCallCompletions();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
      toast({
        title: "롤백 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRevertingHappyCallByAnchor((prev) => ({
        ...prev,
        [businessAnchorId]: false,
      }));
    }
  };

  const handleSaveHappyCallMemoFromDialog = async () => {
    const mode = happyCallMemoDialog.item?.mode;
    const anchorId = String(happyCallMemoDialog.item?.businessAnchorId || "").trim();
    const completionId = String(happyCallMemoDialog.item?.completionId || "").trim();
    const message = String(happyCallMemoDraft || "").slice(0, 500).trim();

    if (!token) return;

    if (!message) {
      toast({
        title: "메모를 입력해주세요",
        description: "추가할 메모 내용을 입력한 뒤 저장해주세요.",
        variant: "destructive",
      });
      return;
    }

    setSavingHappyCallMemo(true);

    try {
      if (mode === "completion") {
        if (!completionId) {
          throw new Error("완료 내역 식별값이 없습니다.");
        }

        const res = await apiFetch<ApiEnvelope<HappyCallCompletionMemoSaveData>>({
          path: `/api/admin/dashboard/happy-call/completions/${completionId}/memo`,
          method: "POST",
          token,
          headers: {
            "Content-Type": "application/json",
          },
          jsonBody: { message },
        });

        if (!res.ok || res.data?.success === false) {
          throw new Error(res.data?.message || "해피콜 메모 저장에 실패했습니다.");
        }

        const entries = toHappyCallMemoEntries(res.data?.data?.memoEntries, completionId);
        setHappyCallCompletionNotesById((prev) => ({
          ...prev,
          [completionId]: entries,
        }));
        setHappyCallSelectedMemoId(entries[entries.length - 1]?.id || null);
        setHappyCallMemoDraft("");
        void refetchHappyCallCompletions();
        toast({
          title: "메모 추가",
          description: "완료 내역 메모가 저장되었습니다.",
        });
        return;
      }

      if (!anchorId) {
        throw new Error("의뢰자 식별값이 없습니다.");
      }

      const res = await apiFetch<ApiEnvelope<HappyCallMemoSaveData>>({
        path: "/api/admin/dashboard/happy-call/memo",
        method: "POST",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: {
          businessAnchorId: anchorId,
          message,
        },
      });

      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || "해피콜 메모 저장에 실패했습니다.");
      }

      const entries = toHappyCallMemoEntries(res.data?.data?.entries, anchorId);

      setHappyCallNotesByAnchor((prev) => ({
        ...prev,
        [anchorId]: entries,
      }));
      setHappyCallSelectedMemoId(entries[entries.length - 1]?.id || null);
      setHappyCallMemoDraft("");
      toast({
        title: "메모 추가",
        description: "해피콜 메모가 저장되었습니다.",
      });
    } catch (error: unknown) {
      const message2 = error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
      toast({
        title: "메모 저장 실패",
        description: message2,
        variant: "destructive",
      });
    } finally {
      setSavingHappyCallMemo(false);
    }
  };

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats || {};
    const requestStats = adminDashboardResponse.data.requestStats || {};
    const systemAlerts = adminDashboardResponse.data.systemAlerts || [];

    const totalUsers = userStats.total ?? 0;

    const byStatus = requestStats.byStatus || {};
    const totalRequests = requestStats.total ?? 0;

    const receive = byStatus["준비"] ?? byStatus["의뢰"] ?? 0;
    const machining = (byStatus["가공"] ?? 0) + (byStatus["CAM"] ?? 0);
    const packing = byStatus["세척.패킹"] ?? 0;
    const shipping = byStatus["포장.발송"] ?? 0;
    const shippingBoxes = byStatus["포장.발송박스"] ?? 0;
    const tracking = byStatus["추적관리"] ?? 0;
    const trackingBoxes = byStatus["추적관리박스"] ?? 0;
    const canceled = byStatus["취소"] ?? 0;

    const systemUptime = "99.9%";

    data = {
      stats: [
        {
          label: "준비",
          value: String(receive),
          change: "+0%",
          icon: Users,
        },
        {
          label: "가공",
          value: String(machining),
          change: "+0%",
          icon: FileText,
        },
        {
          label: "세척.패킹",
          value: String(packing),
          change: "+0%",
          icon: CheckCircle,
        },
        {
          label: "포장.발송",
          value: `${shipping}건/${shippingBoxes}박스`,
          change: "+0%",
          icon: AlertCircle,
        },
        {
          label: "추적관리",
          value: `${tracking}건/${trackingBoxes}박스`,
          change: "+0%",
          icon: AlertCircle,
        },
        {
          label: "시스템 상태",
          value: "정상",
          change: String(systemUptime),
          icon: CheckCircle,
        },
      ],
      systemAlerts,
    };
  }

  return (
    <>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="시스템 관리 대시보드입니다."
        headerRight={undefined}
        statsGridClassName="flex flex-col gap-3"
        topSection={undefined}
        stats={
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              {/* 카드1: 진행 / 완료 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">진행 / 완료</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="text-xs text-muted-foreground">진행</div>
                    <div className="text-right text-lg font-bold">{inProgressRequestCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">묶음배송</div>
                    <div className="text-right text-base font-semibold text-primary-strong">
                      {inProgressNormalCount.toLocaleString()}건
                    </div>
                    <div className="text-xs text-muted-foreground">신속배송</div>
                    <div className="text-right text-base font-semibold text-accent-strong">
                      {inProgressExpressCount.toLocaleString()}건
                    </div>
                    <div className="text-xs text-muted-foreground">완료(유료)</div>
                    <div className="text-right text-base font-semibold">
                      {Number(completionSummary?.paid || 0).toLocaleString()}건
                    </div>
                    <div className="text-xs text-muted-foreground">완료(무료)</div>
                    <div className="text-right text-base font-semibold text-muted-foreground">
                      {Number(completionSummary?.free || 0).toLocaleString()}건
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드2: 이번 주 해피콜 의뢰자 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    이번 주 해피콜 의뢰자
                  </CardTitle>
                  <PhoneCall className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-2 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => {
                      setHappyCallReasonFilter("all");
                      setHappyCallDialogTab("targets");
                      setHappyCallDialogOpen(true);
                    }}
                  >
                    <div className="flex items-end justify-between gap-2">
                      <div className="text-xs text-muted-foreground">해피콜 대상 의뢰자</div>
                      <div className="text-3xl font-bold text-primary-strong leading-none">
                        {Number(happyCallSummary?.totalRequestorCount || 0).toLocaleString()}개
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="text-xs text-muted-foreground">전체 의뢰자 사업자</div>
                      <div className="text-lg sm:text-xl font-bold">
                        {(adminDashboardResponse?.data?.userStats?.requestorBusinessCount ?? 0).toLocaleString()}개
                      </div>
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드3: ExoCAD 헥스 회전 확인 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    헥스 회전 확인
                  </CardTitle>
                  <RotateCw className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => setHexVerificationDialogOpen(true)}
                  >
                    <div className="text-2xl font-bold">
                      {hexVerificationCount.toLocaleString()}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">
                        진행중
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {pendingHexVerificationItems.slice(0, 3).map((row) => (
                        <div
                          key={row.businessAnchorId}
                          className="truncate text-[11px] text-muted-foreground"
                        >
                          {row.businessName || row.ownerName || row.businessAnchorId}
                          {row.sampleRequestId
                            ? ` · ${row.sampleRequestId}`
                            : " · 샘플대기"}
                        </div>
                      ))}
                      {pendingHexVerificationItems.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground">
                          {loadingHexVerification
                            ? "불러오는 중…"
                            : confirmedHexVerificationCount > 0
                              ? `확정 ${confirmedHexVerificationCount.toLocaleString()}건 · 클릭하여 보기/수정`
                              : "진행중인 ExoCAD 계정이 없습니다."}
                        </div>
                      ) : null}
                      {pendingHexVerificationItems.length > 3 ? (
                        <div className="text-[11px] text-muted-foreground">
                          외 {(pendingHexVerificationItems.length - 3).toLocaleString()}건
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      클릭하면 진행중·확정 목록을 보고 수정합니다.
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드8: 지연 위험 요약 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">지연 위험 요약</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => setRiskSummaryDialogOpen(true)}
                  >
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>지연 가능 의뢰: {riskWarningCount.toLocaleString()}건</span>
                      <span>지연 확정 의뢰: {riskDelayedCount.toLocaleString()}건</span>
                      <span>
                        묶음 정시: {riskNormalOnTimeRate.toLocaleString()}%
                        {riskNormalEvaluatedCount > 0
                          ? ` (${riskNormalEvaluatedCount.toLocaleString()}건)`
                          : ""}
                      </span>
                      <span>
                        신속 정시: {riskExpressOnTimeRate.toLocaleString()}%
                        {riskExpressEvaluatedCount > 0
                          ? ` (${riskExpressEvaluatedCount.toLocaleString()}건)`
                          : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      클릭하면 지연 위험 상세 내역을 확인할 수 있습니다.
                    </div>
                  </button>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 items-stretch">
              {/* 카드5-2: 디자인 소프트웨어 통계 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    디자인 소프트웨어 통계
                  </CardTitle>
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => {
                      setDesignSoftwareStatsFilter("all");
                      setDesignSoftwareStatsDialogOpen(true);
                    }}
                  >
                    <div className="space-y-2">
                      {designSoftwareStatRows.map((row) => {
                        const ratio = Math.max(
                          0,
                          Math.min(1, row.count / designSoftwareMaxCount),
                        );
                        const tone = getDesignSoftwareToneClasses(row.key);
                        return (
                          <div key={row.key} className="space-y-1 py-0.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className={`font-semibold ${tone.count}`}>
                                {row.count.toLocaleString()}개
                              </span>
                            </div>
                            <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded ${tone.bar}`}
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      총 {designSoftwareTotalCount.toLocaleString()}개 사업자
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드5-3: 미제공 어벗(임플란트 추가 요청) 통계 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    미제공 어벗 통계
                  </CardTitle>
                  <Puzzle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => {
                      setUnsupportedAbutmentStatsFilter("all");
                      setUnsupportedAbutmentStatsDialogOpen(true);
                    }}
                  >
                    <div className="space-y-2">
                      {unsupportedAbutmentStatRows.map((row) => {
                        const ratio = Math.max(
                          0,
                          Math.min(1, row.count / unsupportedAbutmentMaxCount),
                        );
                        const tone = getUnsupportedAbutmentToneClasses(row.key);
                        return (
                          <div key={row.key} className="space-y-1 py-0.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">{row.label}</span>
                              <span className={`font-semibold ${tone.count}`}>
                                {row.count.toLocaleString()}건
                              </span>
                            </div>
                            <div className="h-2 w-full rounded bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded ${tone.bar}`}
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      총 {unsupportedAbutmentTotal.toLocaleString()}건 · 클릭 시 치과·기공소·임플란트 상세
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드5-4: 가공 통계 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">가공 통계</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => setMachiningStatsDialogOpen(true)}
                  >
                    <div className="text-sm font-semibold text-slate-800">
                      직경별 제작 · 소요시간
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                      6·8·10·12mm 제작 건수·비율과 최소·평균·최대 가공 시간을
                      확인합니다.
                    </div>
                    <div className="mt-2 text-[11px] text-primary-strong font-medium">
                      클릭하여 통계 열기
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드6: 불완전가공 의뢰 현황 */}
              <Card className="app-glass-card app-glass-card--lg h-full flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">불완전가공 의뢰 현황</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 min-h-0 flex-col space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-md border px-2 py-2">
                      <div className="text-[11px] text-muted-foreground">가능성</div>
                      <div className="text-lg font-semibold">
                        {Number(unmachinableSummary?.potentialCount || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md border px-2 py-2 border-accent-muted bg-accent-soft/60">
                      <div className="text-[11px] text-muted-foreground">판정</div>
                      <div className="text-lg font-semibold text-accent-strong">
                        {Number(unmachinableSummary?.judgedCount || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md border px-2 py-2 border-primary-muted bg-primary-soft/60">
                      <div className="text-[11px] text-muted-foreground">확인</div>
                      <div className="text-lg font-semibold text-primary-strong">
                        {Number(unmachinableSummary?.confirmedCount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`flex-1 min-h-0 space-y-1.5 pr-1 ${
                      unmachinableItems.length >= 8
                        ? "max-h-[420px] overflow-y-auto"
                        : "overflow-visible"
                    }`}
                  >
                    {unmachinableItems.map((rawItem, idx) => {
                      const item = rawItem as Record<string, unknown>;
                      const code = String(
                        item?.unmachinableDetailCode || "none",
                      ) as UnmachinableDetailCode;
                      const caseInfos =
                        (item?.caseInfos as Record<string, unknown> | undefined) || {};
                      const clinic = String(caseInfos?.clinicName || "").trim();
                      const patient = String(caseInfos?.patientName || "").trim();
                      const title =
                        String(item?.title || "").trim() ||
                        [clinic, patient].filter(Boolean).join(" ") ||
                        String(item?.requestId || "");
                      const key = String(item?._id || item?.requestId || `unmach-${idx}`);
                      return (
                        <button
                          key={key}
                          type="button"
                          className="w-full rounded-md border px-2 py-1.5 text-left hover:bg-slate-50 transition"
                          onClick={() => {
                            setUnmachinableDetailDialog({
                              open: true,
                              item: rawItem as UnmachinableSummaryItem,
                            });
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium truncate">{title}</div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <ShippingModeBadge source={rawItem as any} size="sm" />
                              <Badge
                                variant={UNMACHINABLE_DETAIL_BADGE_VARIANT(code)}
                                className={`text-[10px] ${
                                  code === "judged" || code === "potential"
                                    ? "border-accent-muted bg-accent-soft text-accent-strong"
                                    : ""
                                }`}
                              >
                                {UNMACHINABLE_DETAIL_LABEL[code] || UNMACHINABLE_DETAIL_LABEL.none}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            의뢰번호: {String(item?.requestId || "-")} · 상태: {getNormalizedStageLabelSafe(item) || String(item?.manufacturerStage || "-")}
                          </div>
                          {String(item?.businessName || "").trim() && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              의뢰자: {String(item?.businessName || "-")}
                            </div>
                          )}
                        </button>
                      );
                    })}

                    {unmachinableItems.length === 0 && (
                      <div className="text-xs text-muted-foreground py-2 text-center">
                        표시할 불완전가공 의뢰가 없습니다.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 items-stretch">
              {/* 치과 의뢰(파일) 전송 통계 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">치과 의뢰(파일) 전송 통계</CardTitle>
                  <UploadCloud className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <button
                    type="button"
                    className="w-full px-1 py-1 text-left hover:bg-slate-50/70 transition rounded-sm"
                    onClick={() => setPracticeTransferStatsDialogOpen(true)}
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                      <div>
                        <div className="text-[11px] text-muted-foreground">전송</div>
                        <div className="text-lg font-semibold">{practiceTransferTotal.toLocaleString()}건</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">파일</div>
                        <div className="text-lg font-semibold">{practiceTransferTotalFiles.toLocaleString()}개</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">치과</div>
                        <div className="text-lg font-semibold text-primary-strong">{practiceTransferTotalPractices.toLocaleString()}곳</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">기공소</div>
                        <div className="text-lg font-semibold text-primary-strong">{practiceTransferTotalLabs.toLocaleString()}곳</div>
                      </div>
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드7: 거래금액 / 평균 단가 / 배송비 */}
              <Card className="app-glass-card app-glass-card--lg h-full lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    거래금액 / 평균 단가 / 배송비
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">유료 주문액</div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.totalRevenue ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">평균 단가</div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">전체 배송비</div>
                      <div className="text-xl font-bold">
                        ₩
                        {(
                          pricingSummary?.totalShippingFeeSupply ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">무료 주문액</div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.totalBonusRevenue ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">평균 무료 단가</div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.avgBonusUnitPrice ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">평균 배송비</div>
                      <div className="text-sm font-semibold">
                        ₩
                        {(
                          pricingSummary?.avgShippingFeeSupply ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드9: 시스템 알림 */}
              <Card className="app-glass-card app-glass-card--lg h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">시스템 알림</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.systemAlerts.length === 0 ? (
                    <div className="text-xs text-muted-foreground">현재 이상 알림이 없습니다.</div>
                  ) : (
                    data.systemAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded border bg-accent-soft/60 px-2 py-1.5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{getAlertIcon(alert.type)}</div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium break-words">
                              {alert.message}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {toDateTimeLabel(alert.date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        }
        mainLeft={undefined}
      />

      <MachiningStatisticsModal
        open={machiningStatsDialogOpen}
        onOpenChange={setMachiningStatsDialogOpen}
        token={token}
      />

      <MultiActionDialog
        open={designSoftwareStatsDialogOpen}
        onClose={() => {
          setDesignSoftwareStatsDialogOpen(false);
          setDesignSoftwareStatsFilter("all");
        }}
        title="디자인 소프트웨어 통계"
        panelClassName="!w-[min(1200px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDesignSoftwareStatsFilter("all")}
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                  designSoftwareStatsFilter === "all"
                    ? "border-slate-500 bg-white text-slate-800 ring-1 ring-slate-400"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                전체 ({designSoftwareBusinesses.length.toLocaleString()})
              </button>
              {designSoftwareStatRows.map((row) => {
                const tone = getDesignSoftwareToneClasses(row.key);
                const isActive = designSoftwareStatsFilter === row.key;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => setDesignSoftwareStatsFilter(row.key)}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                      isActive ? tone.chipActive : tone.chip
                    }`}
                  >
                    {row.label} ({row.count.toLocaleString()})
                  </button>
                );
              })}
            </div>

            <div className="max-h-[58vh] overflow-auto pr-1">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {filteredDesignSoftwareBusinesses.length > 0 ? (
                  filteredDesignSoftwareBusinesses.map((item, idx) => {
                    const anchorId = String(item?.businessAnchorId || "").trim();
                    const businessName =
                      String(item?.businessName || item?.companyName || "").trim() ||
                      anchorId ||
                      `사업자 ${idx + 1}`;
                    const software = String(item?.designSoftware || "").trim() || "미설정";
                    const softwareCategory = classifyDesignSoftware(item?.designSoftware);
                    const tone = getDesignSoftwareToneClasses(softwareCategory);

                    return (
                      <button
                        key={anchorId || `${businessName}-${idx}`}
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${tone.item}`}
                        onClick={() => openHappyCallBusinessDetail(item)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">{businessName}</div>
                          <Badge variant="outline" className={`text-[10px] ${tone.badge}`}>
                            {software}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                          대표자: {String(item?.representativeName || "-")} · 연락처: {String(item?.phoneNumber || "-")}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
                    조건에 맞는 사업자가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setDesignSoftwareStatsDialogOpen(false);
              setDesignSoftwareStatsFilter("all");
            },
          },
        ]}
      />

      <MultiActionDialog
        open={unsupportedAbutmentStatsDialogOpen}
        onClose={() => {
          setUnsupportedAbutmentStatsDialogOpen(false);
          setUnsupportedAbutmentStatsFilter("all");
        }}
        title="미제공 어벗 통계"
        panelClassName="!w-[min(1200px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUnsupportedAbutmentStatsFilter("all")}
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                    unsupportedAbutmentStatsFilter === "all"
                      ? "border-slate-500 bg-white text-slate-800 ring-1 ring-slate-400"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  전체 ({unsupportedAbutmentItems.length.toLocaleString()})
                </button>
                {unsupportedAbutmentStatRows.map((row) => {
                  const tone = getUnsupportedAbutmentToneClasses(row.key);
                  const isActive = unsupportedAbutmentStatsFilter === row.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setUnsupportedAbutmentStatsFilter(row.key)}
                      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                        isActive ? tone.chipActive : tone.chip
                      }`}
                    >
                      {row.label} ({row.count.toLocaleString()})
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="text-xs font-medium text-primary-strong hover:underline"
                onClick={() =>
                  navigate("/dashboard/platform-settings?tab=customAbut")
                }
              >
                커스텀어벗 설정에서 도입 처리 →
              </button>
            </div>

            <div className="max-h-[58vh] overflow-auto pr-1">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {filteredUnsupportedAbutmentItems.length > 0 ? (
                  filteredUnsupportedAbutmentItems.map((item, idx) => {
                    const tone = getUnsupportedAbutmentToneClasses(item.status);
                    const practiceName =
                      String(item.practiceName || "").trim() ||
                      String(item.practiceAnchorId || "").trim() ||
                      `요청 ${idx + 1}`;
                    const implantLabel =
                      String(item.implantLabel || "").trim() ||
                      String(item.manufacturer || "").trim() ||
                      "-";
                    const labNames = Array.isArray(item.labs)
                      ? item.labs
                          .map((lab) => String(lab?.labName || "").trim())
                          .filter(Boolean)
                      : [];
                    return (
                      <button
                        key={item.id || `${practiceName}-${idx}`}
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left transition ${tone.item}`}
                        onClick={() => setUnsupportedAbutmentDetailItem(item)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">
                            {practiceName}
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] ${tone.badge}`}
                          >
                            {unsupportedAbutmentStatusLabel(item.status)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-800 truncate">
                          {implantLabel}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground truncate">
                          기공소:{" "}
                          {labNames.length > 0
                            ? labNames.join(", ")
                            : "관련 의뢰 없음"}
                          {Number(item.transferCount || 0) > 0
                            ? ` · 의뢰 ${Number(item.transferCount).toLocaleString()}건`
                            : ""}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          요청 {formatUnsupportedAbutmentDate(item.createdAt)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
                    조건에 맞는 미제공·도입 요청이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setUnsupportedAbutmentStatsDialogOpen(false);
              setUnsupportedAbutmentStatsFilter("all");
            },
          },
        ]}
      />

      <MultiActionDialog
        open={Boolean(unsupportedAbutmentDetailItem)}
        onClose={() => setUnsupportedAbutmentDetailItem(null)}
        title="미제공 어벗 상세"
        panelClassName="!w-[min(720px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        description={
          unsupportedAbutmentDetailItem ? (
            <div className="space-y-4 text-sm text-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    getUnsupportedAbutmentToneClasses(
                      unsupportedAbutmentDetailItem.status,
                    ).badge
                  }
                >
                  {unsupportedAbutmentStatusLabel(
                    unsupportedAbutmentDetailItem.status,
                  )}
                </Badge>
                {unsupportedAbutmentDetailItem.isManufacturerAddRequest ? (
                  <Badge variant="outline" className="text-[10px]">
                    임플란트 추가 요청
                  </Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] text-muted-foreground">치과</div>
                  <div className="font-medium">
                    {String(unsupportedAbutmentDetailItem.practiceName || "-")}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">요청일</div>
                  <div className="font-medium">
                    {formatUnsupportedAbutmentDate(
                      unsupportedAbutmentDetailItem.createdAt,
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[11px] text-muted-foreground">임플란트</div>
                  <div className="font-medium">
                    {String(
                      unsupportedAbutmentDetailItem.implantLabel ||
                        unsupportedAbutmentDetailItem.manufacturer ||
                        "-",
                    )}
                  </div>
                  {!unsupportedAbutmentDetailItem.isManufacturerAddRequest ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {[
                        unsupportedAbutmentDetailItem.manufacturer,
                        unsupportedAbutmentDetailItem.brand,
                        unsupportedAbutmentDetailItem.family,
                        unsupportedAbutmentDetailItem.type,
                      ]
                        .map((v) => String(v || "").trim())
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[11px] text-muted-foreground">기공소</div>
                  <div className="font-medium">
                    {Array.isArray(unsupportedAbutmentDetailItem.labs) &&
                    unsupportedAbutmentDetailItem.labs.length > 0
                      ? unsupportedAbutmentDetailItem.labs
                          .map((lab) => String(lab?.labName || "").trim())
                          .filter(Boolean)
                          .join(", ")
                      : "관련 기공의뢰 없음"}
                  </div>
                </div>
              </div>

              {Array.isArray(unsupportedAbutmentDetailItem.transfers) &&
              unsupportedAbutmentDetailItem.transfers.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    관련 기공의뢰 (
                    {Number(
                      unsupportedAbutmentDetailItem.transferCount ||
                        unsupportedAbutmentDetailItem.transfers.length,
                    ).toLocaleString()}
                    )
                  </div>
                  <div className="max-h-[28vh] space-y-1.5 overflow-auto pr-1">
                    {unsupportedAbutmentDetailItem.transfers.map((transfer, idx) => (
                      <div
                        key={`${transfer.transferMongoId || transfer.transferId || idx}`}
                        className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">
                            {String(transfer.labName || "-")}
                          </span>
                          <span className="text-muted-foreground">
                            {formatUnsupportedAbutmentDate(transfer.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          의뢰{" "}
                          {String(transfer.transferId || transfer.transferMongoId || "-")}
                          {Array.isArray(transfer.teeth) && transfer.teeth.length > 0
                            ? ` · 치아 ${transfer.teeth.join(", ")}`
                            : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null
        }
        actions={[
          {
            label: "도입 설정 열기",
            variant: "primary",
            onClick: () => {
              setUnsupportedAbutmentDetailItem(null);
              navigate("/dashboard/platform-settings?tab=customAbut");
            },
          },
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => setUnsupportedAbutmentDetailItem(null),
          },
        ]}
      />

      <MultiActionDialog
        open={practiceTransferStatsDialogOpen}
        onClose={() => {
          setPracticeTransferStatsDialogOpen(false);
        }}
        title="치과 의뢰(파일) 전송 통계 상세"
        panelClassName="!w-[min(1120px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)] !h-[min(88vh,920px)] !max-h-[88vh]"
        descriptionScrollable={false}
        descriptionClassName="!mb-4 !max-h-none !overflow-hidden flex min-h-0 flex-1 flex-col"
        description={
          <div className="flex h-full min-h-0 flex-col gap-4 text-sm text-slate-700">
            <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                {
                  label: "전송",
                  value: `${practiceTransferTotal.toLocaleString()}건`,
                  className: "border-slate-200 bg-white",
                  valueClassName: "text-slate-900",
                },
                {
                  label: "파일",
                  value: `${practiceTransferTotalFiles.toLocaleString()}개`,
                  className: "border-slate-200 bg-white",
                  valueClassName: "text-slate-900",
                },
                {
                  label: "치과",
                  value: `${practiceTransferTotalPractices.toLocaleString()}곳`,
                  className: "border-primary-muted bg-primary-soft/70",
                  valueClassName: "text-primary-strong",
                },
                {
                  label: "기공소",
                  value: `${practiceTransferTotalLabs.toLocaleString()}곳`,
                  className: "border-primary-muted bg-primary-soft/70",
                  valueClassName: "text-primary-strong",
                },
                {
                  label: "활성",
                  value: `${practiceTransferActive.toLocaleString()}건`,
                  className: "border-slate-200 bg-slate-50",
                  valueClassName: "text-slate-800",
                },
                {
                  label: "취소",
                  value: `${practiceTransferCanceled.toLocaleString()}건`,
                  className: "border-destructive-muted bg-destructive-soft/80",
                  valueClassName: "text-destructive",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-xl border px-3 py-2.5 ${item.className}`}
                >
                  <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  <div className={`mt-0.5 text-base font-semibold tabular-nums sm:text-lg ${item.valueClassName}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800">치과별 전송 상위</div>
                  <div className="text-[11px] text-muted-foreground">
                    {practiceTransferTopPractices.length}곳
                  </div>
                </div>
                <div className="max-h-[9.5rem] space-y-1.5 overflow-y-auto pr-1">
                  {practiceTransferTopPractices.length > 0 ? (
                    practiceTransferTopPractices.map((row, idx) => {
                      const name =
                        String(row?.practiceName || "").trim() || "치과명 미확인";
                      return (
                        <div
                          key={`${String(row?.practiceAnchorId || "")}-${idx}`}
                          className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-900">{name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              전송 {Number(row?.transferCount || 0).toLocaleString()}건 · 파일{" "}
                              {Number(row?.fileCount || 0).toLocaleString()}개
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800">기공소별 수신 상위</div>
                  <div className="text-[11px] text-muted-foreground">
                    {practiceTransferTopLabs.length}곳
                  </div>
                </div>
                <div className="max-h-[9.5rem] space-y-1.5 overflow-y-auto pr-1">
                  {practiceTransferTopLabs.length > 0 ? (
                    practiceTransferTopLabs.map((row, idx) => {
                      const name = String(row?.labName || "").trim() || "기공소명 미확인";
                      return (
                        <div
                          key={`${String(row?.labAnchorId || "")}-${idx}`}
                          className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-strong">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-slate-900">{name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              전송 {Number(row?.transferCount || 0).toLocaleString()}건 · 파일{" "}
                              {Number(row?.fileCount || 0).toLocaleString()}개
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800">최근 전송 · 활성</div>
                  <Badge variant="outline" className="text-[10px]">
                    {practiceTransferRecentActive.length}건
                  </Badge>
                </div>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {practiceTransferRecentActive.length > 0 ? (
                    practiceTransferRecentActive.map((row, idx) => {
                      const transferId = String(row?.transferId || "-").trim() || "-";
                      const transferMongoId = String(row?.transferMongoId || "").trim();
                      const practiceName =
                        String(row?.practiceName || "").trim() || "치과명 미확인";
                      const labName = String(row?.labName || "").trim() || "기공소명 미확인";
                      return (
                        <div
                          key={`active-${transferId}-${idx}`}
                          className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-xs font-semibold text-slate-900">
                                {transferId}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-slate-600">
                                {practiceName}
                                <span className="mx-1 text-slate-300">→</span>
                                {labName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                파일 {Number(row?.fileCount || 0).toLocaleString()}개 ·{" "}
                                {toDateTimeLabel(String(row?.createdAt || ""))}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <Badge variant="outline" className="text-[10px]">
                                활성
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 border-destructive-muted px-2 text-[11px] text-destructive hover:bg-destructive-soft"
                                onClick={() =>
                                  setDeleteTransferTarget({
                                    transferId: transferId === "-" ? "" : transferId,
                                    transferMongoId,
                                  })
                                }
                                disabled={
                                  (!transferId || transferId === "-") && !transferMongoId
                                }
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                삭제
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                      활성 전송 내역이 없습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl border border-destructive-muted bg-destructive-soft/30 p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-destructive">취소건</div>
                  <Badge className="border-destructive-muted bg-destructive-soft text-[10px] text-destructive hover:bg-destructive-soft">
                    {practiceTransferRecentCanceled.length}건
                  </Badge>
                </div>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {practiceTransferRecentCanceled.length > 0 ? (
                    practiceTransferRecentCanceled.map((row, idx) => {
                      const transferId = String(row?.transferId || "-").trim() || "-";
                      const transferMongoId = String(row?.transferMongoId || "").trim();
                      const practiceName =
                        String(row?.practiceName || "").trim() || "치과명 미확인";
                      const labName = String(row?.labName || "").trim() || "기공소명 미확인";
                      return (
                        <div
                          key={`canceled-${transferId}-${idx}`}
                          className="rounded-lg border border-destructive-soft bg-white px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-xs font-semibold text-slate-900">
                                {transferId}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-slate-600">
                                {practiceName}
                                <span className="mx-1 text-slate-300">→</span>
                                {labName}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                파일 {Number(row?.fileCount || 0).toLocaleString()}개 ·{" "}
                                {toDateTimeLabel(String(row?.createdAt || ""))}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <Badge
                                variant="secondary"
                                className="bg-destructive-soft text-[10px] text-destructive"
                              >
                                취소
                              </Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 border-destructive-muted px-2 text-[11px] text-destructive hover:bg-destructive-soft"
                                onClick={() =>
                                  setRestoreTransferTarget({
                                    transferId: transferId === "-" ? "" : transferId,
                                    transferMongoId,
                                  })
                                }
                                disabled={!transferId || transferId === "-"}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" />
                                되살리기
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex h-full min-h-[8rem] items-center justify-center rounded-lg border border-dashed border-destructive-muted bg-white/70 text-xs text-muted-foreground">
                      취소건이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setPracticeTransferStatsDialogOpen(false);
            },
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(restoreTransferTarget)}
        title="이 취소건을 되살릴까요?"
        description={
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              대상: {restoreTransferTarget?.transferId || restoreTransferTarget?.transferMongoId || "-"}
            </div>
            <div className="text-sm text-muted-foreground">
              활성 상태로 복구되어 치과·기공소 전송 내역에 다시 표시됩니다.
            </div>
          </div>
        }
        confirmLabel={restoringTransfer ? "되살리는 중..." : "되살리기"}
        cancelLabel="닫기"
        onConfirm={() => void handleRestorePracticeTransfer()}
        onCancel={() => {
          if (restoringTransfer) return;
          setRestoreTransferTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTransferTarget)}
        title="이 전송건을 삭제할까요?"
        description={
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              대상: {deleteTransferTarget?.transferId || deleteTransferTarget?.transferMongoId || "-"}
            </div>
            <div className="text-sm text-muted-foreground">
              취소건으로 이동됩니다. 필요하면 취소건에서 되살릴 수 있습니다.
            </div>
          </div>
        }
        confirmLabel={deletingTransfer ? "삭제 중..." : "삭제"}
        cancelLabel="닫기"
        onConfirm={() => void handleDeletePracticeTransfer()}
        onCancel={() => {
          if (deletingTransfer) return;
          setDeleteTransferTarget(null);
        }}
      />

      <MultiActionDialog
        open={unmachinableDetailDialog.open}
        onClose={() => {
          setUnmachinableDetailDialog({ open: false, item: null });
        }}
        title="불완전가공 의뢰 상세"
        description={
          (() => {
            const item = unmachinableDetailDialog.item;
            const code = String(
              item?.unmachinableDetailCode || "none",
            ) as UnmachinableDetailCode;
            const phone = String(item?.phoneNumber || "").trim();
            const businessName =
              String(item?.businessName || item?.companyName || "").trim() || "의뢰자";
            const caseInfos =
              (item?.caseInfos as Record<string, unknown> | undefined) || {};
            const clinic = String(caseInfos?.clinicName || "").trim();
            const patient = String(caseInfos?.patientName || "").trim();
            const tooth = String(caseInfos?.tooth || "").trim();
            const reason = String(item?.rnd?.unmachinableReason || "").trim();

            return (
              <div className="space-y-3 text-sm text-gray-700">
                <div className="rounded-md border bg-slate-50 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {String(item?.title || item?.requestId || "-")}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ShippingModeBadge source={item as any} size="sm" />
                      <Badge
                        variant={UNMACHINABLE_DETAIL_BADGE_VARIANT(code)}
                        className={`text-[10px] ${
                          code === "judged" || code === "potential"
                            ? "border-accent-muted bg-accent-soft text-accent-strong"
                            : ""
                        }`}
                      >
                        {UNMACHINABLE_DETAIL_LABEL[code] || UNMACHINABLE_DETAIL_LABEL.none}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-slate-600">의뢰번호: {String(item?.requestId || "-")}</div>
                  <div className="text-xs text-slate-600">상태: {getNormalizedStageLabelSafe(item) || String(item?.manufacturerStage || "-")}</div>
                  <div className="text-xs text-slate-600">
                    케이스: {[clinic, patient, tooth ? `#${tooth}` : ""]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </div>
                </div>

                <div className="rounded-md border px-3 py-2 space-y-1.5">
                  <div className="text-xs text-slate-500">의뢰자</div>
                  <div className="text-sm font-semibold text-gray-900">{businessName}</div>
                  {String(item?.representativeName || "").trim() && (
                    <div className="text-xs text-slate-600">
                      대표자: {String(item?.representativeName || "-")}
                    </div>
                  )}
                  <div className="text-xs text-slate-600">연락처: {phone || "-"}</div>
                  {String(item?.email || "").trim() && (
                    <div className="text-xs text-slate-600">이메일: {String(item?.email || "-")}</div>
                  )}
                </div>

                <div className="rounded-md border px-3 py-2">
                  <div className="text-xs font-medium text-slate-700 mb-1">불완전가공 사유</div>
                  <div className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                    {reason || "등록된 사유가 없습니다."}
                  </div>
                </div>
              </div>
            );
          })()
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setUnmachinableDetailDialog({ open: false, item: null });
            },
          },
          {
            label: "문자",
            variant: "primary",
            disabled: !String(unmachinableDetailDialog.item?.phoneNumber || "").trim(),
            onClick: () => {
              const phone = String(unmachinableDetailDialog.item?.phoneNumber || "").replace(/\s+/g, "");
              if (!phone) return;
              window.location.href = `sms:${phone}`;
            },
          },
          {
            label: "전화",
            variant: "primary",
            disabled: !String(unmachinableDetailDialog.item?.phoneNumber || "").trim(),
            onClick: () => {
              const phone = String(unmachinableDetailDialog.item?.phoneNumber || "").trim();
              const businessName =
                String(
                  unmachinableDetailDialog.item?.businessName ||
                    unmachinableDetailDialog.item?.companyName ||
                    "",
                ).trim() || "의뢰자";
              if (!phone) return;
              setUnmachinableDetailDialog({ open: false, item: null });
              setPhoneConfirm({
                open: true,
                phone,
                businessName,
              });
            },
          },
        ]}
      />

      <MultiActionDialog
        open={riskSummaryDialogOpen}
        onClose={() => {
          setRiskSummaryDialogOpen(false);
        }}
        title="지연 위험 상세"
        panelClassName="!w-[min(1100px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>지연 가능 의뢰: {riskWarningCount.toLocaleString()}건</span>
              <span>지연 확정 의뢰: {riskDelayedCount.toLocaleString()}건</span>
              <span>정시 발송 비율: {riskOnTimeRate.toLocaleString()}%</span>
            </div>

            <div className="max-h-[60vh] overflow-auto pr-1 space-y-2">
              {riskSummaryItems.length > 0 ? (
                riskSummaryItems.map((item: Record<string, unknown>, idx: number) => {
                  const key = String(item?.id || `risk-${idx}`);
                  return (
                    <div key={key} className="rounded-md border px-3 py-2 bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold truncate">
                          {String(item?.title || item?.id || "-")}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <ShippingModeBadge source={item as any} size="sm" />
                          <Badge
                            variant={item?.riskLevel === "danger" ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {item?.riskLevel === "danger" ? "지연확정" : "지연가능"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate">
                        의뢰번호: {String(item?.id || "-")} · 상태: {getNormalizedStageLabelSafe(item) || String(item?.manufacturerStage || "-")}
                      </div>
                      {String(item?.message || "").trim() && (
                        <div className="mt-1 text-xs text-slate-600 whitespace-pre-wrap break-words">
                          {String(item?.message || "")}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-md">
                  지연 위험 내역이 없습니다.
                </div>
              )}
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setRiskSummaryDialogOpen(false);
            },
          },
        ]}
      />

      <MultiActionDialog
        open={hexVerificationDialogOpen}
        onClose={() => setHexVerificationDialogOpen(false)}
        title="ExoCAD 헥스 회전 확인"
        panelClassName="!w-[min(900px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
        descriptionScrollable={false}
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div className="text-xs text-muted-foreground">
              진행중 {hexVerificationCount.toLocaleString()}건 · 확정{" "}
              {confirmedHexVerificationCount.toLocaleString()}건 · 완료/수정 시
              관리자 확정값이 저장되며, 제조사 설정이 있으면 제조사 값이
              우선합니다.
            </div>
            <div className="max-h-[60vh] overflow-auto pr-1 space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  진행중 ({hexVerificationCount.toLocaleString()})
                </div>
                {pendingHexVerificationItems.length > 0 ? (
                  pendingHexVerificationItems.map((item) => {
                    const anchorId = item.businessAnchorId;
                    const selected =
                      hexChoiceByAnchor[anchorId] ||
                      (item.exoCadVersion === "ge_3_2"
                        ? "STL모델대로"
                        : "헥스30도회전");
                    const busy = Boolean(completingHexByAnchor[anchorId]);
                    return (
                      <div
                        key={anchorId}
                        className="rounded-md border px-3 py-2 bg-white space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {item.businessName || "사업자명 미확인"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {item.ownerName || "-"}
                              {item.ownerEmail ? ` · ${item.ownerEmail}` : ""}
                              {item.exoCadVersion
                                ? ` · ${item.exoCadVersion === "ge_3_2" ? "3.2+" : "≤3.0"}`
                                : ""}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {item.sampleRequestId
                                ? "샘플 생성됨"
                                : "샘플 대기"}
                              {item.sampleRequestId
                                ? ` · ${item.sampleRequestId}`
                                : ""}
                              {item.manufacturerDefaultHex
                                ? ` · 제조사:${item.manufacturerDefaultHex}`
                                : ""}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 border-amber-200 bg-amber-50 text-amber-700"
                          >
                            미정
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              selected === "STL모델대로" ? "default" : "outline"
                            }
                            className="h-7 text-[11px]"
                            onClick={() =>
                              setHexChoiceByAnchor((prev) => ({
                                ...prev,
                                [anchorId]: "STL모델대로",
                              }))
                            }
                            disabled={busy}
                          >
                            STL모델대로
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              selected === "헥스30도회전" ? "default" : "outline"
                            }
                            className="h-7 text-[11px]"
                            onClick={() =>
                              setHexChoiceByAnchor((prev) => ({
                                ...prev,
                                [anchorId]: "헥스30도회전",
                              }))
                            }
                            disabled={busy}
                          >
                            헥스30도회전
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-[11px] ml-auto"
                            onClick={() => completeHexVerificationForAnchor(item)}
                            disabled={busy}
                          >
                            {busy ? "저장 중…" : "완료"}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
                    {loadingHexVerification
                      ? "불러오는 중…"
                      : "진행중인 ExoCAD 헥스 확인 계정이 없습니다."}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  확정 ({confirmedHexVerificationCount.toLocaleString()})
                </div>
                {confirmedHexVerificationItems.length > 0 ? (
                  confirmedHexVerificationItems.map((item) => {
                    const anchorId = item.businessAnchorId;
                    const selected =
                      hexChoiceByAnchor[anchorId] ||
                      item.adminVerifiedHex ||
                      (item.exoCadVersion === "ge_3_2"
                        ? "STL모델대로"
                        : "헥스30도회전");
                    const busy = Boolean(completingHexByAnchor[anchorId]);
                    const dirty =
                      Boolean(hexChoiceByAnchor[anchorId]) &&
                      hexChoiceByAnchor[anchorId] !== item.adminVerifiedHex;
                    return (
                      <div
                        key={anchorId}
                        className="rounded-md border border-emerald-100 px-3 py-2 bg-emerald-50/30 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {item.businessName || "사업자명 미확인"}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {item.ownerName || "-"}
                              {item.ownerEmail ? ` · ${item.ownerEmail}` : ""}
                              {item.exoCadVersion
                                ? ` · ${item.exoCadVersion === "ge_3_2" ? "3.2+" : "≤3.0"}`
                                : ""}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              확정: {item.adminVerifiedHex || "-"}
                              {item.manufacturerDefaultHex
                                ? ` · 제조사:${item.manufacturerDefaultHex}`
                                : ""}
                              {item.sampleRequestId
                                ? ` · 샘플 ${item.sampleRequestId}`
                                : ""}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            확정
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              selected === "STL모델대로" ? "default" : "outline"
                            }
                            className="h-7 text-[11px]"
                            onClick={() =>
                              setHexChoiceByAnchor((prev) => ({
                                ...prev,
                                [anchorId]: "STL모델대로",
                              }))
                            }
                            disabled={busy}
                          >
                            STL모델대로
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              selected === "헥스30도회전" ? "default" : "outline"
                            }
                            className="h-7 text-[11px]"
                            onClick={() =>
                              setHexChoiceByAnchor((prev) => ({
                                ...prev,
                                [anchorId]: "헥스30도회전",
                              }))
                            }
                            disabled={busy}
                          >
                            헥스30도회전
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={dirty ? "default" : "outline"}
                            className="h-7 text-[11px] ml-auto"
                            onClick={() => completeHexVerificationForAnchor(item)}
                            disabled={busy || !dirty}
                          >
                            {busy ? "저장 중…" : "수정"}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
                    {loadingHexVerification
                      ? "불러오는 중…"
                      : "확정된 ExoCAD 계정이 없습니다."}
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => setHexVerificationDialogOpen(false),
          },
        ]}
      />

      <MultiActionDialog
        open={happyCallDialogOpen}
        onClose={() => {
          setHappyCallDialogOpen(false);
          setHappyCallReasonFilter("all");
          setHappyCallDialogTab("targets");
        }}
        panelClassName="!w-[min(1500px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)] !h-[88vh]"
        descriptionClassName="h-full"
        descriptionScrollable={false}
        title="이번 주 해피콜 의뢰자 목록"
        description={
          <div className="h-full min-h-0 flex flex-col gap-2">
            <div className="text-sm text-gray-700">
              품질 만족도/재주문 의향 확인을 위해 우선 연락이 필요한 의뢰자 목록입니다.
              (기준: 첫 완료, 장기 미완료, 휴면, 취소율, 불완전가공 등)
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setHappyCallDialogTab("targets")}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
                    happyCallDialogTab === "targets"
                      ? "bg-primary-strong text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  해피콜 대상
                </button>
                <button
                  type="button"
                  onClick={() => setHappyCallDialogTab("completed")}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
                    happyCallDialogTab === "completed"
                      ? "bg-primary-strong text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  완료 내역
                </button>
              </div>
            </div>

            {happyCallDialogTab === "targets" ? (
              <>
                <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    전체 의뢰자 {totalRequestorBusinessCount.toLocaleString()}개 / 해피콜 대상 {happyCallItems.length.toLocaleString()}개
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHappyCallReasonFilter("all_requestors")}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm transition ${
                      happyCallReasonFilter === "all_requestors"
                        ? "border-primary/70 bg-primary-soft text-primary-strong"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    aria-label="전체 의뢰자"
                  >
                    <span className="mr-1">전체(의뢰자)</span>
                    <Badge
                      variant={happyCallReasonFilter === "all_requestors" ? "destructive" : "secondary"}
                      className="text-[11px]"
                    >
                      {totalRequestorBusinessCount.toLocaleString()}개
                    </Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHappyCallReasonFilter("all")}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm transition ${
                      happyCallReasonFilter === "all"
                        ? "border-primary/70 bg-primary-soft text-primary-strong"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="mr-1">전체(해피콜)</span>
                    <Badge
                      variant="destructive"
                      className="text-[11px]"
                    >
                      {happyCallItems.length}개
                    </Badge>
                  </button>

                  {sortedHappyCallReasonCounts.map((row) => {
                    const code = String(row.code || "").trim();
                    const isActive = happyCallReasonFilter === code;
                    return (
                      <button
                        key={String(code || row.label)}
                        type="button"
                        onClick={() => setHappyCallReasonFilter(code || "all")}
                        className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm transition ${
                          isActive
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="mr-1">{row.label}</span>
                        <Badge
                          variant="destructive"
                          className="text-[11px]"
                        >
                          {Number(row.count || 0).toLocaleString()}개
                        </Badge>
                      </button>
                    );
                  })}
                </div>

                <div className="flex-1 min-h-0 overflow-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredHappyCallItems.map((item) => {
                    const anchorId = String(item.businessAnchorId || "").trim();
                    const phone = String(item.phoneNumber || "").trim();
                    const businessName = String(item.businessName || "").trim();
                    const companyName = String(item.companyName || "").trim();
                    const showCompanyName =
                      Boolean(companyName) && companyName !== businessName;
                    const designSoftware = String(item.designSoftware || "").trim();
                    const isCustomDesignSoftware = Boolean(
                      designSoftware &&
                        designSoftware !== "3Shape" &&
                        designSoftware !== "ExoCAD",
                    );

                    const memoEntries = Array.isArray(happyCallNotesByAnchor[anchorId])
                      ? happyCallNotesByAnchor[anchorId]
                      : [];
                    const memoExists = memoEntries.length > 0;

                    return (
                      <div
                        key={anchorId || item.businessName}
                        className="rounded-md border px-3 py-2.5 bg-white cursor-pointer hover:border-primary/70 hover:bg-primary-soft/20 transition"
                        role="button"
                        tabIndex={0}
                        onClick={() => openHappyCallBusinessDetail(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openHappyCallBusinessDetail(item);
                          }
                        }}
                      >
                        <div className="flex h-full flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="text-sm font-semibold truncate text-gray-900">
                                  {item.businessName || "-"}
                                </div>
                                {isCustomDesignSoftware ? (
                                  <Badge variant="secondary" className="text-[10px] shrink-0">
                                    custom 소프트웨어
                                  </Badge>
                                ) : null}
                              </div>
                              {showCompanyName && (
                                <div className="text-xs text-gray-500 truncate">
                                  {companyName}
                                </div>
                              )}
                              <div className="text-[11px] text-gray-500 mt-1">
                                가입일 {toDateLabel(item.createdAt)} · 첫 완료 {toDateLabel(item.firstCompletedAt)} · 최근 완료 {toDateLabel(item.lastCompletedAt)}
                              </div>
                              <div className="text-[11px] text-gray-500">
                                최근30일 주문 {Number(item.stats?.recent30Total || 0)}건 / 취소 {Number(item.stats?.recent30Canceled || 0)}건 / 완료 {Number(item.stats?.recent30Completed || 0)}건
                              </div>
                            </div>

                            {phone ? (
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-md border border-primary-strong bg-primary-strong px-3 text-xs font-semibold text-white hover:bg-primary-strong"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPhoneConfirm({
                                      open: true,
                                      phone,
                                      businessName: String(item.businessName || "").trim() || "의뢰자",
                                    });
                                  }}
                                >
                                  전화
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const normalized = String(phone || "").replace(/\s+/g, "");
                                    if (normalized) {
                                      window.location.href = `sms:${normalized}`;
                                    }
                                  }}
                                >
                                  문자
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {(item.reasons || []).map((reason) => (
                              <Badge
                                key={`${anchorId}-${reason.code}`}
                                variant={HAPPY_CALL_SEVERITY_BADGE[reason.severity] || "outline"}
                                className="text-[10px]"
                                title={reason.description}
                              >
                                {reason.label}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition shrink-0 ${
                                memoExists
                                  ? "border-accent-muted bg-accent-soft text-accent-strong hover:bg-accent-soft"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setHappyCallSelectedMemoId(
                                  memoEntries.length
                                    ? String(memoEntries[memoEntries.length - 1]?.id || "") || null
                                    : null,
                                );
                                openHappyCallMemoDialogForTarget(item);
                              }}
                            >
                              메모{memoExists ? ` (${memoEntries.length})` : ""}
                            </button>

                            <button
                              type="button"
                              className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition shrink-0 ${
                                completingHappyCallByAnchor[anchorId]
                                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "border-primary/70 bg-white text-primary-strong hover:bg-primary-soft"
                              }`}
                              disabled={Boolean(completingHappyCallByAnchor[anchorId])}
                              onClick={(e) => {
                                e.stopPropagation();
                                setHappyCallConfirm({ open: true, item });
                              }}
                            >
                              {completingHappyCallByAnchor[anchorId]
                                ? "처리 중..."
                                : "해피콜 완료"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filteredHappyCallItems.length === 0 && (
                    <div className="col-span-full text-sm text-gray-500 text-center py-6">
                      {happyCallReasonFilter === "all_requestors"
                        ? "표시할 의뢰자가 없습니다."
                        : "해당 조건의 해피콜 대상 의뢰자가 없습니다."}
                    </div>
                  )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                  <span>
                    완료 내역 총 {happyCallCompletionTotalCount.toLocaleString()}건 (최근 {happyCallCompletionItems.length.toLocaleString()}건 표시)
                  </span>
                  <button
                    type="button"
                    className={`inline-flex h-7 items-center rounded-md border px-2 text-xs transition ${
                      loadingHappyCallCompletions
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    disabled={loadingHappyCallCompletions}
                    onClick={() => {
                      void refetchHappyCallCompletions();
                    }}
                  >
                    {loadingHappyCallCompletions ? "불러오는 중..." : "새로고침"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {HAPPY_CALL_COMPLETION_PERIOD_OPTIONS.map((opt) => {
                    const isActive = happyCallCompletionPeriod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHappyCallCompletionPeriod(opt.value)}
                        className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition ${
                          isActive
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}

                  <input
                    type="text"
                    value={happyCallCompletionSearch}
                    onChange={(e) => setHappyCallCompletionSearch(String(e.target.value || ""))}
                    placeholder="의뢰자명/회사명 검색"
                    className="h-8 min-w-0 w-full flex-1 rounded-md border border-slate-300 px-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-muted sm:min-w-[180px] sm:w-auto sm:flex-none"
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {happyCallCompletionItems.map((row) => {
                      const businessName = String(row.businessName || "").trim();
                      const companyName = String(row.companyName || "").trim();
                      const showCompanyName = Boolean(companyName) && companyName !== businessName;
                      const actorName = String(row.completedByName || "").trim();
                      const actorEmail = String(row.completedByEmail || "").trim();
                      const rowAnchorId = String(row.businessAnchorId || "").trim();
                      const reverting = Boolean(revertingHappyCallByAnchor[rowAnchorId]);
                      const completionId = String(row.id || "").trim();
                      const memoEntries = Array.isArray(happyCallCompletionNotesById[completionId])
                        ? happyCallCompletionNotesById[completionId]
                        : [];

                      return (
                        <div
                          key={row.id || `${row.businessAnchorId}-${row.completedAt}`}
                          className="rounded-md border bg-white px-3 py-2.5 cursor-pointer hover:border-primary/70 hover:bg-primary-soft/20 transition"
                          role="button"
                          tabIndex={0}
                          onClick={() => openHappyCallBusinessDetail(row)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openHappyCallBusinessDetail(row);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {businessName || row.businessAnchorId || "-"}
                              </div>
                              {showCompanyName && (
                                <div className="text-xs text-gray-500 truncate">{companyName}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-semibold transition ${
                                  memoEntries.length
                                    ? "border-accent-muted bg-accent-soft text-accent-strong hover:bg-accent-soft"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHappyCallSelectedMemoId(
                                    memoEntries.length
                                      ? String(memoEntries[memoEntries.length - 1]?.id || "") || null
                                      : null,
                                  );
                                  openHappyCallMemoDialogForCompletion(row);
                                }}
                              >
                                메모{memoEntries.length ? ` (${memoEntries.length})` : ""}
                              </button>
                              <button
                                type="button"
                                title="해피콜 대상으로 되돌리기"
                                aria-label="해피콜 대상으로 되돌리기"
                                className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition ${
                                  reverting
                                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "border-accent-muted bg-white text-accent-strong hover:bg-accent-soft"
                                }`}
                                disabled={reverting || !rowAnchorId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRevertHappyCallByAnchor(
                                    rowAnchorId,
                                    businessName || companyName || "의뢰자",
                                  );
                                }}
                              >
                                {reverting ? "롤백 중..." : <RotateCcw className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500">
                            완료 시각 {toDateTimeLabel(row.completedAt)} · 숨김 해제 예정 {toDateLabel(row.suppressUntil)}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            처리자 {actorName || "-"}
                            {actorEmail ? ` (${actorEmail})` : ""}
                          </div>
                          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 whitespace-pre-wrap break-words">
                            {String(row.note || "").trim() || "메모 없음"}
                          </div>

                        </div>
                      );
                    })}

                    {!loadingHappyCallCompletions && happyCallCompletionItems.length === 0 && (
                      <div className="col-span-full text-sm text-gray-500 text-center py-6">
                        조건에 맞는 완료 처리 내역이 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        }
        actions={[]}
      />

      <MultiActionDialog
        open={happyCallConfirm.open}
        onClose={() => {
          setHappyCallConfirm({ open: false, item: null });
        }}
        title="해피콜 완료 처리"
        description={
          <div className="space-y-2 text-sm text-gray-700">
            <div>
              <span className="font-semibold text-gray-900">
                {String(happyCallConfirm.item?.businessName || happyCallConfirm.item?.companyName || "해당 의뢰자")}
              </span>
              의 해피콜을 완료 처리할까요?
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-700">저장될 메모 로그</div>
              {(() => {
                const anchorId = String(happyCallConfirm.item?.businessAnchorId || "").trim();
                const memoEntries = Array.isArray(happyCallNotesByAnchor[anchorId])
                  ? happyCallNotesByAnchor[anchorId]
                  : [];

                if (!memoEntries.length) {
                  return (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 min-h-[64px]">
                      메모 없음
                    </div>
                  );
                }

                return (
                  <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 max-h-[180px] overflow-auto">
                    {memoEntries.map((entry) => (
                      <div key={entry.id} className="rounded-md bg-white px-2 py-1.5 text-xs text-slate-700 border border-slate-200">
                        <div className="text-[10px] text-slate-500 mb-0.5">{toDateTimeLabel(entry.savedAt)}</div>
                        <div className="whitespace-pre-wrap break-words">{String(entry.message || "-")}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        }
        actions={[
          {
            label: "취소",
            variant: "secondary",
            onClick: () => {
              setHappyCallConfirm({ open: false, item: null });
            },
          },
          {
            label: "완료 처리",
            variant: "primary",
            onClick: async () => {
              const target = happyCallConfirm.item;
              const anchorId = String(target?.businessAnchorId || "").trim();
              const memoEntries = Array.isArray(happyCallNotesByAnchor[anchorId])
                ? happyCallNotesByAnchor[anchorId]
                : [];
              const noteToSave = toHappyCallMemoPayload(memoEntries);
              setHappyCallConfirm({ open: false, item: null });
              if (!target) return;
              await handleCompleteHappyCall(target, noteToSave);
            },
          },
        ]}
      />

      <MultiActionDialog
        open={happyCallMemoDialog.open}
        onClose={() => {
          if (savingHappyCallMemo) return;
          setHappyCallMemoDialog({ open: false, item: null });
          setHappyCallMemoDraft("");
          setHappyCallSelectedMemoId(null);
        }}
        title="해피콜 메모"
        panelClassName="!w-[min(1100px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)] overflow-hidden"
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <span className="font-semibold text-gray-900">
                {String(happyCallMemoDialog.item?.businessName || happyCallMemoDialog.item?.companyName || "해당 의뢰자")}
              </span>
              의 해피콜 메모입니다.
            </div>

            {(() => {
              const mode = happyCallMemoDialog.item?.mode;
              const anchorId = String(happyCallMemoDialog.item?.businessAnchorId || "").trim();
              const completionId = String(happyCallMemoDialog.item?.completionId || "").trim();
              const memoEntries =
                mode === "completion"
                  ? Array.isArray(happyCallCompletionNotesById[completionId])
                    ? happyCallCompletionNotesById[completionId]
                    : []
                  : Array.isArray(happyCallNotesByAnchor[anchorId])
                    ? happyCallNotesByAnchor[anchorId]
                    : [];

              const selectedEntry = memoEntries.find(
                (entry) => entry.id === happyCallSelectedMemoId,
              ) || null;

              return (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                  <div className="xl:col-span-7 min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-700">기존 메모 목록</div>

                    <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
                      {memoEntries.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-3 text-xs text-slate-500 text-center">
                          저장된 메모가 없습니다.
                        </div>
                      ) : (
                        [...memoEntries]
                          .sort((a, b) =>
                            new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
                          )
                          .map((entry, idx) => {
                            const isActive = entry.id === happyCallSelectedMemoId;
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                onClick={() => setHappyCallSelectedMemoId(entry.id)}
                                className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                                  isActive
                                    ? "border-primary/70 bg-primary-soft"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[11px] font-medium text-slate-700">
                                    메모 {memoEntries.length - idx}
                                  </div>
                                  <div className="text-[10px] text-slate-500 shrink-0">
                                    {toDateTimeLabel(entry.savedAt)}
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-slate-600 truncate">
                                  {String(entry.message || "-")}
                                </div>
                              </button>
                            );
                          })
                      )}
                    </div>

                    <div className="rounded-md border border-slate-200 bg-white p-2.5 min-h-[150px] max-h-[220px] overflow-y-auto">
                      <div className="text-[11px] text-slate-500 mb-1">
                        {selectedEntry ? toDateTimeLabel(selectedEntry.savedAt) : "메모를 선택하세요"}
                      </div>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                        {selectedEntry
                          ? String(selectedEntry.message || "-")
                          : memoEntries.length
                            ? "왼쪽 목록에서 메모를 선택하면 내용이 표시됩니다."
                            : "아직 메모가 없습니다."}
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-5 min-w-0 rounded-md border border-slate-200 bg-white p-3 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-700">신규 메모 추가</div>
                    <textarea
                      value={happyCallMemoDraft}
                      onChange={(e) =>
                        setHappyCallMemoDraft(String(e.target.value || "").slice(0, 500))
                      }
                      className="w-full min-h-[260px] rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-muted resize-y"
                    />
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">저장 시 현재 시각이 자동 기록됩니다.</span>
                      <span className="shrink-0">{String(happyCallMemoDraft || "").length}/500</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        }
        actions={[
          {
            label: "취소",
            variant: "secondary",
            onClick: () => {
              if (savingHappyCallMemo) return;
              setHappyCallMemoDialog({ open: false, item: null });
              setHappyCallMemoDraft("");
              setHappyCallSelectedMemoId(null);
            },
          },
          {
            label: savingHappyCallMemo ? "저장 중..." : "메모 추가",
            variant: "primary",
            onClick: async () => {
              if (savingHappyCallMemo) return;
              await handleSaveHappyCallMemoFromDialog();
            },
          },
        ]}
      />

      <MultiActionDialog
        open={Boolean(happyCallDetailItem)}
        onClose={() => {
          setHappyCallDetailItem(null);
        }}
        title="의뢰자 상세 정보"
        description={
          <div className="space-y-2 text-sm text-gray-700">
            <div className="text-base font-semibold text-gray-900">
              {String(happyCallDetailItem?.businessName || "-")}
            </div>
            {String(happyCallDetailItem?.companyName || "").trim() && (
              <div className="text-xs text-gray-500">
                상호명: {String(happyCallDetailItem?.companyName || "-")}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs"><span className="font-medium text-slate-700">대표자명:</span> {String(happyCallDetailItem?.representativeName || "-")}</div>
              <div className="text-xs"><span className="font-medium text-slate-700">전화번호:</span> {String(happyCallDetailItem?.phoneNumber || "-")}</div>
              <div className="text-xs"><span className="font-medium text-slate-700">이메일:</span> {String(happyCallDetailItem?.email || "-")}</div>
              <div className="text-xs"><span className="font-medium text-slate-700">사업자번호:</span> {String(happyCallDetailItem?.businessNumber || "-")}</div>
              <div className="text-xs"><span className="font-medium text-slate-700">주소:</span> {[
                String(happyCallDetailItem?.address || "").trim(),
                String(happyCallDetailItem?.addressDetail || "").trim(),
              ].filter(Boolean).join(" ") || "-"}</div>
              <div className="text-xs"><span className="font-medium text-slate-700">우편번호:</span> {String(happyCallDetailItem?.zipCode || "-")}</div>
            </div>
          </div>
        }
        actions={[
          {
            label: "닫기",
            variant: "secondary",
            onClick: () => {
              setHappyCallDetailItem(null);
            },
          },
        ]}
      />

      <MultiActionDialog
        open={phoneConfirm.open}
        onClose={() => {
          setPhoneConfirm({ open: false, phone: "", businessName: "" });
        }}
        title="전화 연결"
        description={
          <div className="space-y-2 text-sm text-gray-700">
            <div>
              <span className="font-semibold text-gray-900">{phoneConfirm.businessName}</span>
              {" "}의 연락처로 전화를 연결할까요?
            </div>
            <div className="text-xs text-gray-500">번호: {phoneConfirm.phone || "-"}</div>
          </div>
        }
        actions={[
          {
            label: "취소",
            variant: "secondary",
            onClick: () => {
              setPhoneConfirm({ open: false, phone: "", businessName: "" });
            },
          },
          {
            label: "전화 연결",
            variant: "primary",
            onClick: () => {
              const normalized = String(phoneConfirm.phone || "").replace(/\s+/g, "");
              if (normalized) {
                window.location.href = `tel:${normalized}`;
              }
              setPhoneConfirm({ open: false, phone: "", businessName: "" });
            },
          },
        ]}
      />
    </>
  );
};
