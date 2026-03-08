import "../bootstrap/env.js";
import mongoose from "mongoose";
import CncMachine from "../models/cncMachine.model.js";
import {
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "../utils/krBusinessDays.js";

const KST_TZ = "Asia/Seoul";
const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET || "dev-secret";
const INTERVAL_MS = 60 * 1000;

let timerHandle = null;
let running = false;

function withBridgeHeaders(extra = {}) {
  return {
    ...extra,
    "X-Bridge-Secret": BRIDGE_SHARED_SECRET,
  };
}

function parseProgramNoFromName(name) {
  const str = String(name || "");
  const fanucMatch = str.match(/O(\d{4})/i);
  if (fanucMatch) {
    const n = Number(fanucMatch[1]);
    return Number.isFinite(n) ? n : null;
  }
  const fallbackMatch = str.match(/(\d{1,6})/);
  if (!fallbackMatch) return null;
  const n = Number(fallbackMatch[1]);
  return Number.isFinite(n) ? n : null;
}

function getCurrentHmInKst() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

async function persistLastRunKey(machineId, minuteKey) {
  try {
    await CncMachine.updateOne(
      { machineId },
      { $set: { "dummySettings.lastRunKey": minuteKey } },
    );
  } catch (error) {
    console.error("dummyCncWorker: failed to persist lastRunKey", {
      machineId,
      minuteKey,
      error,
    });
  }
}

async function triggerDummyRun({
  machineId,
  programName,
  programNo,
  minuteKey,
}) {
  const url = `${BRIDGE_BASE}/api/cnc/dummy/run?machines=${encodeURIComponent(machineId)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: withBridgeHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      headType: 1,
      programName,
      programNo,
      trigger: "scheduled",
      minuteKey,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok && body?.success !== false,
    status: response.status,
    body,
  };
}

export async function runDummySchedulesOnce() {
  if (!BRIDGE_BASE) {
    console.error("dummyCncWorker: BRIDGE_BASE is not configured");
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("dummyCncWorker: MONGODB_URI is not set");
    return;
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const todayYmd = getTodayYmdInKst();
  const currentHm = getCurrentHmInKst();
  const minuteKey = `${todayYmd} ${currentHm}`;

  try {
    const isBizToday = await isKoreanBusinessDay(todayYmd);
    const machines = await CncMachine.find({
      "dummySettings.enabled": { $ne: false },
      "dummySettings.schedules.enabled": true,
    }).lean();

    for (const machine of machines) {
      const dummy = machine.dummySettings || {};
      if (dummy.enabled === false) continue;
      const programName = dummy.programName || "O0100";
      const schedules = Array.isArray(dummy.schedules) ? dummy.schedules : [];
      const excludeHolidays = Boolean(dummy.excludeHolidays);

      // 같은 장비에 대해 같은 분(minuteKey)에 이미 실행했다면 스킵 (idempotent)
      if (dummy.lastRunKey && dummy.lastRunKey === minuteKey) {
        continue;
      }

      if (excludeHolidays && !isBizToday) {
        continue;
      }

      const matchedSchedule = schedules.find((s) => {
        if (!s || s.enabled === false) return false;
        const time = typeof s.time === "string" ? s.time : "";
        return Boolean(time) && time === currentHm;
      });
      if (!matchedSchedule) {
        continue;
      }

      const progNo = parseProgramNoFromName(programName);
      if (!Number.isFinite(progNo)) {
        console.warn(
          `dummyCncWorker: cannot parse program number from name '${programName}' for machine ${machine.machineId}`,
        );
        await persistLastRunKey(machine.machineId, minuteKey);
        continue;
      }

      const uid = String(machine.machineId || "").trim();
      if (!uid) {
        console.warn(
          `dummyCncWorker: machine ${machine._id} has no machineId, skip`,
        );
        continue;
      }

      await persistLastRunKey(uid, minuteKey);

      try {
        const result = await triggerDummyRun({
          machineId: uid,
          programName,
          programNo: progNo,
          minuteKey,
        });
        if (!result.ok) {
          console.error("dummyCncWorker: dummy run failed", {
            machineId: uid,
            minuteKey,
            status: result.status,
            body: result.body,
          });
          continue;
        }
        console.log("dummyCncWorker: dummy run requested", {
          machineId: uid,
          minuteKey,
          currentHm,
          programName,
          programNo: progNo,
          result: result.body,
        });
      } catch (err) {
        console.error("dummyCncWorker: error while processing schedule", {
          machineId: uid,
          minuteKey,
          error: String(err?.message || err),
        });
      }
    }
  } catch (err) {
    console.error("dummyCncWorker: unexpected error", err);
  }
}

async function loop() {
  if (running) {
    return;
  }
  running = true;
  try {
    await runDummySchedulesOnce();
  } catch (err) {
    console.error("dummyCncWorker: loop error", err);
  } finally {
    running = false;
    timerHandle = setTimeout(loop, INTERVAL_MS);
  }
}

export function startDummyCncScheduler() {
  if (process.env.DUMMY_CNC_WORKER_ENABLED === "false") {
    console.log("dummyCncWorker is disabled");
    return;
  }
  if (timerHandle) {
    return;
  }
  loop().catch((err) => {
    running = false;
    timerHandle = null;
    console.error("dummyCncWorker: initialization failed", err);
  });
}

export function stopDummyCncScheduler() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  running = false;
}
