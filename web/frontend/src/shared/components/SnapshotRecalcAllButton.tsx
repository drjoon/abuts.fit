import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

import { useSnapshotRecalcAll } from "@/shared/hooks/useSnapshotRecalcAll";

export function SnapshotRecalcAllButton({
  token,
  periodKey,
  disabled,
  onSuccess,
  className,
  size = "sm",
  variant = "outline",
}: {
  token?: string | null;
  periodKey?: string;
  disabled?: boolean;
  onSuccess?: () => void | Promise<void>;
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { recalcAll, label, running, remainingMs } = useSnapshotRecalcAll({
    token,
    periodKey,
    onSuccess,
  });

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={Boolean(disabled) || running || remainingMs > 0}
      onClick={() => void recalcAll()}
    >
      {label}
    </Button>
  );
}
