import { useAuthStore } from "@/store/useAuthStore";
import { AdminSettingsPage } from "../admin/settings/SettingsPage";
import { ManufacturerSettingsPage } from "../manufacturer/settings/SettingsPage";
import { RequestorSettingsPage } from "../requestor/settings/SettingsPage";
import { SalesmanSettingsPage } from "../salesman/SalesmanSettingsPage";

export const SettingsPage = () => {
  const { user } = useAuthStore();

  if (user?.role === "manufacturer") {
    return <ManufacturerSettingsPage />;
  }

  if (user?.role === "admin") {
    return <AdminSettingsPage />;
  }

  if (user?.role === "salesman") {
    return <SalesmanSettingsPage />;
  }

  return <RequestorSettingsPage />;
};
