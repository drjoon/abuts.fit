export interface DeadlineInfo {
  remainingMs: number;
  remainingBusinessDays: number;
  displayText: string;
  borderClass: string;
  badgeClass: string;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((v) => Number(v));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function ymdToUtcDate(ymd: string): Date | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function countHoursRemaining(now: Date, shipDateDeadline: Date): number {
  const diffMs = shipDateDeadline.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60);
}

export const getDeadlineInfo = (
  createdAt?: string | Date,
  estimatedShipYmd?: string,
): DeadlineInfo | null => {
  if (!createdAt || !estimatedShipYmd) {
    return null;
  }

  const now = new Date();
  const shipYmd = estimatedShipYmd;

  const shipDateDeadline = ymdToUtcDate(shipYmd);
  if (!shipDateDeadline) {
    return null;
  }
  // KST 오후 4시(16:00) = UTC 오전 7시(07:00)
  shipDateDeadline.setUTCHours(7, 0, 0, 0);

  const remainingMs = shipDateDeadline.getTime() - now.getTime();
  const totalHours = countHoursRemaining(now, shipDateDeadline);

  const formatTimeRemaining = (hoursRemaining: number): string => {
    if (remainingMs <= 0) return "마감됨";

    const hours = Math.max(0, Math.floor(hoursRemaining));

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;

    if (hours <= 0) {
      return "마감됨";
    }

    if (days > 0) {
      return `${days}일 ${restHours}시간`;
    }

    return `${restHours}시간`;
  };

  const getColorClasses = (
    hoursRemaining: number,
  ): { border: string; badge: string } => {
    if (hoursRemaining > 48) {
      return {
        border: "border-green-500 border-2",
        badge: "bg-green-50 text-green-700 border-green-200",
      };
    }
    if (hoursRemaining > 24) {
      return {
        border: "border-yellow-500 border-2",
        badge: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    }
    if (hoursRemaining > 0) {
      return {
        border: "border-orange-500 border-2",
        badge: "bg-orange-50 text-orange-700 border-orange-200",
      };
    }
    return {
      border: "border-red-500 border-2",
      badge: "bg-red-50 text-red-700 border-red-200",
    };
  };

  const colors = getColorClasses(totalHours);

  return {
    remainingMs,
    remainingBusinessDays: Math.max(0, Math.floor(totalHours / 24)),
    displayText: formatTimeRemaining(totalHours),
    borderClass: colors.border,
    badgeClass: colors.badge,
  };
};
