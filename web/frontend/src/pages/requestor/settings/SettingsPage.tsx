import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import {
  SettingsScaffold,
  type SettingsTabDef,
} from "@/features/components/SettingsScaffold";
import { SettingsTabsSkeleton } from "@/features/components/SettingsSkeletons";
import { AccountTab } from "@/features/settings/tabs/AccountTab";
import { BusinessTab } from "@/shared/components/business/settings/BusinessTab";
import { StaffTab } from "@/features/settings/tabs/StaffTab";
import { PaymentTab } from "@/features/settings/tabs/CreditPaymentTab";
import { NotificationsTab } from "@/features/settings/tabs/NotificationsTab";
import { RequestTab } from "@/features/settings/tabs/RequestTab";
import {
  User,
  Building2,
  CreditCard,
  Bell,
  Users,
  FileText,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { RequestorSecurity } from "./Security";
import { Shield } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { formatKstDateTimeToKo, toKstYmd } from "@/shared/date/kst";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

// related files:
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/controllers/requests/utils.js
// 가입일시/경과일/D-day는 신규 기공소 90일 고정가와 동일 기준일(pricingBaseDate)을 사용한다.
// 2026-08-11: 설정 의뢰/결제 탭은 유료 게이트 없이 항상 활성.

type TabKey =
  | "account"
  | "business"
  | "staff"
  | "request"
  | "payment"
  | "notifications"
  | "security";

export const RequestorSettingsPage = () => {
  const { user, token } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { loading: accessLoading } = useRequestorBusinessAccess();

  const [membership, setMembership] = useState<
    "owner" | "member" | "pending" | "none" | "unknown"
  >(token ? "unknown" : "none");
  const [canManageStaff, setCanManageStaff] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(Boolean(token));
  const [pricingBaseDate, setPricingBaseDate] = useState<string | null>(null);

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const businessType = useMemo(() => {
    return resolveBusinessType(user?.role, "requestor");
  }, [user?.role]);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setMembership("none");
        setCanManageStaff(false);
        setPricingBaseDate(null);
        setLoadingMembership(false);
        return;
      }

      setLoadingMembership(true);
      try {
        const res = await request<any>({
          path: `/api/businesses/me?businessType=${encodeURIComponent(
            businessType,
          )}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setMembership("none");
          setCanManageStaff(false);
          setPricingBaseDate(null);
          return;
        }
        const body: any = res.data || {};
        const data = body.data || body;
        const next = String(data?.membership || "none") as
          "owner" | "member" | "pending" | "none";
        setMembership(next);
        setCanManageStaff(next === "owner");
        setPricingBaseDate(
          data?.pricingBaseDate ? String(data.pricingBaseDate) : null,
        );
      } catch {
        setMembership("none");
        setCanManageStaff(false);
        setPricingBaseDate(null);
      } finally {
        setLoadingMembership(false);
      }
    };

    void load();
  }, [businessType, token]);

  const pricingElapsedDays = useMemo(() => {
    if (!pricingBaseDate) return null;
    const startYmd = toKstYmd(pricingBaseDate);
    const todayYmd = toKstYmd(new Date());
    if (!startYmd || !todayYmd) return null;

    const start = new Date(`${startYmd}T00:00:00+09:00`);
    const today = new Date(`${todayYmd}T00:00:00+09:00`);
    const diffMs = today.getTime() - start.getTime();
    if (!Number.isFinite(diffMs)) return null;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }, [pricingBaseDate]);

  const launchEventRemainingDays = useMemo(() => {
    if (pricingElapsedDays == null) return null;
    return Math.max(0, 90 - pricingElapsedDays);
  }, [pricingElapsedDays]);

  const tabs: SettingsTabDef[] = useMemo(() => {
    const base: SettingsTabDef[] = [
      {
        key: "account",
        label: "계정",
        icon: User,
        content: <AccountTab userData={user} />,
      },
      {
        key: "business",
        label: "사업자",
        icon: Building2,
        content: (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">가입일시</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {pricingBaseDate
                      ? formatKstDateTimeToKo(pricingBaseDate)
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">가입 후 경과일</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">
                      {pricingElapsedDays == null ? "-" : `${pricingElapsedDays}일`}
                    </p>
                    {launchEventRemainingDays != null && (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
                          launchEventRemainingDays > 0
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                            : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                        }`}
                      >
                        {launchEventRemainingDays > 0
                          ? `런칭 이벤트 종료까지 D-${launchEventRemainingDays}일`
                          : "런칭 이벤트 종료"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <BusinessTab userData={user} />
          </div>
        ),
      },
      {
        key: "staff",
        label: "임직원",
        icon: Users,
        content: <StaffTab userData={user} />,
      },
      {
        key: "request",
        label: "의뢰",
        icon: FileText,
        content: <RequestTab />,
      },
    ];

    base.push(
      {
        key: "payment",
        label: "결제",
        icon: CreditCard,
        content: <PaymentTab userData={user} />,
      },
      {
        key: "notifications",
        label: "알림",
        icon: Bell,
        content: <NotificationsTab />,
      },
      {
        key: "security",
        label: "보안",
        icon: Shield,
        content: <RequestorSecurity />,
      },
    );

    return base;
  }, [
    launchEventRemainingDays,
    pricingBaseDate,
    pricingElapsedDays,
    user,
  ]);

  const tabFromUrl =
    (searchParams.get("tab") as TabKey | null) || (tabs[0]?.key as TabKey);
  const allowed = new Set(
    tabs.filter((t) => !t.disabled).map((t) => t.key),
  );
  const activeTab = allowed.has(tabFromUrl)
    ? tabFromUrl
    : (tabs.find((t) => !t.disabled)?.key as TabKey) ||
      (tabs[0]?.key as TabKey);

  if (loadingMembership || accessLoading) {
    return <SettingsTabsSkeleton />;
  }

  return (
    <>
      <SettingsScaffold
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(next) => {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.set("tab", next);
          setSearchParams(nextParams, { replace: true });
        }}
      />
    </>
  );
};
