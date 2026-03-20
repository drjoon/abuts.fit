import { useEffect, useState, useCallback } from "react";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { MembershipStatus } from "@/shared/components/business/types";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "./businessMeCache";

interface JoinRequest {
  businessId: string;
  businessName: string;
  status: string;
}

interface UseMembershipManagementProps {
  token?: string;
  businessType: string;
}

export const useMembershipManagement = (
  props: UseMembershipManagementProps,
) => {
  const { toast } = useToast();
  const [membership, setMembership] = useState<MembershipStatus>("none");
  const [myJoinRequests, setMyJoinRequests] = useState<JoinRequest[] | null>(
    null,
  );
  const [joinRequestsLoaded, setJoinRequestsLoaded] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoadingBusinessId, setCancelLoadingBusinessId] =
    useState<string>("");

  // 멤버십 로드
  useEffect(() => {
    const load = async () => {
      try {
        if (!props.token) return;
        const data = await loadBusinessMeCached({
          token: props.token,
          businessType: props.businessType,
        });

        if (!data) {
          setJoinRequestsLoaded(true);
          return;
        }
        const next = (data?.membership || "none") as MembershipStatus;
        setMembership(next);
        setJoinRequestsLoaded(true);
      } catch {
        setMembership("none");
        setJoinRequestsLoaded(true);
      }
    };

    load();
  }, [props.token, props.businessType]);

  // 가입 신청 로드
  useEffect(() => {
    const load = async () => {
      try {
        if (!props.token) {
          setJoinRequestsLoaded(false);
          setMyJoinRequests(null);
          return;
        }

        if (membership === "owner") {
          setJoinRequestsLoaded(true);
          setMyJoinRequests([]);
          return;
        }

        setJoinRequestsLoaded(false);
        const res = await request<any>({
          path: `/api/businesses/join-requests/me?businessType=${encodeURIComponent(
            props.businessType,
          )}`,
          method: "GET",
          token: props.token,
        });

        if (!res.ok) return;

        const body: any = res.data || {};
        const data = body.data || body;
        setMyJoinRequests(Array.isArray(data) ? data : []);
      } catch {
        setMyJoinRequests([]);
      } finally {
        setJoinRequestsLoaded(true);
      }
    };

    load();
  }, [membership, props.businessType, props.token]);

  const refreshMembership = useCallback(async () => {
    if (!props.token) return;
    try {
      invalidateBusinessMeCache({
        token: props.token,
        businessType: props.businessType,
      });
      const data = await loadBusinessMeCached({
        token: props.token,
        businessType: props.businessType,
        force: true,
      });
      if (!data) return;
      const next = (data?.membership || "none") as MembershipStatus;
      setMembership(next);
    } catch {}
  }, [props.token, props.businessType]);

  const refreshMyJoinRequests = useCallback(async () => {
    if (!props.token) return;

    setJoinRequestsLoaded(false);
    try {
      const res = await request<any>({
        path: `/api/businesses/join-requests/me?businessType=${encodeURIComponent(
          props.businessType,
        )}`,
        method: "GET",
        token: props.token,
      });

      if (!res.ok) return;

      const body: any = res.data || {};
      const data = body.data || body;
      setMyJoinRequests(Array.isArray(data) ? data : []);
    } catch {
      setMyJoinRequests([]);
    } finally {
      setJoinRequestsLoaded(true);
    }
  }, [props.token, props.businessType]);

  return {
    membership,
    setMembership,
    myJoinRequests,
    setMyJoinRequests,
    joinRequestsLoaded,
    setJoinRequestsLoaded,
    joinLoading,
    setJoinLoading,
    cancelLoadingBusinessId,
    setCancelLoadingBusinessId,
    refreshMembership,
    refreshMyJoinRequests,
  };
};
