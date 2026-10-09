// related files:
// - web/backend/services/autoMachiningGate.service.js
// - web/backend/modules/cnc/cncMachine.routes.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/AutoApprovalGateSwitch.tsx
// change-log:
// - 2026-10-09: 테스트 계정은 수동 승인 전 준비·가공 모두 HOLD. 승인 후에는 뺀다.
// - 2026-10-09: 신설. 제조사-가공 페이지 스위치용(관리자 설정 아님).
import CncMachine from "../../models/cncMachine.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import Request from "../../models/request.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { getAutoGateConfig } from "../../services/autoMachiningGate.service.js";
import { GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES } from "../../utils/guideTour.util.js";
import { hasManualMachiningApproval } from "../../utils/testAccountMachining.js";

const HOLD_LIST_LIMIT = 60;

/** 보류 건을 장비 카드에 붙인다: 배정 장비 → 소재 직경이 맞는 가장 작은 장비 → 가장 큰 장비. */
function pickMachineForHold(doc, machines) {
  const assigned = String(doc?.productionSchedule?.assignedMachine || "").trim();
  if (assigned && machines.some((m) => m.machineId === assigned)) return assigned;
  const d = Number(doc?.caseInfos?.maxDiameter);
  const sorted = [...machines].sort((a, b) => a.dia - b.dia);
  if (Number.isFinite(d) && d > 0) {
    const fit = sorted.find((m) => m.dia >= d);
    if (fit) return fit.machineId;
  }
  return sorted.length ? sorted[sorted.length - 1].machineId : null;
}

const TEST_ACCOUNT_NAMES = [...GUIDE_TOUR_ALWAYS_ON_BUSINESS_NAMES];

async function findUnapprovedTestAccountRequests() {
  const anchors = await BusinessAnchor.find({ name: { $in: TEST_ACCOUNT_NAMES } })
    .select("_id")
    .lean();
  const anchorIds = anchors.map((row) => row._id);
  const or = [{ "caseInfos.clinicName": { $in: TEST_ACCOUNT_NAMES } }];
  if (anchorIds.length) or.push({ businessAnchorId: { $in: anchorIds } });
  const rows = await Request.find({
    manufacturerStage: { $in: ["준비", "가공"] },
    source: { $ne: "dummy_sample" },
    $or: or,
  })
    .sort({ createdAt: 1 })
    .limit(HOLD_LIST_LIMIT)
    .select(
      "requestId caseInfos.clinicName caseInfos.patientName caseInfos.tooth caseInfos.maxDiameter caseInfos.reviewByStage productionSchedule.assignedMachine productionSchedule.manualMachiningApprovedAt autoMachiningReview manufacturerStage",
    )
    .lean();
  return rows.filter((row) => !hasManualMachiningApproval(row));
}

function upsertHold(byRequestId, item) {
  const prev = byRequestId.get(item.requestId);
  if (!prev) {
    byRequestId.set(item.requestId, { ...item, reasons: [...(item.reasons || [])] });
    return;
  }
  const reasons = new Set([...(prev.reasons || []), ...(item.reasons || [])]);
  prev.reasons = [...reasons];
}

async function buildHolds() {
  const [machinesRaw, prepHolds, testHeld, machiningBlocked] = await Promise.all([
    CncMachine.find({ status: "active" })
      .select("machineId currentMaterial")
      .lean(),
    Request.find({
      manufacturerStage: "준비",
      "autoMachiningReview.verdict": "hold",
    })
      .sort({ createdAt: 1 })
      .limit(HOLD_LIST_LIMIT)
      .select(
        "requestId caseInfos.clinicName caseInfos.patientName caseInfos.tooth caseInfos.maxDiameter productionSchedule.assignedMachine autoMachiningReview manufacturerStage",
      )
      .lean(),
    findUnapprovedTestAccountRequests(),
    // 가공 단계에서 자동 연속 가공이 건너뛰는 건(용량 초과 실패·NC 좌표 한계)
    Request.find({
      manufacturerStage: "가공",
      $or: [
        {
          "productionSchedule.machiningProgress.phase": "ALARM",
          "productionSchedule.machiningProgress.errorCode": "CNC_PROGRAM_TOO_LARGE",
        },
        { "caseInfos.ncFile.analysis.flags.0": { $exists: true } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(HOLD_LIST_LIMIT)
      .select(
        "requestId caseInfos.clinicName caseInfos.patientName caseInfos.tooth caseInfos.maxDiameter caseInfos.ncFile.analysis caseInfos.ncFile.uploadedAt productionSchedule.assignedMachine productionSchedule.machiningProgress manufacturerStage",
      )
      .lean(),
  ]);
  const machines = machinesRaw.map((m) => ({
    machineId: m.machineId,
    dia: Number(m.currentMaterial?.diameter) || 0,
  }));
  const byRequestId = new Map();
  for (const d of prepHolds) {
    upsertHold(byRequestId, {
      requestId: d.requestId,
      stage: "준비",
      machineId: pickMachineForHold(d, machines),
      clinicName: d.caseInfos?.clinicName || "",
      patientName: d.caseInfos?.patientName || "",
      tooth: d.caseInfos?.tooth || "",
      reasons: d.autoMachiningReview?.reasons || [],
    });
  }
  for (const d of testHeld) {
    const reasons = [...(d.autoMachiningReview?.reasons || [])];
    if (!reasons.includes("test_account")) reasons.push("test_account");
    const stage = String(d.manufacturerStage || "") === "가공" ? "가공" : "준비";
    upsertHold(byRequestId, {
      requestId: d.requestId,
      stage,
      machineId: pickMachineForHold(d, machines),
      clinicName: d.caseInfos?.clinicName || "",
      patientName: d.caseInfos?.patientName || "",
      tooth: d.caseInfos?.tooth || "",
      reasons,
    });
  }
  const holds = [...byRequestId.values()];
  for (const d of machiningBlocked) {
    const reasons = [...(d.caseInfos?.ncFile?.analysis?.flags || [])];
    const prog = d.productionSchedule?.machiningProgress;
    if (String(prog?.errorCode || "") === "CNC_PROGRAM_TOO_LARGE") {
      const ncAt = d.caseInfos?.ncFile?.uploadedAt
        ? new Date(d.caseInfos.ncFile.uploadedAt).getTime()
        : 0;
      const failAt = prog?.lastTickAt ? new Date(prog.lastTickAt).getTime() : 0;
      if (ncAt <= failAt) reasons.push("program_too_large");
    }
    if (!reasons.length) continue;
    holds.push({
      requestId: d.requestId,
      stage: "가공",
      machineId: pickMachineForHold(d, machines),
      clinicName: d.caseInfos?.clinicName || "",
      patientName: d.caseInfos?.patientName || "",
      tooth: d.caseInfos?.tooth || "",
      reasons,
    });
  }
  return holds;
}

async function buildPayload() {
  const config = await getAutoGateConfig();
  const [holds, wouldApproveCount] = await Promise.all([
    buildHolds(),
    Request.countDocuments({
      manufacturerStage: "준비",
      "autoMachiningReview.verdict": "would_approve",
    }),
  ]);
  return {
    enabled: config.enabled,
    mode: config.mode,
    holdCount: holds.length,
    wouldApproveCount,
    holds,
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
    }
    if (body.mode === "shadow" || body.mode === "live") {
      $set["autoMachiningGate.mode"] = body.mode;
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
    return res.status(200).json({ success: true, data: await buildPayload() });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "자동 승인 설정 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
