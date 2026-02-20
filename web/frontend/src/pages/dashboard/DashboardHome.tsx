import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "../requestor/dashboard/RequestorDashboardPage";
import { ManufacturerDashboardPage } from "../manufacturer/dashboard/ManufacturerDashboardPage";
import { AdminDashboardPage } from "../admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "../salesman/SalesmanDashboardPage";

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.role === "requestor") {
    return <RequestorDashboardPage />;
  }

  if (user.role === "manufacturer") {
    return <ManufacturerDashboardPage />;
  }

  if (user.role === "salesman") {
    return <SalesmanDashboardPage />;
  }

  return <AdminDashboardPage />;
};
