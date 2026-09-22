// related files:
// - web/frontend/src/pages/admin/adminUi.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// change-log:
// - 2026-09-23: 플랫폼·사업영역·계정 세그먼트 제거. 계정·사업자·플랫폼·임직원·알림 평탄 탭은 AdminSettingsPage.
// - 2026-09-18: 플랫폼 탭에 기본 기공수가 검토 대기 배지.
// - 2026-09-06: 플랫폼·사업영역·계정설정 허브(?tab=platform|partners|account).
import { AdminSettingsPage } from "@/pages/admin/settings/SettingsPage";
import { AdminPageShell } from "@/pages/admin/adminUi";

export default function AdminSettingsHubPage() {
  return (
    <AdminPageShell flush className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <AdminSettingsPage embedded />
      </div>
    </AdminPageShell>
  );
}
