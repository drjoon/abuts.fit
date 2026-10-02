/**
 * 기공소 로그인 시 연결 프로그램이 구버전이면 업데이트 안내 모달.
 * related files:
 * - web/frontend/src/shared/components/LabHelperUpdateDialog.tsx
 * - web/frontend/src/shared/hooks/useLabHelperAlarmSession.ts
 * - web/frontend/src/App.tsx
 * change-log:
 * - 2026-10-03: zip만 받지 말고 설치 안내 모달.
 */
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { normalizeRequestorKind } from "@/shared/business/requestorCapabilities";
import { needsLabHelperUpdate } from "@/shared/files/labHelperClient";
import { LabHelperUpdateDialog } from "@/shared/components/LabHelperUpdateDialog";

const canPromptLabHelperUpdate = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null): boolean => {
  if (!user) return false;
  const role = String(user.role || "").trim();
  if (role === "internalLab") return true;
  if (role === "requestor") {
    return normalizeRequestorKind(user.requestorKind) === "lab";
  }
  return false;
};

export function LabHelperUpdatePrompt() {
  const { user, isAuthenticated, token } = useAuthStore();
  const [open, setOpen] = useState(false);
  const enabled =
    Boolean(token && isAuthenticated) && canPromptLabHelperUpdate(user as any);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const needs = await needsLabHelperUpdate();
      if (!cancelled && needs) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  if (!enabled) return null;

  return (
    <LabHelperUpdateDialog
      open={open}
      onResolved={() => setOpen(false)}
    />
  );
}
