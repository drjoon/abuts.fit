// related files:
// - web/frontend/src/shared/settlement/labPayoutBankbook.ts
// - web/frontend/src/shared/settlement/LabPayoutBankbookRemindDialog.tsx
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// change-log:
// - 2026-09-16: 기공소 통장사본 미등록 안내(지급 진입·정산일 7일 전, 일 1회).
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import {
  hasLabPayoutRemindShownToday,
  isLabPayoutReady,
  isWithinLabSettlementRemindWindow,
  markLabPayoutRemindShownToday,
  type LabPayoutAccountSnapshot,
} from "@/shared/settlement/labPayoutBankbook";
import { LabPayoutBankbookRemindDialog } from "@/shared/settlement/LabPayoutBankbookRemindDialog";

type Options = {
  /** true면 정산일 7일 전 창이 아니어도(지급 탭 진입) 안내 */
  forceOnMount?: boolean;
};

export function useLabPayoutBankbookReminder(options: Options = {}) {
  const { forceOnMount = false } = options;
  const { token, user } = useAuthStore();
  const { kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab" || user?.role === "internalLab";
  const [open, setOpen] = useState(false);
  const [anchorId, setAnchorId] = useState("");

  const maybeOpen = useCallback(async () => {
    if (!token || !isLab) return;
    if (!forceOnMount && !isWithinLabSettlementRemindWindow()) return;

    try {
      const businessType = resolveBusinessType(user?.role, "requestor");
      const data = await loadBusinessMeCached({
        token,
        businessType,
        force: false,
      });
      const id = String(data?.businessId || data?.business?._id || "");
      if (!id) return;
      setAnchorId(id);
      if (isLabPayoutReady(data?.payoutAccount as LabPayoutAccountSnapshot)) {
        return;
      }
      if (hasLabPayoutRemindShownToday(id)) return;
      markLabPayoutRemindShownToday(id);
      setOpen(true);
    } catch {
      // ignore
    }
  }, [token, isLab, forceOnMount, user?.role]);

  useEffect(() => {
    void maybeOpen();
  }, [maybeOpen]);

  const dialog = (
    <LabPayoutBankbookRemindDialog open={open} onOpenChange={setOpen} />
  );

  return { dialog, open, setOpen, refresh: maybeOpen, anchorId };
}
