export interface DeadlineInfo {
  remainingMs: number;
  remainingBusinessDays: number;
  displayText: string;
  borderClass: string;
  badgeClass: string;
}

const KST_TZ = "Asia/Seoul";

const KR_HOLIDAYS = new Set([
  "2026-01-01", // 신정
  "2026-01-29",
  "2026-01-30",
  "2026-01-31", // 설날
  "2026-03-01", // 삼일절
  "2026-04-15", // 국회의원선거일
  "2026-05-05", // 어린이날
  "2026-05-15", // 부처님오탄신일
  "2026-06-06", // 현충일
  "2026-08-15", // 광복절
  "2026-09-24",
  "2026-09-25",
  "2026-09-26", // 추석
  "2026-10-03", // 개천절
  "2026-10-09", // 한글날
  "2026-12-25", // 크리스마스
]);

function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function toKstYmd(d?: Date | string): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return formatYmdInTimeZone(date, KST_TZ);
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

function utcDateToYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekendUtc(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function isKoreanHolidayYmd(ymd: string): boolean {
  return KR_HOLIDAYS.has(ymd);
}

function isKoreanBusinessDayYmd(ymd: string): boolean {
  const date = ymdToUtcDate(ymd);
  if (!date) return false;
  if (isWeekendUtc(date)) return false;
  if (isKoreanHolidayYmd(ymd)) return false;
  return true;
}

function countBusinessHoursRemaining(
  now: Date,
  shipDateDeadline: Date,
): number {
  // 영업시간 기준: 매일 00:00 ~ 16:00 (16시간)
  const BUSINESS_HOURS_PER_DAY = 16;

  let totalBusinessHours = 0;
  let current = new Date(now);

  while (current < shipDateDeadline) {
    const currentYmd = toKstYmd(current);
    if (!currentYmd) break;

    // 영업일인지 확인
    if (isKoreanBusinessDayYmd(currentYmd)) {
      // KST 기준 시간 계산
      const currentKstHour =
        current.getUTCHours() + 9 + current.getUTCMinutes() / 60;
      const deadlineYmd = toKstYmd(shipDateDeadline);

      // 같은 날인 경우
      if (currentYmd === deadlineYmd) {
        const deadlineKstHour =
          shipDateDeadline.getUTCHours() +
          9 +
          shipDateDeadline.getUTCMinutes() / 60;
        const hoursInDay = Math.max(
          0,
          Math.min(BUSINESS_HOURS_PER_DAY, deadlineKstHour) - currentKstHour,
        );
        totalBusinessHours += hoursInDay;
        break;
      } else {
        // 오늘 남은 영업시간 (24:00까지)
        const hoursInDay = Math.max(0, 24 - currentKstHour);
        totalBusinessHours += hoursInDay;
      }
    }

    // 다음 날로 이동
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    current.setUTCHours(0, 0, 0, 0);
  }

  return totalBusinessHours;
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
  const totalBusinessHours = countBusinessHoursRemaining(now, shipDateDeadline);

  const formatTimeRemaining = (businessHours: number): string => {
    if (remainingMs <= 0) return "마감됨";

    const hours = Math.floor(businessHours);

    if (hours <= 0) {
      return "마감됨";
    }

    return `${hours}시간`;
  };

  const getColorClasses = (
    businessHours: number,
  ): { border: string; badge: string } => {
    if (businessHours > 32) {
      return {
        border: "border-green-500 border-2",
        badge: "bg-green-50 text-green-700 border-green-200",
      };
    }
    if (businessHours > 16) {
      return {
        border: "border-yellow-500 border-2",
        badge: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    }
    if (businessHours > 0) {
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

  const colors = getColorClasses(totalBusinessHours);

  return {
    remainingMs,
    remainingBusinessDays: Math.floor(totalBusinessHours / 16),
    displayText: formatTimeRemaining(totalBusinessHours),
    borderClass: colors.border,
    badgeClass: colors.badge,
  };
};
