import { useEffect, useState, useCallback } from "react";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { MembershipStatus } from "@/shared/components/business/types";

interface JoinRequest {
  businessId: string;
  businessName: string;
  status: string;
}

interface UseMembershipManagementProps {
  token?: string;
  organizationType: string;
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
        const res = await request<any>({
          path: `/api/businesses/me?organizationType=${encodeURIComponent(
            props.organizationType,
          )}`,
          method: "GET",
          token: props.token,
        });

        if (!res.ok) {
          setJoinRequestsLoaded(true);
          return;
        }

        const body: any = res.data || {};
        const data = body.data || body;
        const next = (data?.membership || "none") as MembershipStatus;
        setMembership(next);
        setJoinRequestsLoaded(true);
      } catch {
        setMembership("none");
        setJoinRequestsLoaded(true);
      }
    };

    load();
  }, [props.token, props.organizationType]);

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
          path: `/api/businesses/join-requests/me?organizationType=${encodeURIComponent(
            props.organizationType,
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
  }, [membership, props.organizationType, props.token]);

  const refreshMembership = useCallback(async () => {
    if (!props.token) return;
    try {
      const res = await request<any>({
        path: `/api/businesses/me?organizationType=${encodeURIComponent(
          props.organizationType,
        )}`,
        method: "GET",
        token: props.token,
      });

      if (!res.ok) return;

      const body: any = res.data || {};
      const data = body.data || body;
      const next = (data?.membership || "none") as MembershipStatus;
      setMembership(next);
    } catch {
      // ignore
    }
  }, [props.token, props.organizationType]);

  const refreshMyJoinRequests = useCallback(async () => {
    if (!props.token) return;

    setJoinRequestsLoaded(false);
    try {
      const res = await request<any>({
        path: `/api/businesses/join-requests/me?organizationType=${encodeURIComponent(
          props.organizationType,
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
  }, [props.token, props.organizationType]);

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
