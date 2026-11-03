// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/navigation/appNavigate.ts
// change-log:
// - 2026-11-03: 알림 보기용 appNavigate를 BrowserRouter navigate에 연결.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { registerAppNavigate } from "@/shared/navigation/appNavigate";

/** BrowserRouter 자식 — 전역 appNavigate 등록 */
export function AppNavigateBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    return registerAppNavigate((to, options) => {
      navigate(to, { replace: Boolean(options?.replace) });
    });
  }, [navigate]);

  return null;
}
