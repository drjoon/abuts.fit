import mongoose, { Types } from "mongoose";
import crypto from "crypto";
import SystemSettings from "../../models/systemSettings.model.js";
import ActivityLog from "../../models/activityLog.model.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  ymdToMmDd,
} from "../../utils/krBusinessDays.js";

export const BASE_UNIT_PRICE = 15000;
const DISCOUNT_PER_ORDER = 10;
const MAX_DISCOUNT_PER_UNIT = 5000;

export const DEFAULT_DELIVERY_ETA_LEAD_DAYS = {
  d6: 2,
  d8: 2,
  d10: 4,
  d12: 7,
};

export function computeVolumeEffectiveUnitPrice(groupTotalOrders) {
  const totalOrders = Number(groupTotalOrders || 0);
  const discountAmount = Math.min(
    totalOrders * DISCOUNT_PER_ORDER,
    MAX_DISCOUNT_PER_UNIT,
  );
  return Math.max(0, BASE_UNIT_PRICE - discountAmount);
}

export async function getMongoHealth() {
  const start = performance.now();
  try {
    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.command({ ping: 1 });

    let serverStatus = null;
    try {
      serverStatus = await adminDb.command({ serverStatus: 1 });
    } catch {}

    const latencyMs = Math.round(performance.now() - start);
    const connections = serverStatus?.connections || null;
    const current = Number(connections?.current || 0);
    const available = Number(connections?.available || 0);
    const total = current + available || 0;
    const usageRatio = total > 0 ? current / total : 0;
    const status =
      latencyMs > 500 || (total > 0 && usageRatio > 0.8) ? "warning" : "ok";
    const message =
      total > 0
        ? `ping ${latencyMs}ms, connections ${current}/${current + available}`
        : `ping ${latencyMs}ms`;

    return {
      ok: true,
      latencyMs,
      status,
      message,
      metrics: {
        connections: total > 0 ? { current, available, usageRatio } : null,
        opCounters: serverStatus?.opcounters || null,
      },
      raw: { ping: pingResult },
    };
  } catch (error) {
    return { ok: false, message: error.message, status: "critical" };
  }
}

export function generateRandomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

export async function formatEtaLabelFromNow(days) {
  const d = typeof days === "number" && !Number.isNaN(days) ? days : 0;
  const todayYmd = getTodayYmdInKst();
  const etaYmd = await addKoreanBusinessDays({ startYmd: todayYmd, days: d });
  return ymdToMmDd(etaYmd);
}

export async function getDeliveryEtaLeadDays() {
  try {
    const { getManufacturerLeadTimesUtil } =
      await import("../organizations/leadTime.controller.js");
    const manufacturerSettings = await getManufacturerLeadTimesUtil();
    const leadTimes = manufacturerSettings?.leadTimes || {};
    const result = {};
    ["d6", "d8", "d10", "d12"].forEach((key) => {
      const entry = leadTimes?.[key];
      result[key] =
        entry?.maxBusinessDays ?? DEFAULT_DELIVERY_ETA_LEAD_DAYS[key];
    });
    return result;
  } catch (error) {
    console.error("[admin.getDeliveryEtaLeadDays] error:", error);
    return DEFAULT_DELIVERY_ETA_LEAD_DAYS;
  }
}

export function getDateRangeFromQuery(req) {
  const now = new Date();
  const startDateRaw = req.query.startDate;
  const endDateRaw = req.query.endDate;

  if (startDateRaw && endDateRaw) {
    const start = new Date(startDateRaw);
    const end = new Date(endDateRaw);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start, end };
    }
  }

  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { start, end: now };
}

async function fetchHealthJson(url, fallbackMessage) {
  if (!url) return { status: "unknown", message: fallbackMessage };
  try {
    const res = await fetch(url, { timeout: 3000 });
    if (!res.ok) {
      return { status: "warning", message: `${fallbackMessage} (${res.status})` };
    }
    const data = await res.json().catch(() => null);
    return {
      status: String(data?.status || "ok"),
      message: String(data?.message || fallbackMessage),
    };
  } catch (error) {
    return { status: "critical", message: error.message || fallbackMessage };
  }
}

export async function getNetworkHealth() {
  const tlsUrl = process.env.TLS_HEALTH_URL;
  const wafUrl = process.env.WAF_HEALTH_URL;
  const [tls, waf] = await Promise.all([
    fetchHealthJson(tlsUrl, "TLS 상태를 확인할 수 없습니다."),
    fetchHealthJson(wafUrl, "WAF 상태를 확인할 수 없습니다."),
  ]);
  const status = [tls.status, waf.status].includes("critical")
    ? "critical"
    : [tls.status, waf.status].includes("warning")
      ? "warning"
      : [tls.status, waf.status].includes("ok")
        ? "ok"
        : "unknown";
  const message = [tls.message, waf.message].filter(Boolean).join(" / ");
  return { status, message };
}

export async function getApiHealth({ blockedAttempts }) {
  return {
    status: blockedAttempts > 0 ? "warning" : "ok",
    message:
      blockedAttempts > 0
        ? `최근 30일 차단된 시도 ${blockedAttempts}건`
        : "차단된 보안 이벤트가 없습니다.",
  };
}

export async function getBackupHealth(sec) {
  const backupUrl = process.env.BACKUP_HEALTH_URL;
  const backup = await fetchHealthJson(
    backupUrl,
    sec?.backupFrequency
      ? `백업 주기: ${sec.backupFrequency}`
      : "백업 설정이 없습니다.",
  );
  return { status: backup.status, message: backup.message };
}

export async function logSecurityEvent({
  userId,
  action,
  severity = "info",
  status = "info",
  ipAddress = "",
  userAgent = "",
  details = {},
}) {
  try {
    const payload = {
      action,
      severity,
      status,
      ipAddress,
      userAgent,
      details,
    };
    if (userId && Types.ObjectId.isValid(String(userId))) {
      payload.user = new Types.ObjectId(String(userId));
      payload.userId = new Types.ObjectId(String(userId));
    }
    await ActivityLog.create(payload);
  } catch (error) {
    console.error("[admin.logSecurityEvent] error:", error);
  }
}

export async function logAuthFailure(req, reason, user = null) {
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
  await logSecurityEvent({
    userId: user?._id || user?.id || null,
    action: "auth_failure",
    severity: "warning",
    status: "blocked",
    ipAddress: clientIp,
    userAgent: req.headers["user-agent"] || "",
    details: {
      reason: String(reason || "unknown"),
      email: String(req.body?.email || "").trim().toLowerCase(),
    },
  });
}

export async function readGlobalSystemSettings() {
  return SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}
