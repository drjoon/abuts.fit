import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  normalizeKoreanBusinessDay,
} from "./utils.js";
import { isKoreanBusinessDay } from "../../utils/krBusinessDays.js";

const WAYBILL_INPUT_CUTOFF_HOUR_KST = 15;

function toKstYmd(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function kstDateTimeFromYmd({ ymd, hour, minute = 0 }) {
  const h = String(hour).padStart(2, "0");
  const m = String(minute).padStart(2, "0");
  return new Date(`${ymd}T${h}:${m}:00+09:00`);
}

async function prevKoreanBusinessDayYmd({ fromYmd }) {
  const base = new Date(`${fromYmd}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return fromYmd;

  let cur = new Date(base);
  for (let i = 0; i < 10; i += 1) {
    cur = new Date(cur.getTime() - 24 * 60 * 60 * 1000);
    const ymd = toKstYmd(cur);
    if (!ymd) continue;
    // @ts-ignore (js)
    if (await isKoreanBusinessDay(ymd)) {
      return ymd;
    }
  }

  return fromYmd;
}

export function resolveEffectiveShippingMode(requestLike) {
  const finalMode = String(requestLike?.finalShipping?.mode || "").trim();
  if (finalMode === "express" || finalMode === "normal") return finalMode;

  const originalMode = String(requestLike?.originalShipping?.mode || "").trim();
  if (originalMode === "express" || originalMode === "normal")
    return originalMode;

  const legacy = String(requestLike?.shippingMode || "").trim();
  if (legacy === "express" || legacy === "normal") return legacy;

  return "normal";
}

export async function computeShippingPriority({ request, now }) {
  const stage = String(
    request?.manufacturerStage || request?.status || "",
  ).trim();
  const isPreShip = ["의뢰", "CAM", "생산"].includes(stage);

  const mode = resolveEffectiveShippingMode(request);

  if (!isPreShip) {
    return {
      mode,
      level: "normal",
      score: 0,
      shipYmd: null,
      deadlineAt: null,
      minutesLeft: null,
      label: "",
    };
  }

  const nowDate = now instanceof Date ? now : new Date(now || Date.now());
  const todayYmd = getTodayYmdInKst();
  const todayStart = new Date(`${todayYmd}T00:00:00+09:00`);
  const todayDeadlineAt = kstDateTimeFromYmd({
    ymd: todayYmd,
    hour: WAYBILL_INPUT_CUTOFF_HOUR_KST,
  });

  let shipYmd = null;

  if (mode === "express") {
    const createdAt = request?.createdAt ? new Date(request.createdAt) : null;

    const isBeforeTodayStart =
      createdAt &&
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getTime() <= todayStart.getTime();

    if (nowDate >= todayDeadlineAt) {
      shipYmd = await addKoreanBusinessDays({ startYmd: todayYmd, days: 1 });
      shipYmd = await normalizeKoreanBusinessDay({ ymd: shipYmd });
    } else if (isBeforeTodayStart) {
      shipYmd = await normalizeKoreanBusinessDay({ ymd: todayYmd });
    } else {
      shipYmd = await addKoreanBusinessDays({ startYmd: todayYmd, days: 1 });
      shipYmd = await normalizeKoreanBusinessDay({ ymd: shipYmd });
    }
  } else {
    const pickup = request?.productionSchedule?.scheduledShipPickup;
    const pickupYmd = pickup ? toKstYmd(pickup) : null;
    if (pickupYmd) {
      shipYmd = pickupYmd;
    } else {
      const ymd = request?.timeline?.estimatedShipYmd;
      shipYmd =
        typeof ymd === "string" && ymd.trim()
          ? ymd.trim()
          : await normalizeKoreanBusinessDay({ ymd: todayYmd });
    }
  }

  const deadlineAt = shipYmd
    ? kstDateTimeFromYmd({ ymd: shipYmd, hour: WAYBILL_INPUT_CUTOFF_HOUR_KST })
    : null;

  const minutesLeft =
    deadlineAt && !Number.isNaN(deadlineAt.getTime())
      ? Math.floor((deadlineAt.getTime() - nowDate.getTime()) / (60 * 1000))
      : null;

  const isOverdue = typeof minutesLeft === "number" && minutesLeft < 0;
  const level = (() => {
    if (isOverdue) return "danger";
    if (typeof minutesLeft !== "number") return "normal";
    if (minutesLeft <= 120) return "danger";
    if (minutesLeft <= 24 * 60) return "warning";
    return "normal";
  })();

  const baseScore = (() => {
    if (typeof minutesLeft !== "number") return 0;
    if (minutesLeft < 0) return 1_000_000_000 + Math.abs(minutesLeft);
    return Math.max(0, 24 * 60 - minutesLeft);
  })();

  const score = baseScore + (mode === "express" ? 10_000 : 0);

  const label = (() => {
    if (typeof minutesLeft !== "number") return "";
    if (minutesLeft < 0) return "마감 초과";
    if (minutesLeft < 60) return `마감 ${minutesLeft}분`;
    const h = Math.ceil(minutesLeft / 60);
    return `마감 ${h}시간`;
  })();

  return {
    mode,
    level,
    score,
    shipYmd,
    deadlineAt: deadlineAt ? deadlineAt.toISOString() : null,
    minutesLeft,
    label,
  };
}
