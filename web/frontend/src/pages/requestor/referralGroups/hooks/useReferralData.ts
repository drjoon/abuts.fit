import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

export type RequestorReferralStats = {
  myLastMonthOrders?: number;
  myLast30DaysOrders?: number;
  groupTotalOrders?: number;
  groupMemberCount?: number;
  effectiveUnitPrice?: number;
  baseUnitPrice?: number;
  discountAmount?: number;
  rule?: string;
  maxDiscountPerUnit?: number;
  discountPerOrder?: number;
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

export const useReferralData = () => {
  const { user, token } = useAuthStore();
  const { toast } = useToast();

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
    if (!token || !isReferralEligible) return;

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
  }, [isReferralEligible, toast, token]);

  useEffect(() => {
    if (!token || !isReferralEligible) return;

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
  }, [isReferralEligible, toast, token]);

  useEffect(() => {
    if (!token || !isReferralEligible || !user?.id) return;

    setLoadingTree(true);
    request<any>({
      path: `/api/admin/referral-groups/${user.id}/tree`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "소개 트리 조회에 실패했습니다.");
        }
        setTreeData((body.data?.tree || null) as ReferralTreeNode | null);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingTree(false));
  }, [isReferralEligible, toast, token, user?.id]);

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
