// related files:
// - web/backend/controllers/cnc/autoMachiningGate.controller.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/services/autoMachiningGate.service.js
// change-log:
// - 2026-10-10: 자동 승인을 켜면 30초 동안 준비→가공 승인과 자동 가공 시작을 미룬다.
import SystemSettings from "../models/systemSettings.model.js";

export const AUTO_START_GRACE_MS = 30_000;

export async function readAutoStartAt() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select("autoMachiningGate.autoStartAt")
    .lean();
  const raw = doc?.autoMachiningGate?.autoStartAt;
  if (!raw) return null;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) ? at : null;
}

/** 자동 승인 직후 유예. 작업자가 장비 자동 스위치를 끌 시간이다. */
export async function isAutoStartGraceActive(now = Date.now()) {
  const at = await readAutoStartAt();
  return at != null && now < at;
}
