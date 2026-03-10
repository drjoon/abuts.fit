import { useAuthStore } from "@/store/useAuthStore";
import { RequestorReferralPage } from "./RequestorReferralPage";
import { SalesmanReferralPage } from "@/pages/salesman/referral/SalesmanReferralPage";

export default function ReferralGroupsPage() {
  const { user } = useAuthStore();

  if (user?.role === "salesman") {
    return <SalesmanReferralPage />;
  }

  return <RequestorReferralPage />;
}
