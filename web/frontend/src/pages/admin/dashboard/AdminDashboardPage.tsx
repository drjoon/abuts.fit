
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePeriodStore } from "@/store/usePeriodStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { useAdminCommBadges } from "@/shared/hooks/useAdminCommBadges";
import {
  Users,
  FileText,
  CheckCircle,
  AlertCircle,
  DollarSign,
  MessageSquare,
  Mail,
  MessageCircle,
  HelpCircle,
  PhoneCall,
  RotateCcw,
} from "lucide-react";

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
  icon: any;
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
  companyName?: string;
  representativeName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  businessNumber?: string;
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

type PricingSsotHealth = {
  success?: boolean;
  mismatchCount?: number;
  checkedSnapshotCount?: number;
  checkedAt?: string | null;
  range?: {
    startYmd?: string;
    endYmd?: string;
  } | null;
  topMismatches?: Array<{
    businessAnchorId?: string;
    name?: string;
    gap?: number;
    latestRequestMongoId?: string;
    latestRequestId?: string;
  }>;
};

type UnmachinableDetailCode = "potential" | "judged" | "confirmed" | "none";

const UNMACHINABLE_DETAIL_LABEL: Record<UnmachinableDetailCode, string> = {
  potential: "가공불가 가능성 있음",
  judged: "제조사 가공불가 판정",
  confirmed: "의뢰자 가공불가 확인",
  none: "-",
};

const UNMACHINABLE_DETAIL_BADGE_VARIANT = (
  code: UnmachinableDetailCode,
): "outline" | "secondary" | "destructive" => {
  if (code === "judged") return "destructive";
  if (code === "confirmed") return "secondary";
  return "outline";
};

const getAlertIcon = (type: string) => {
  switch (type) {
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "info":
    default:
      return <AlertCircle className="h-4 w-4 text-blue-500" />;
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

export const AdminDashboardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { period, setPeriod } = usePeriodStore();
  const { counts: commBadgeCounts } = useAdminCommBadges();
  const [happyCallDialogOpen, setHappyCallDialogOpen] = useState(false);
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
    item: HappyCallItem | null;
  }>({
    open: false,
    item: null,
  });
  const [happyCallMemoDraft, setHappyCallMemoDraft] = useState("");
  const [happyCallNotesByAnchor, setHappyCallNotesByAnchor] = useState<
    Record<string, HappyCallMemoEntry[]>
  >({});
  const [happyCallDetailItem, setHappyCallDetailItem] = useState<HappyCallBusinessDetail | null>(null);

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

  const { data: riskSummaryResponse } = useQuery({
    queryKey: ["admin-dashboard-risk-summary", period],
    enabled: Boolean(token) && user?.role === "admin",
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: `/api/requests/dashboard-risk-summary?period=${period}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("지연 위험 요약 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: any) {
        if (e?.name === "AbortError") {
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
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      try {
        const res = await apiFetch<any>({
          path: `/api/admin/dashboard?period=${encodeURIComponent(period)}`,
          method: "GET",
          token,
          signal: controller.signal,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error("관리자 대시보드 조회에 실패했습니다.");
        }
        return res.data;
      } catch (e: any) {
        if (e?.name === "AbortError") {
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

      const res = await apiFetch<any>({
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

  const pricingSsotHealth: PricingSsotHealth | null =
    adminDashboardResponse?.success
      ? (adminDashboardResponse.data?.pricingSsotHealth ?? null)
      : null;

  const pricingSsotCheckedAtLabel = pricingSsotHealth?.checkedAt
    ? new Date(pricingSsotHealth.checkedAt).toLocaleString("ko-KR")
    : "-";

  const pricingSsotMismatchCount = Number(
    pricingSsotHealth?.mismatchCount || 0,
  );
  const pricingSsotOk =
    Boolean(pricingSsotHealth?.success) && pricingSsotMismatchCount === 0;

  const unmachinableSummary = adminDashboardResponse?.success
    ? (adminDashboardResponse.data?.unmachinableSummary ?? null)
    : null;

  const unmachinableRequestIdSet = new Set(
    (Array.isArray(unmachinableSummary?.items)
      ? unmachinableSummary.items
      : []
    )
      .map((item: any) => String(item?.requestId || "").trim())
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
      (item: any) => !unmachinableRequestIdSet.has(String(item?.id || "").trim()),
    );

    if (filteredItems.length === originalItems.length) {
      return baseSummary;
    }

    const delayedCount = filteredItems.filter(
      (item: any) => item?.riskLevel === "danger",
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

  const totalRequestorBusinessCount = Number(
    adminDashboardResponse?.data?.userStats?.requestorBusinessCount ?? 0,
  );

  const happyCallItems = Array.isArray(happyCallSummary?.items)
    ? happyCallSummary.items
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
    happyCallReasonFilter === "all"
      ? happyCallItems
      : happyCallItems.filter((item) =>
          Array.isArray(item?.reasons)
            ? item.reasons.some(
                (reason) =>
                  String(reason?.code || "").trim() === happyCallReasonFilter,
              )
            : false,
        );

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
      const res = await apiFetch<any>({
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
    } catch (error: any) {
      toast({
        title: "해피콜 완료 처리 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
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
      const res = await apiFetch<any>({
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
    } catch (error: any) {
      toast({
        title: "롤백 실패",
        description: String(error?.message || "잠시 후 다시 시도해주세요."),
        variant: "destructive",
      });
    } finally {
      setRevertingHappyCallByAnchor((prev) => ({
        ...prev,
        [businessAnchorId]: false,
      }));
    }
  };

  if (adminDashboardResponse?.success) {
    const userStats = adminDashboardResponse.data.userStats || {};
    const requestStats = adminDashboardResponse.data.requestStats || {};
    const systemAlerts = adminDashboardResponse.data.systemAlerts || [];

    const totalUsers = userStats.total ?? 0;

    const byStatus = requestStats.byStatus || {};
    const totalRequests = requestStats.total ?? 0;

    const receive = byStatus["의뢰"] ?? 0;
    const cam = byStatus["CAM"] ?? 0;
    const machining = byStatus["가공"] ?? 0;
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
          label: "의뢰/CAM",
          value: `${receive}/${cam}`,
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
        topSection={
          <div className="grid grid-cols-1 gap-3 items-stretch xl:grid-cols-2">
            <RequestorRiskSummaryCard riskSummary={riskSummary} />

            <Card className="app-glass-card app-glass-card--lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">가공불가 의뢰 현황</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border px-2 py-2">
                    <div className="text-[11px] text-muted-foreground">가능성</div>
                    <div className="text-lg font-semibold">
                      {Number(unmachinableSummary?.potentialCount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-md border px-2 py-2 border-red-200 bg-red-50/60">
                    <div className="text-[11px] text-muted-foreground">판정</div>
                    <div className="text-lg font-semibold text-red-700">
                      {Number(unmachinableSummary?.judgedCount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-md border px-2 py-2 border-blue-200 bg-blue-50/60">
                    <div className="text-[11px] text-muted-foreground">확인</div>
                    <div className="text-lg font-semibold text-blue-700">
                      {Number(unmachinableSummary?.confirmedCount || 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                  {(Array.isArray(unmachinableSummary?.items)
                    ? unmachinableSummary.items
                    : []
                  ).map((rawItem, idx) => {
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
                      <div
                        key={key}
                        className="rounded-md border px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium truncate">{title}</div>
                          <Badge
                            variant={UNMACHINABLE_DETAIL_BADGE_VARIANT(code)}
                            className="text-[10px]"
                          >
                            {UNMACHINABLE_DETAIL_LABEL[code] || UNMACHINABLE_DETAIL_LABEL.none}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          의뢰번호: {String(item?.requestId || "-")} · 상태: {String(item?.manufacturerStage || "-")}
                        </div>
                      </div>
                    );
                  })}

                  {Number((unmachinableSummary?.items || []).length || 0) === 0 && (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      표시할 가공불가 의뢰가 없습니다.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        }
        stats={
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* 카드1: 전체 사용자 / 전체 완료 주문 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    사용자 / 주문
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      의뢰자 사업자
                    </div>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold">
                      {(
                        adminDashboardResponse?.data?.userStats
                          ?.requestorBusinessCount ?? 0
                      ).toLocaleString()}
                      개
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      전체 완료 주문
                    </div>
                    <div className="text-lg font-semibold">
                      {Number(completionSummary?.total || 0).toLocaleString()}건
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드X: 이번 주 해피콜 의뢰자 */}
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
                    className="w-full rounded-md border px-3 py-3 text-left hover:bg-slate-50 transition"
                    onClick={() => {
                      setHappyCallReasonFilter("all");
                      setHappyCallDialogTab("targets");
                      setHappyCallDialogOpen(true);
                    }}
                  >
                    <div className="flex items-end justify-between gap-2">
                      <div className="text-xs text-muted-foreground">해피콜 대상 의뢰자</div>
                      <div className="text-3xl font-bold text-blue-700 leading-none">
                        {Number(happyCallSummary?.totalRequestorCount || 0).toLocaleString()}개
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      전체 {totalRequestorBusinessCount.toLocaleString()}개 중
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      클릭하면 해피콜 대상 목록을 확인할 수 있습니다.
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* 카드2: 진행/완료/취소 - 유료/무료 분리 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    진행 / 완료 / 취소
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-end justify-between gap-2 mr-6">
                      <div className="text-xs text-muted-foreground">진행</div>
                      <div className="text-2xl font-bold">
                        {(
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["의뢰"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["CAM"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["가공"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["세척.패킹"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["포장.발송"] || 0,
                          ) +
                          Number(
                            adminDashboardResponse?.data?.requestStats
                              ?.byStatus?.["추적관리"] || 0,
                          )
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 ml-6">
                      <div className="text-xs text-muted-foreground">취소</div>
                      <div className="text-2xl font-bold text-muted-foreground">
                        {Number(
                          adminDashboardResponse?.data?.requestStats
                            ?.byStatus?.["취소"] || 0,
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-end justify-between gap-2 mr-6">
                      <div className="text-xs text-muted-foreground">
                        완료(유료)
                      </div>
                      <div className="text-lg font-semibold">
                        {Number(completionSummary?.paid || 0).toLocaleString()}건
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2 ml-6">
                      <div className="text-xs text-muted-foreground">
                        완료(무료)
                      </div>
                      <div className="text-lg font-semibold text-muted-foreground">
                        {Number(completionSummary?.free || 0).toLocaleString()}건
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* 카드4: 거래금액 / 평균 단가 / 배송비 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    거래금액 / 평균 단가 / 배송비
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        유료 주문액
                      </div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.totalRevenue ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 단가
                      </div>
                      <div className="text-xl font-bold">
                        ₩{(pricingSummary?.avgUnitPrice ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        전체 배송비
                      </div>
                      <div className="text-xl font-bold">
                        ₩
                        {(
                          pricingSummary?.totalShippingFeeSupply ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        무료 주문액
                      </div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.totalBonusRevenue ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 무료 단가
                      </div>
                      <div className="text-sm font-semibold text-muted-foreground">
                        ₩
                        {(
                          pricingSummary?.avgBonusUnitPrice ?? 0
                        ).toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        평균 배송비
                      </div>
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

              {/* 카드5: 미처리 통신 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    미처리 통신
                  </CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageCircle className="h-3 w-3" />
                        채팅
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.chat.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        메시지
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.request.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        메일
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.mail.toLocaleString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <HelpCircle className="h-3 w-3" />
                        문의
                      </div>
                      <div className="text-xl font-bold">
                        {commBadgeCounts.inquiry.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 카드6: 가격/리퍼럴 SSOT 점검 */}
              <Card className="app-glass-card app-glass-card--lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    가격 SSOT 점검
                  </CardTitle>
                  <CheckCircle
                    className={`h-4 w-4 ${
                      pricingSsotOk ? "text-green-500" : "text-yellow-500"
                    }`}
                  />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      점검 상태
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        pricingSsotOk ? "text-green-600" : "text-yellow-600"
                      }`}
                    >
                      {pricingSsotOk ? "정상" : "불일치"}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      불일치 건수
                    </div>
                    <div className="text-lg font-semibold">
                      {pricingSsotMismatchCount.toLocaleString()}건
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      점검 기준 스냅샷 수
                    </div>
                    <div className="text-sm font-semibold">
                      {Number(
                        pricingSsotHealth?.checkedSnapshotCount || 0,
                      ).toLocaleString()}
                      건
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    마지막 점검: {pricingSsotCheckedAtLabel}
                  </div>
                  {pricingSsotMismatchCount > 0 &&
                    (pricingSsotHealth?.topMismatches || []).length > 0 && (
                      <div className="border-t pt-2">
                        <div className="text-xs text-muted-foreground mb-1">
                          상위 불일치
                        </div>
                        <div className="space-y-1">
                          {(pricingSsotHealth?.topMismatches || [])
                            .slice(0, 3)
                            .map((m) => {
                              const key = String(
                                m.businessAnchorId ||
                                  m.latestRequestMongoId ||
                                  m.name ||
                                  "",
                              );
                              const latestRequestMongoId = String(
                                m.latestRequestMongoId || "",
                              ).trim();
                              const latestRequestId = String(
                                m.latestRequestId || "",
                              ).trim();
                              const businessAnchorId = String(
                                m.businessAnchorId || "",
                              ).trim();

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className="w-full flex items-center justify-between text-xs hover:bg-yellow-50 rounded px-1 py-0.5"
                                  onClick={() => {
                                    // 우선순위:
                                    // 1) 대표 요청이 있으면 요청 모니터링으로 이동(해당 요청 focus)
                                    // 2) 요청이 없으면 사업자 페이지로 이동(해당 anchor focus)
                                    if (latestRequestMongoId) {
                                      const qs = new URLSearchParams();
                                      if (latestRequestMongoId) {
                                        qs.set(
                                          "focusRequestMongoId",
                                          latestRequestMongoId,
                                        );
                                      }
                                      if (latestRequestId) {
                                        qs.set("q", latestRequestId);
                                      }
                                      navigate(
                                        `/dashboard/monitoring?${qs.toString()}`,
                                      );
                                      return;
                                    }

                                    if (businessAnchorId) {
                                      const qs = new URLSearchParams();
                                      qs.set("focusAnchorId", businessAnchorId);
                                      qs.set("q", businessAnchorId);
                                      navigate(
                                        `/dashboard/businesses?${qs.toString()}`,
                                      );
                                    }
                                  }}
                                >
                                  <span className="truncate mr-2 text-left">
                                    {m.name || m.businessAnchorId || "-"}
                                  </span>
                                  <span className="font-semibold text-yellow-700 shrink-0">
                                    gap {Number(m.gap || 0).toLocaleString()}
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
          </>
        }
        mainLeft={undefined}
      />

      <MultiActionDialog
        open={happyCallDialogOpen}
        onClose={() => {
          setHappyCallDialogOpen(false);
          setHappyCallReasonFilter("all");
          setHappyCallDialogTab("targets");
        }}
        panelClassName="!w-[94vw] !max-w-[1500px] !h-[88vh]"
        descriptionClassName="h-full"
        descriptionScrollable={false}
        title="이번 주 해피콜 의뢰자 목록"
        description={
          <div className="h-full min-h-0 flex flex-col gap-2">
            <div className="text-sm text-gray-700">
              품질 만족도/재주문 의향 확인을 위해 우선 연락이 필요한 의뢰자 목록입니다.
              (기준: 첫 완료, 장기 미완료, 휴면, 취소율, 가공불가 등)
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setHappyCallDialogTab("targets")}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition ${
                    happyCallDialogTab === "targets"
                      ? "bg-blue-600 text-white"
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
                      ? "bg-blue-600 text-white"
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
                    onClick={() => setHappyCallReasonFilter("all")}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm transition ${
                      happyCallReasonFilter === "all"
                        ? "border-blue-300 bg-blue-50 text-blue-700"
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
                            ? "border-blue-300 bg-blue-50 text-blue-700"
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
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                  {filteredHappyCallItems.map((item) => {
                    const anchorId = String(item.businessAnchorId || "").trim();
                    const phone = String(item.phoneNumber || "").trim();
                    const businessName = String(item.businessName || "").trim();
                    const companyName = String(item.companyName || "").trim();
                    const showCompanyName =
                      Boolean(companyName) && companyName !== businessName;

                    const memoEntries = Array.isArray(happyCallNotesByAnchor[anchorId])
                      ? happyCallNotesByAnchor[anchorId]
                      : [];
                    const memoExists = memoEntries.length > 0;

                    return (
                      <div
                        key={anchorId || item.businessName}
                        className="rounded-md border px-3 py-2.5 bg-white cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition"
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
                              <div className="text-sm font-semibold truncate text-gray-900">
                                {item.businessName || "-"}
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
                                  className="inline-flex h-8 items-center rounded-md border border-blue-600 bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
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
                                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setHappyCallMemoDraft("");
                                setHappyCallMemoDialog({ open: true, item });
                              }}
                            >
                              메모{memoExists ? ` (${memoEntries.length})` : ""}
                            </button>

                            <button
                              type="button"
                              className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition shrink-0 ${
                                completingHappyCallByAnchor[anchorId]
                                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "border-blue-400 bg-white text-blue-700 hover:bg-blue-50"
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
                      해당 조건의 해피콜 대상 의뢰자가 없습니다.
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
                            ? "border-blue-300 bg-blue-50 text-blue-700"
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
                    className="h-8 min-w-[220px] rounded-md border border-slate-300 px-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-auto pr-1">
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                    {happyCallCompletionItems.map((row) => {
                      const businessName = String(row.businessName || "").trim();
                      const companyName = String(row.companyName || "").trim();
                      const showCompanyName = Boolean(companyName) && companyName !== businessName;
                      const actorName = String(row.completedByName || "").trim();
                      const actorEmail = String(row.completedByEmail || "").trim();
                      const rowAnchorId = String(row.businessAnchorId || "").trim();
                      const reverting = Boolean(revertingHappyCallByAnchor[rowAnchorId]);

                      return (
                        <div
                          key={row.id || `${row.businessAnchorId}-${row.completedAt}`}
                          className="rounded-md border bg-white px-3 py-2.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition"
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
                            <button
                              type="button"
                              title="롤백"
                              aria-label="롤백"
                              className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition shrink-0 ${
                                reverting
                                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "border-amber-300 bg-white text-amber-700 hover:bg-amber-50"
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
          setHappyCallMemoDialog({ open: false, item: null });
          setHappyCallMemoDraft("");
        }}
        title="해피콜 메모"
        description={
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <span className="font-semibold text-gray-900">
                {String(happyCallMemoDialog.item?.businessName || happyCallMemoDialog.item?.companyName || "해당 의뢰자")}
              </span>
              의 대화 메모를 계속 추가하세요.
            </div>

            {(() => {
              const anchorId = String(happyCallMemoDialog.item?.businessAnchorId || "").trim();
              const memoEntries = Array.isArray(happyCallNotesByAnchor[anchorId])
                ? happyCallNotesByAnchor[anchorId]
                : [];

              if (!memoEntries.length) {
                return (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                    아직 저장된 메모가 없습니다. 아래에 새 메모를 입력해 추가하세요.
                  </div>
                );
              }

              return (
                <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 max-h-[180px] overflow-auto">
                  {memoEntries.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <div className="text-[10px] text-slate-500 mb-0.5">{toDateTimeLabel(entry.savedAt)}</div>
                      <div className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                        {String(entry.message || "-")}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">새 메모 추가</div>
              <textarea
                value={happyCallMemoDraft}
                onChange={(e) =>
                  setHappyCallMemoDraft(String(e.target.value || "").slice(0, 500))
                }
                className="w-full min-h-[110px] rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>저장 시 현재 시각이 자동으로 기록됩니다.</span>
              <span>{String(happyCallMemoDraft || "").length}/500</span>
            </div>
          </div>
        }
        actions={[
          {
            label: "취소",
            variant: "secondary",
            onClick: () => {
              setHappyCallMemoDialog({ open: false, item: null });
              setHappyCallMemoDraft("");
            },
          },
          {
            label: "메모 추가",
            variant: "primary",
            onClick: () => {
              const anchorId = String(happyCallMemoDialog.item?.businessAnchorId || "").trim();
              const message = String(happyCallMemoDraft || "").slice(0, 500).trim();

              if (!anchorId) {
                setHappyCallMemoDialog({ open: false, item: null });
                setHappyCallMemoDraft("");
                return;
              }

              if (!message) {
                toast({
                  title: "메모를 입력해주세요",
                  description: "추가할 메모 내용을 입력한 뒤 저장해주세요.",
                  variant: "destructive",
                });
                return;
              }

              const savedAt = new Date().toISOString();
              const entry: HappyCallMemoEntry = {
                id: `${savedAt}-${Math.random().toString(36).slice(2, 8)}`,
                message,
                savedAt,
              };

              setHappyCallNotesByAnchor((prev) => {
                const current = Array.isArray(prev[anchorId]) ? prev[anchorId] : [];
                return {
                  ...prev,
                  [anchorId]: [...current, entry],
                };
              });
              setHappyCallMemoDraft("");
              toast({
                title: "메모 추가",
                description: "해피콜 메모가 누적 저장되었습니다.",
              });
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
