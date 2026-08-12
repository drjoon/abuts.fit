// related files:
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/frontend/src/features/dashboard/DashboardHome.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
import { Navigate } from "react-router-dom";
import { shouldGatePaidRequestorAccess } from "@/shared/business/requestorCapabilities";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

type Props = {
  children: React.ReactNode;
  /** 로딩 중 표시할 대체 UI (없으면 null) */
  loadingFallback?: React.ReactNode;
  /** 유료 미가용 시 이동 경로 */
  fallbackPath?: string;
};

/**
 * 유료 서비스 딥링크 방어 — 사이드바에서 버튼을 막되, URL 직접 진입 시 무료 경로로 보낸다.
 * (전체 화면 차단 카드 대신 사용)
 */
export const BusinessPaidAccessGate = ({
  children,
  loadingFallback = null,
  fallbackPath = "/dashboard/practice-transfers",
}: Props) => {
  const { loading, canUsePaid, kind } = useRequestorBusinessAccess();

  if (loading) return <>{loadingFallback}</>;
  if (
    !shouldGatePaidRequestorAccess({ kind, canUsePaid })
  ) {
    return <>{children}</>;
  }

  return <Navigate to={fallbackPath} replace />;
};
