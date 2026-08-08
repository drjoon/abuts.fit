// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { PopbillQueuePanel } from "@/features/admin/popbill/PopbillQueuePanel";

export const AdminPopbillQueue = () => {
  return (
    <div className="p-2 sm:p-3">
      <PopbillQueuePanel />
    </div>
  );
};

export default AdminPopbillQueue;
