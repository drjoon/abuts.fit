import axios from "axios";

const minutes = (m) => m * 60 * 1000;

function parseIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sendSlack(webhook, text) {
  if (!webhook) return;
  try {
    await axios.post(webhook, { text }, { timeout: 5000 });
  } catch (err) {
    console.error("[health-monitor] slack send failed", err?.message);
  }
}

async function sendPushover({ token, user, title, message, device, priority }) {
  if (!token || !user) return;
  try {
    const body = new URLSearchParams({
      token,
      user,
      title: title || "Background worker alert",
      message,
    });
    if (device) body.append("device", device);
    if (priority !== undefined) body.append("priority", String(priority));

    await axios.post("https://api.pushover.net/1/messages.json", body, {
      timeout: 5000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    console.error("[health-monitor] pushover send failed", err?.message);
  }
}

export function startHealthMonitor({
  getCreditBPlanStatus,
  getPopbillWorkerStatus,
  staleMinutes = 10,
  intervalMinutes = 1,
}) {
  const pushoverToken =
    process.env.PUSHOVER_TOKEN || process.env.WORKER_PUSHOVER_TOKEN;
  const pushoverUser =
    process.env.PUSHOVER_USER || process.env.WORKER_PUSHOVER_USER;
  const pushoverDevice = process.env.PUSHOVER_DEVICE || "";
  const pushoverPriority = process.env.PUSHOVER_PRIORITY;

  if (!pushoverToken || !pushoverUser) {
    console.log("[health-monitor] Pushover not set, monitoring disabled");
    return;
  }

  console.log("[health-monitor] started (Pushover configured)");
  const staleMs = minutes(staleMinutes);
  const intervalMs = minutes(intervalMinutes);

  const check = async () => {
    const now = Date.now();
    const credit = getCreditBPlanStatus?.() || {};
    const popbill = getPopbillWorkerStatus?.() || {};

    const items = [
      { name: "creditBPlan", lastRunAt: credit.lastRunAt },
      { name: "popbillWorker", lastRunAt: popbill.lastRunAt },
    ];

    const staleTargets = [];
    for (const it of items) {
      const ts = parseIsoOrNull(it.lastRunAt);
      if (!ts) {
        staleTargets.push({ ...it, reason: "no-run" });
        continue;
      }
      if (now - ts.getTime() > staleMs) {
        staleTargets.push({ ...it, reason: `stale>${staleMinutes}m` });
      }
    }

    if (staleTargets.length) {
      const lines = staleTargets.map(
        (t) => `• ${t.name}: ${t.reason}, lastRunAt=${t.lastRunAt || "n/a"}`
      );
      const text = [
        ":warning: Background worker stale detected",
        `env: ${process.env.NODE_ENV || "unknown"}`,
        `host: ${process.env.HOSTNAME || "unknown"}`,
        ...lines,
      ].join("\n");
      await sendPushover({
        token: pushoverToken,
        user: pushoverUser,
        device: pushoverDevice,
        priority: pushoverPriority,
        title: "Background worker stale",
        message: text,
      });
    }
  };

  setInterval(check, intervalMs);
  check().catch((err) => {
    console.error("[health-monitor] initial check failed", err?.message);
  });
}
