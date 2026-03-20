import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

export type RequestorReferralStats = {
  myLastMonthOrders?: number;
  myLast30DaysOrders?: number;
  groupTotalOrders?: number;
  groupMemberCount?: number;
  referralBusinessCount?: number;
  referralBusinessOrders?: number;
  selfBusinessOrders?: number;
  statsMode?: "group" | "referral";
  effectiveUnitPrice?: number;
  baseUnitPrice?: number;
  discountAmount?: number;
  rule?: string;
  maxDiscountPerUnit?: number;
  discountPerOrder?: number;
};

type UseReferralDataOptions = {
  fetchStats?: boolean;
  fetchDirectMembers?: boolean;
  fetchTree?: boolean;
};

export type DirectMemberRow = {
  _id: string;
  name?: string;
  email?: string;
  business?: string;
  organization?: string;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string | null;
  lastMonthOrders?: number;
  last30DaysOrders?: number;
};

export type ReferralTreeNode = {
  _id: string;
  role?: "requestor" | "salesman" | "devops";
  name?: string;
  email?: string;
  business?: string;
  businessAnchorId?: string;
  active?: boolean;
  lastMonthOrders?: number;
  children?: ReferralTreeNode[];
};

const buildReferralSignupLink = (referralCode: string) => {
  const code = String(referralCode || "")
    .trim()
    .toUpperCase();
  if (!code) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/signup/referral?ref=${encodeURIComponent(code)}`;
};

export const useReferralData = (options?: UseReferralDataOptions) => {
  const { user, token } = useAuthStore();
  const { toast } = useToast();
  const fetchStats = options?.fetchStats ?? true;
  const fetchDirectMembers = options?.fetchDirectMembers ?? true;
  const fetchTree = options?.fetchTree ?? true;

  const [requestorStats, setRequestorStats] =
    useState<RequestorReferralStats | null>(null);
  const [loadingRequestor, setLoadingRequestor] = useState(false);

  const [directMembers, setDirectMembers] = useState<DirectMemberRow[]>([]);
  const [loadingDirectMembers, setLoadingDirectMembers] = useState(false);

  const [treeData, setTreeData] = useState<ReferralTreeNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const isReferralEligible =
    user?.role === "requestor" ||
    user?.role === "salesman" ||
    user?.role === "devops";

  const referralCode = useMemo(
    () =>
      String(user?.referralCode || "")
        .trim()
        .toUpperCase(),
    [user?.referralCode],
  );

  const referralLink = useMemo(() => {
    return buildReferralSignupLink(referralCode);
  }, [referralCode]);

  useEffect(() => {
    if (!token || !isReferralEligible || !fetchStats) return;

    setLoadingRequestor(true);
    request<any>({
      path: "/api/requests/my/pricing-referral-stats",
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "소개 통계 조회에 실패했습니다.");
        }
        setRequestorStats((body.data || {}) as RequestorReferralStats);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingRequestor(false));
  }, [fetchStats, isReferralEligible, toast, token]);

  useEffect(() => {
    if (!token || !isReferralEligible || !fetchDirectMembers) return;

    setLoadingDirectMembers(true);
    request<any>({
      path: "/api/requests/my/referral-direct-members",
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(
            body?.message || "직접 소개 사업자 조회에 실패했습니다.",
          );
        }
        setDirectMembers((body.data?.members || []) as DirectMemberRow[]);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingDirectMembers(false));
  }, [fetchDirectMembers, isReferralEligible, toast, token]);

  useEffect(() => {
    if (!token || !isReferralEligible || !user?.id || !fetchTree) {
      console.log("[useReferralData] 트리 로딩 스킵:", {
        token: !!token,
        isReferralEligible,
        userId: user?.id,
      });
      return;
    }

    console.log("[useReferralData] 트리 로딩 시작:", {
      userId: user.id,
      role: user.role,
    });
    setLoadingTree(true);
    request<any>({
      path: `/api/referral-groups/${user.id}/tree?lite=1`,
      method: "GET",
      token,
    })
      .then((res) => {
        console.log("[useReferralData] 트리 응답:", res);
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "소개 트리 조회에 실패했습니다.");
        }
        const tree = (body.data?.tree || null) as ReferralTreeNode | null;
        console.log("[useReferralData] 트리 데이터 설정:", tree);
        setTreeData(tree);
      })
      .catch((err) => {
        console.error("[useReferralData] 트리 로딩 에러:", err);
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingTree(false));
  }, [fetchTree, isReferralEligible, toast, token, user?.id, user?.role]);

  return {
    isReferralEligible,
    referralCode,
    referralLink,
    requestorStats,
    loadingRequestor,
    directMembers,
    loadingDirectMembers,
    treeData,
    loadingTree,
  };
};
