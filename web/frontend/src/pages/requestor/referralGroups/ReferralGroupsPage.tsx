import { useAuthStore } from "@/store/useAuthStore";
import { RequestorReferralPage } from "./RequestorReferralPage";
import { SalesmanReferralPage } from "@/pages/salesman/referral/SalesmanReferralPage";
import { DevopsReferralPage } from "@/pages/devops/referral/DevopsReferralPage";

export default function ReferralGroupsPage() {
  const { user } = useAuthStore();

  if (user?.role === "salesman") {
    return <SalesmanReferralPage />;
  }

  if (user?.role === "devops") {
    return <DevopsReferralPage />;
  }

  return <RequestorReferralPage />;
}
