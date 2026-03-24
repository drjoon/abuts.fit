import { useAuthStore } from "@/store/useAuthStore";
import { AdminSettingsPage } from "@/pages/admin/settings/SettingsPage";
import { ManufacturerSettingsPage } from "@/pages/manufacturer/settings/SettingsPage";
import { RequestorSettingsPage } from "@/pages/requestor/settings/SettingsPage";
import { SalesmanSettingsPage } from "@/pages/salesman/SalesmanSettingsPage";
import { DevopsSettingsPage } from "@/pages/devops/DevopsSettingsPage";

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

  if (user?.role === "devops") {
    return <DevopsSettingsPage />;
  }

  if (user?.role === "requestor") {
    return <RequestorSettingsPage />;
  }

  return <RequestorSettingsPage />;
};
