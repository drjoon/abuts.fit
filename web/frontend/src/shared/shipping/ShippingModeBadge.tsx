// related files:
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
import { Badge } from "@/components/ui/badge";
import {
  getBulkExpressShippingLabel,
  getShippingModeBadgeClassName,
  resolveShippingMode,
  type ShippingMode,
  type ShippingModeSource,
} from "./shippingMode";

type Props = {
  source?: ShippingModeSource;
  mode?: ShippingMode;
  size?: "default" | "sm";
  className?: string;
};

export function ShippingModeBadge({
  source,
  mode,
  size = "default",
  className = "",
}: Props) {
  const resolved = mode ?? resolveShippingMode(source);
  const sizeClass =
    size === "sm"
      ? "text-[10px] h-5 px-1.5 whitespace-nowrap leading-none"
      : "";

  return (
    <Badge
      variant="outline"
      className={`${sizeClass} ${getShippingModeBadgeClassName(resolved)} ${className}`.trim()}
    >
      {getBulkExpressShippingLabel(resolved)}
    </Badge>
  );
}
