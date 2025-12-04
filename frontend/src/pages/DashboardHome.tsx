import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "./requestor/RequestorDashboardPage";
import { ManufacturerDashboardPage } from "./manufacturer/ManufacturerDashboardPage";
import { AdminDashboardPage } from "./admin/AdminDashboardPage";

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.role === "requestor") {
    return <RequestorDashboardPage />;
  }

  if (user.role === "manufacturer") {
    return <ManufacturerDashboardPage />;
  }

  return <AdminDashboardPage />;
};
