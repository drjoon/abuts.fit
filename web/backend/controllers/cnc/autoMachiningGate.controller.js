// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/modules/cnc/cncMachine.routes.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/AutoApprovalGateSwitch.tsx
// change-log:
// - 2026-11-26: 켤 때 게이트 pass는 worker와 같은 job lock으로 돌려 중복 승인을 막는다.
// - 2026-11-26: 켤 때 장비 자동 가공은 건드리지 않는다. 준비→가공 승인만 바로 돌린다.
// - 2026-10-14: 제외 의뢰자 목록 조회·저장. 이름은 BusinessAnchor에서 붙인다.
// - 2026-10-10: 자동 승인을 켜면 30초 뒤에 승인·자동 가공을 시작한다.
// - 2026-10-10: 가공 HOLD 목록 제거. holdCount는 준비에 남겨 둔 문제 건 수.
// - 2026-10-09: 섀도 모드 제거. 켜면 통과 건을 바로 가공으로 승인한다.
// - 2026-10-09: 신설. 제조사-준비 페이지 스위치용(관리자 설정 아님).
import mongoose from "mongoose";
import SystemSettings from "../../models/systemSettings.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  activePrepCreatedAtFilter,
  getAutoGateConfig,
  runAutoMachiningGatePass,
} from "../../services/autoMachiningGate.service.js";
import { runWithJobLock } from "../../utils/distributedJobLock.js";

const ENABLE_KICK_LOCK_OWNER = `auto-gate-enable-${process.pid}`;

async function kickPrepGatePass() {
  try {
    const locked = await runWithJobLock({
      name: "worker:auto-machining-gate",
      ownerId: ENABLE_KICK_LOCK_OWNER,
      leaseMs: 120000,
      heartbeatMs: 30000,
      onLockMiss: (reason) => {
        console.log("[autoMachiningGate] enable pass skipped (lock busy)", reason);
      },
      task: async () => runAutoMachiningGatePass({ limit: 10 }),
    });
    if (locked?.acquired === false) return;
  } catch (error) {
    console.error("[autoMachiningGate] enable pass failed", error?.message || error);
  }
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

const MAX_EXCLUDED_REQUESTORS = 100;

function normalizeExcludedIds(raw) {
  if (!Array.isArray(raw)) return null;
  const ids = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    if (!mongoose.Types.ObjectId.isValid(id)) return { error: "의뢰자 식별자가 올바르지 않습니다." };
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > MAX_EXCLUDED_REQUESTORS) {
    return { error: `제외할 의뢰자는 ${MAX_EXCLUDED_REQUESTORS}곳까지 저장할 수 있습니다.` };
  }
  return { ids };
}

async function loadExcludedRequestors(ids) {
  if (!ids.length) return [];
  const rows = await BusinessAnchor.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const nameById = new Map(
    rows.map((row) => [String(row._id), String(row.name || "").trim()]),
  );
  return ids.map((id) => ({
    id,
    name: nameById.get(id) || "이름 없음",
  }));
}

async function buildPayload() {
  const config = await getAutoGateConfig();
  const holdCount = await countPrepHolds();
  const excludedRequestors = await loadExcludedRequestors(
    config.excludedRequestorAnchorIds || [],
  );
  return {
    enabled: config.enabled,
    holdCount,
    holds: [],
    excludedRequestors,
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
      // 장비 자동 가공과 무관. 유예(autoStartAt)는 두지 않고 준비→가공만 바로 돌린다.
      $set["autoMachiningGate.autoStartAt"] = null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "excludedRequestorAnchorIds")) {
      const normalized = normalizeExcludedIds(body.excludedRequestorAnchorIds);
      if (!normalized || normalized.error) {
        return res.status(400).json({
          success: false,
          message: normalized?.error || "제외할 의뢰자 목록이 올바르지 않습니다.",
        });
      }
      $set["autoMachiningGate.excludedRequestorAnchorIds"] = normalized.ids;
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
    if (body.enabled === true) void kickPrepGatePass();
    return res.status(200).json({ success: true, data: await buildPayload() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "자동 승인 설정 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
