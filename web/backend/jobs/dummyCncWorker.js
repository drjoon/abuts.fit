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

async function runDummySchedulesOnce() {
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

      if (excludeHolidays) {
        const isBiz = await isKoreanBusinessDay(todayYmd);
        if (!isBiz) {
          continue;
        }
      }

      const progNo = parseProgramNoFromName(programName);
      if (!Number.isFinite(progNo)) {
        console.warn(
          `dummyCncWorker: cannot parse program number from name '${programName}' for machine ${machine.machineId}`,
        );
        continue;
      }

      let executedForThisMinute = false;
      for (const s of schedules) {
        if (!s || s.enabled === false) continue;
        const time = typeof s.time === "string" ? s.time : "";
        if (!time) continue;
        if (time !== currentHm) continue;

        const uid = String(machine.machineId || "").trim();
        if (!uid) {
          console.warn(
            `dummyCncWorker: machine ${machine._id} has no machineId, skip`,
          );
          continue;
        }

        try {
          const actRes = await fetch(
            `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/programs/activate`,
            {
              method: "POST",
              headers: withBridgeHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ headType: 1, programNo: progNo }),
            },
          );
          const actBody = await actRes.json().catch(() => ({}));
          if (!actRes.ok || actBody?.success === false) {
            console.error(
              "dummyCncWorker: activate program failed",
              uid,
              actBody,
            );
            continue;
          }

          const startRes = await fetch(
            `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/start`,
            {
              method: "POST",
              headers: withBridgeHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ status: 0, ioUid: 0 }),
            },
          );
          const startBody = await startRes.json().catch(() => ({}));
          if (!startRes.ok || startBody?.success === false) {
            console.error(
              "dummyCncWorker: start machine failed",
              uid,
              startBody,
            );
            continue;
          }

          console.log(
            `dummyCncWorker: started dummy program ${programName} (no=${progNo}) on ${uid} at ${currentHm} (KST)`,
          );
          executedForThisMinute = true;
        } catch (err) {
          console.error("dummyCncWorker: error while processing schedule", {
            machineId: machine.machineId,
            time,
            error: String(err?.message || err),
          });
        }
      }

      if (executedForThisMinute) {
        try {
          await CncMachine.updateOne(
            { _id: machine._id },
            { $set: { "dummySettings.lastRunKey": minuteKey } },
          );
        } catch (e) {
          console.error(
            "dummyCncWorker: failed to update lastRunKey",
            machine.machineId,
            e,
          );
        }
      }
    }
  } catch (err) {
    console.error("dummyCncWorker: unexpected error", err);
  }
}

const INTERVAL_MS = 60 * 1000; // 1분

async function loop() {
  await runDummySchedulesOnce();
  setTimeout(loop, INTERVAL_MS);
}

if (process.env.DUMMY_CNC_WORKER_ENABLED !== "false") {
  loop().catch((err) => {
    console.error("dummyCncWorker: initialization failed", err);
    process.exit(1);
  });
} else {
  console.log("dummyCncWorker is disabled");
}
