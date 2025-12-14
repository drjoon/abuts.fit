import { useAuthStore } from "@/store/useAuthStore";
import { AdminSettingsPage } from "./admin/settings/SettingsPage";
import { ManufacturerSettingsPage } from "./manufacturer/settings/SettingsPage";
import { RequestorSettingsPage } from "./requestor/settings/SettingsPage";

export const SettingsPage = () => {
  const { user } = useAuthStore();

  if (user?.role === "manufacturer") {
    return <ManufacturerSettingsPage />;
  }

  if (user?.role === "admin") {
    return <AdminSettingsPage />;
  }

  return <RequestorSettingsPage />;
};
