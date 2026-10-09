// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/modules/cnc/cncMachine.routes.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/AutoApprovalGateSwitch.tsx
// change-log:
// - 2026-10-10: 자동 승인을 켜면 30초 뒤에 승인·자동 가공을 시작한다.
// - 2026-10-10: 가공 HOLD 목록 제거. holdCount는 준비에 남겨 둔 문제 건 수.
// - 2026-10-09: 섀도 모드 제거. 켜면 통과 건을 바로 가공으로 승인한다.
// - 2026-10-09: 신설. 제조사-준비 페이지 스위치용(관리자 설정 아님).
import SystemSettings from "../../models/systemSettings.model.js";
import Request from "../../models/request.model.js";
import Machine from "../../models/machine.model.js";
import {
  activePrepCreatedAtFilter,
  getAutoGateConfig,
  runAutoMachiningGatePass,
} from "../../services/autoMachiningGate.service.js";
import {
  AUTO_START_GRACE_MS,
  isAutoStartGraceActive,
} from "../../services/autoStartGrace.js";
import { triggerNextAutoMachiningAfterComplete } from "./machiningBridge.js";

let graceKickTimer = null;

async function kickAutoStartAfterGrace() {
  if (await isAutoStartGraceActive()) return;
  try {
    await runAutoMachiningGatePass({ limit: 10 });
  } catch (error) {
    console.error("[autoMachiningGate] grace pass failed", error?.message || error);
  }
  const machines = await Machine.find({ allowAutoMachining: true })
    .select("uid")
    .lean();
  for (const machine of machines) {
    const uid = String(machine?.uid || "").trim();
    if (!uid) continue;
    try {
      await triggerNextAutoMachiningAfterComplete({
        machineId: uid,
        completedRequestId: null,
      });
    } catch (error) {
      console.warn(
        "[autoMachiningGate] grace auto-start failed",
        uid,
        error?.message || error,
      );
    }
  }
}

function scheduleGraceKick() {
  if (graceKickTimer) clearTimeout(graceKickTimer);
  graceKickTimer = setTimeout(() => {
    graceKickTimer = null;
    void kickAutoStartAfterGrace();
  }, AUTO_START_GRACE_MS + 500);
  graceKickTimer.unref?.();
}

/** 준비에 남겨 둔 문제 건. 작업자가 확인한 뒤 가공으로 넘긴다. */
async function countPrepHolds() {
  const createdAt = activePrepCreatedAtFilter();
  return Request.countDocuments({
    manufacturerStage: "준비",
    "autoMachiningReview.verdict": "hold",
    ...(createdAt ? { createdAt } : {}),
  });
}

async function buildPayload() {
  const config = await getAutoGateConfig();
  const holdCount = await countPrepHolds();
  return {
    enabled: config.enabled,
    holdCount,
    holds: [],
  };
}

export async function getAutoMachiningGate(req, res) {
  try {
    return res.status(200).json({ success: true, data: await buildPayload() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "자동 승인 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateAutoMachiningGate(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const $set = {};
    if (typeof body.enabled === "boolean") {
      $set["autoMachiningGate.enabled"] = body.enabled;
      $set["autoMachiningGate.autoStartAt"] = body.enabled
        ? new Date(Date.now() + AUTO_START_GRACE_MS)
        : null;
    }
    if (Object.keys($set).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "변경할 값이 없습니다." });
    }
    await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set },
      { upsert: true },
    );
    console.log("[autoMachiningGate] settings changed", {
      by: req.user?._id ? String(req.user._id) : null,
      ...body,
    });
    if (body.enabled === true) scheduleGraceKick();
    if (body.enabled === false && graceKickTimer) {
      clearTimeout(graceKickTimer);
      graceKickTimer = null;
    }
    return res.status(200).json({ success: true, data: await buildPayload() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "자동 승인 설정 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
