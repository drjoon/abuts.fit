// related files:
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/practiceObBeta.util.js
// - web/backend/utils/creditLock.util.js
// - web/backend/controllers/admin/adminPracticeLaunch.controller.js
//
// 관리자 「런칭 - 실사용 전환」. 베타를 끄고, 그 시각의 할 일 목록을 남긴다.
import SystemSettings from "../models/systemSettings.model.js";
import { notePracticeLaunchLive } from "../utils/practiceObBeta.util.js";

/** 확인 전에 관리자가 직접 하는 일. 플랫폼은 대신하지 않는다. */
export const PRACTICE_LAUNCH_ADMIN_TASKS = [
  {
    id: "confirm-received-before-switch",
    text: "이미 입금된 달은 입금 확인을 먼저 합니다.\n확인 전에 전환하면 그 치과는 새 기공의뢰가 막힙니다.",
  },
  {
    id: "prepaid-switch-is-manual",
    text: "미납이 2회 이상이거나 일부만 들어온 치과의 선불 전환은 담당자가 직접 합니다.",
  },
  {
    id: "check-popbill-and-account",
    text: "기공료 안내 문자의 팝빌 포인트와 입금 계좌를 확인합니다.",
  },
  {
    id: "tell-labs-paid-credit",
    text: "일반 기공소에 커스텀어벗이 충전 크레딧으로 결제된다고 알립니다.",
  },
];

/** 확인과 함께 플랫폼이 바꾸는 일. 전환 시각에 그대로 저장한다. */
export const PRACTICE_LAUNCH_PLATFORM_TASKS = [
  {
    id: "record-live",
    text: "런칭 베타를 끄고 실사용으로 기록합니다.",
  },
  {
    id: "pause-unpaid-new-ptx",
    text: "기공료가 2차 기한 다음 날 09:00까지 확인되지 않으면 새 기공의뢰만 거부합니다.\n진행 중인 의뢰는 이어 갑니다.",
  },
  {
    id: "lab-paid-credit",
    text: "일반 기공소 커스텀어벗은 충전 크레딧과 무료 크레딧으로 결제합니다.\n기공 정산 적립은 쓰지 않습니다.",
  },
];

function copyTasks(rows) {
  return rows.map((row) => ({ id: row.id, text: row.text }));
}

function savedTasks(rows, canonical) {
  if (!Array.isArray(rows) || rows.length === 0) return copyTasks(canonical);
  return rows
    .map((row) => ({
      id: String(row?.id || "").trim(),
      text: String(row?.text || "").trim(),
    }))
    .filter((row) => row.text);
}

export async function getPracticeLaunchState() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ practiceLaunch: 1 })
    .lean();
  const saved = doc?.practiceLaunch || {};
  const live = String(saved.status || "") === "live";
  notePracticeLaunchLive(live);
  return {
    status: live ? "live" : "beta",
    switchedAt: saved.switchedAt || null,
    switchedByName: String(saved.switchedByName || "").trim(),
    adminTasks: live
      ? savedTasks(saved.adminTasks, PRACTICE_LAUNCH_ADMIN_TASKS)
      : copyTasks(PRACTICE_LAUNCH_ADMIN_TASKS),
    platformTasks: live
      ? savedTasks(saved.platformTasks, PRACTICE_LAUNCH_PLATFORM_TASKS)
      : copyTasks(PRACTICE_LAUNCH_PLATFORM_TASKS),
  };
}

export async function switchPracticeLaunchToLive({
  userId = null,
  userName = "",
} = {}) {
  const existing = await SystemSettings.findOne({ key: "global" });
  if (String(existing?.practiceLaunch?.status || "") === "live") {
    const err = new Error("이미 실사용으로 전환되어 있습니다.");
    err.statusCode = 409;
    throw err;
  }

  const practiceLaunch = {
    status: "live",
    switchedAt: new Date(),
    switchedByUserId: userId || null,
    switchedByName: String(userName || "").trim(),
    adminTasks: copyTasks(PRACTICE_LAUNCH_ADMIN_TASKS),
    platformTasks: copyTasks(PRACTICE_LAUNCH_PLATFORM_TASKS),
  };

  const doc = existing || new SystemSettings({ key: "global" });
  doc.practiceLaunch = practiceLaunch;
  doc.markModified("practiceLaunch");
  await doc.save();
  notePracticeLaunchLive(true);
  return getPracticeLaunchState();
}
