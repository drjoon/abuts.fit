import mongoose, { Types } from "mongoose";
import path from "path";
import Request from "../../models/request.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  applyStatusMapping,
  canAccessRequestAsRequestor,
  normalizeRequestForResponse,
  ensureLotNumberForMachining,
  ensureFinishedLotNumberForPackaging,
  buildRequestorOrgScopeFilter,
  normalizeCaseInfosImplantFields,
  getTodayYmdInKst,
} from "./utils.js";
import { computeShippingPriority } from "./shippingPriority.utils.js";
import { getOrganizationCreditBalanceBreakdown } from "./creation.controller.js";
import s3Utils, {
  deleteFileFromS3,
  getSignedUrl as getSignedUrlForS3Key,
} from "../../utils/s3.utils.js";

const ESPRIT_BASE =
  process.env.ESPRIT_ADDIN_BASE_URL ||
  process.env.ESPRIT_BASE ||
  process.env.ESPRIT_URL ||
  "http://localhost:8001";

const BRIDGE_PROCESS_BASE =
  process.env.BRIDGE_NODE_URL ||
  process.env.BRIDGE_PROCESS_BASE ||
  process.env.CNC_BRIDGE_BASE ||
  process.env.BRIDGE_BASE ||
  "http://localhost:8002";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

function extractProgramNoFromNcText(text) {
  const s = String(text || "");
  const m = s.toUpperCase().match(/\bO(\d{1,5})\b/m);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDiameterGroup(diameter) {
  const d = Number(diameter);
  if (!Number.isFinite(d) || d <= 0) return null;
  if (d <= 6) return "6";
  if (d <= 8) return "8";
  if (d <= 10) return "10";
  return "10+";
}

async function fetchBridgeQueueSnapshot() {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.BG_TRIGGER_TIMEOUT_MS || 2500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(
      `${BRIDGE_PROCESS_BASE.replace(/\/$/, "")}/api/bridge/queue`,
      {
        method: "GET",
        headers: withBridgeHeaders(),
        signal: controller.signal,
      },
    );
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return null;
    }
    return body?.data && typeof body.data === "object" ? body.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function chooseMachineForRequest({ request }) {
  const maxDiameter = Number(request?.caseInfos?.maxDiameter);
  if (!Number.isFinite(maxDiameter) || maxDiameter <= 0) {
    const err = new Error(
      "최대 직경 정보가 없어 CNC 장비를 자동 선택할 수 없습니다.",
    );
    err.statusCode = 400;
    throw err;
  }

  const machines = await CncMachine.find({ status: "active" }).lean();

  // 자동 가공 허용(allowAutoMachining=true)인 장비만 자동 선택 후보에 포함한다.
  const autoMachines = await Machine.find({ allowAutoMachining: true })
    .lean()
    .catch(() => []);
  const autoMachineIdSet = new Set(
    (Array.isArray(autoMachines) ? autoMachines : [])
      .map((m) => String(m?.uid || m?.name || "").trim())
      .filter((v) => !!v),
  );
  const existingAssigned = String(
    request?.productionSchedule?.assignedMachine ||
      request?.assignedMachine ||
      "",
  ).trim();
  const candidates = (Array.isArray(machines) ? machines : [])
    .map((m) => {
      const matDia = Number(m?.currentMaterial?.diameter);
      const diff = matDia - maxDiameter;
      return {
        machineId: String(m?.machineId || "").trim(),
        materialDiameter: matDia,
        diff,
      };
    })
    .filter((m) => {
      if (!m.machineId) return false;
      if (!autoMachineIdSet.has(m.machineId)) return false;
      return (
        Number.isFinite(m.materialDiameter) &&
        m.materialDiameter > 0 &&
        m.diff >= 0 &&
        m.diff < 2
      );
    });

  if (existingAssigned && autoMachineIdSet.has(existingAssigned)) {
    const keep = candidates.find((c) => c.machineId === existingAssigned);
    if (keep) {
      const bridgeQueues = await fetchBridgeQueueSnapshot();
      const queueLen = bridgeQueues
        ? Array.isArray(bridgeQueues?.[keep.machineId])
          ? bridgeQueues[keep.machineId].length
          : 0
        : await Request.countDocuments({
            status: { $in: ["의뢰", "CAM", "생산"] },
            "productionSchedule.assignedMachine": keep.machineId,
          });

      return {
        machineId: keep.machineId,
        queuePosition: Number(queueLen || 0) + 1,
        diameter: keep.materialDiameter,
        diameterGroup: toDiameterGroup(keep.materialDiameter),
      };
    }
  }

  if (!candidates.length) {
    const err = new Error(
      "조건에 맞는 CNC 장비가 없습니다. (자동 가공 허용 ON 이면서 소재 직경이 최대 직경 이상이고, 차이가 2mm 미만인 장비가 필요합니다.)",
    );
    err.statusCode = 400;
    throw err;
  }

  const bridgeQueues = await fetchBridgeQueueSnapshot();
  const queueLenByMachineId = {};
  if (bridgeQueues) {
    for (const c of candidates) {
      const list = bridgeQueues?.[c.machineId];
      queueLenByMachineId[c.machineId] = Array.isArray(list) ? list.length : 0;
    }
  } else {
    const pairs = await Promise.all(
      candidates.map(async (c) => {
        const n = await Request.countDocuments({
          status: { $in: ["의뢰", "CAM", "생산"] },
          "productionSchedule.assignedMachine": c.machineId,
        });
        return [c.machineId, n];
      }),
    );
    for (const [k, v] of pairs) {
      queueLenByMachineId[k] = v;
    }
  }

  const best = candidates.slice().sort((a, b) => {
    // 1) 소재 직경 차이(diff) 작은 순
    if (a.diff !== b.diff) return a.diff - b.diff;
    // 2) 큐 길이 작은 순
    const qa = Number(queueLenByMachineId[a.machineId] ?? 0);
    const qb = Number(queueLenByMachineId[b.machineId] ?? 0);
    if (qa !== qb) return qa - qb;
    // 3) machineId 사전순
    return String(a.machineId).localeCompare(String(b.machineId));
  })[0];

  const queueLen = Number(queueLenByMachineId[best.machineId] ?? 0);
  return {
    machineId: best.machineId,
    queuePosition: queueLen + 1,
    diameter: best.materialDiameter,
    diameterGroup: toDiameterGroup(best.materialDiameter),
  };
}

function buildBgStorageBase() {
  // bg.controller.js와 동일한 디폴트 규칙을 맞춘다.
  // process.cwd() 기준은 실행 환경에 따라 달라질 수 있으므로, 환경변수(BG_STORAGE_PATH)를 우선한다.
  try {
    const p = process.env.BG_STORAGE_PATH;
    if (p) return p;
  } catch {
    // ignore
  }
  return null;
}

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

async function ensureShippingPackageAndChargeFee({ request, userId, session }) {
  if (!request) return;

  const organizationIdRaw =
    request.requestorOrganizationId || request.requestor?.organizationId;
  const organizationId =
    organizationIdRaw && Types.ObjectId.isValid(String(organizationIdRaw))
      ? new Types.ObjectId(String(organizationIdRaw))
      : null;
  if (!organizationId) {
    const err = new Error("조직 정보가 없어 발송 박스를 생성할 수 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const pickup = request?.productionSchedule?.scheduledShipPickup;
  const shipDateYmd = toKstYmd(pickup) || getTodayYmdInKst();

  let pkg;
  try {
    pkg = await ShippingPackage.findOneAndUpdate(
      { organizationId, shipDateYmd },
      {
        $setOnInsert: {
          organizationId,
          shipDateYmd,
          createdBy: userId || null,
        },
        $addToSet: { requestIds: request._id },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        session: session || null,
      },
    );
  } catch (e) {
    const msg = String(e?.message || "");
    const code = e?.code;
    if (code === 11000 || msg.includes("E11000")) {
      pkg = await ShippingPackage.findOne({ organizationId, shipDateYmd })
        .session(session || null)
        .lean();
      if (pkg?._id) {
        await ShippingPackage.updateOne(
          { _id: pkg._id },
          { $addToSet: { requestIds: request._id } },
          { session: session || null },
        );
      }
    } else {
      throw e;
    }
  }

  if (pkg?._id) {
    request.shippingPackageId = pkg._id;
  }

  const fee = Number(pkg?.shippingFeeSupply || 0);
  if (fee > 0) {
    const uniqueKey = `shippingPackage:${String(pkg._id)}:shipping_fee`;
    await CreditLedger.updateOne(
      { uniqueKey },
      {
        $setOnInsert: {
          organizationId,
          userId: userId || null,
          type: "SPEND",
          amount: -fee,
          refType: "SHIPPING_PACKAGE",
          refId: pkg._id,
          uniqueKey,
        },
      },
      { upsert: true, session: session || null },
    );
  }
}

async function triggerEspritForNc({ request, session }) {
  // idempotency: 이미 NC가 있으면 재트리거하지 않는다.
  const existingNc =
    request?.caseInfos?.ncFile?.fileName || request?.caseInfos?.ncFile?.s3Key;
  if (existingNc) return;

  // idempotency: CAM 단계(status2=중)인데 NC가 없다면 이미 NC 생성이 진행 중인 것으로 간주
  if (String(request?.status || "").trim() === "CAM") {
    const s2 = String(request?.status2 || "").trim();
    if (s2 === "중") {
      return;
    }
  }

  const camFileName = request?.caseInfos?.camFile?.fileName;
  if (!camFileName) {
    const err = new Error("CAM 파일이 없어 NC 생성을 시작할 수 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  // Esprit Add-in에서 storage 경로를 자체적으로 resolve 할 수 있도록 파일명(상대값)만 전달한다.
  // (.filled.stl -> .nc)
  const ncFileName = String(camFileName).replace(/\.stl$/i, ".nc");

  // Esprit add-in은 baseUrl(http://...:8001/)로 POST(JSON)만 받는다.
  // 제조사 UI가 멈추지 않도록 짧은 타임아웃을 적용한다.
  const controller = new AbortController();
  const timeoutMs = Number(process.env.BG_TRIGGER_TIMEOUT_MS || 2500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(`${ESPRIT_BASE.replace(/\/$/, "")}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        RequestId: String(request.requestId),
        StlPath: camFileName,
        NcOutputPath: ncFileName,

        ClinicName: request?.caseInfos?.clinicName || "",
        PatientName: request?.caseInfos?.patientName || "",
        Tooth: request?.caseInfos?.tooth || "",
        ImplantManufacturer: request?.caseInfos?.implantManufacturer || "",
        ImplantSystem: request?.caseInfos?.implantSystem || "",
        ImplantType: request?.caseInfos?.implantType || "",
        MaxDiameter: Number(request?.caseInfos?.maxDiameter || 0),
        ConnectionDiameter: Number(request?.caseInfos?.connectionDiameter || 0),
        WorkType: request?.caseInfos?.workType || "",
        LotNumber: request?.lotNumber?.part || "",
      }),
      signal: controller.signal,
    });
  } catch (e) {
    const err = new Error(
      "Esprit 서버에 연결할 수 없습니다. Esprit 서버(8001)를 실행한 후 다시 시도해주세요.",
    );
    err.statusCode = 503;
    throw err;
  } finally {
    clearTimeout(t);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(
      `Esprit 트리거 실패 (${resp.status}): ${text || ""}`.trim(),
    );
    err.statusCode = 503;
    throw err;
  }
}

async function triggerBridgeForCnc({ request }) {
  // idempotency: 이미 CNC가 시작된 상태면 재트리거하지 않는다.
  if (request?.productionSchedule?.actualMachiningStart) return;

  const machineId = String(
    request?.productionSchedule?.assignedMachine || "",
  ).trim();
  if (!machineId) {
    const err = new Error(
      "CNC 장비가 할당되지 않아 CNC 공정을 시작할 수 없습니다.",
    );
    err.statusCode = 400;
    throw err;
  }

  const ncFileName = request?.caseInfos?.ncFile?.fileName;
  if (!ncFileName) {
    const err = new Error("NC 파일이 없어 CNC 공정을 시작할 수 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const bridgePath = String(request?.caseInfos?.ncFile?.filePath || "").trim();

  const controller = new AbortController();
  const timeoutMs = Number(process.env.BG_TRIGGER_TIMEOUT_MS || 2500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(
      `${BRIDGE_PROCESS_BASE.replace(/\/$/, "")}/api/bridge/process-file`,
      {
        method: "POST",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          fileName: ncFileName,
          requestId: request.requestId,
          machineId,
          bridgePath: bridgePath || null,
        }),
        signal: controller.signal,
      },
    );
  } catch {
    const err = new Error(
      "Bridge 서버에 연결할 수 없습니다. Bridge 서버(8002)를 실행한 후 다시 시도해주세요.",
    );
    err.statusCode = 503;
    throw err;
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(
      `Bridge 트리거 실패 (${resp.status}): ${text || ""}`.trim(),
    );
    err.statusCode = 503;
    throw err;
  }
}

async function uploadNcToBridgeStore({ requestId, s3Key, fileName }) {
  if (!BRIDGE_BASE) {
    return { ok: false, reason: "BRIDGE_BASE is not configured" };
  }

  const buf = await s3Utils.getObjectBufferFromS3(s3Key);
  const content = buf.toString("utf8");

  const programNo = extractProgramNoFromNcText(content);
  const normalizedName =
    programNo != null
      ? `O${String(programNo).padStart(4, "0")}.nc`
      : String(fileName || "").trim();

  if (!normalizedName) {
    return { ok: false, reason: "missing fileName" };
  }

  const relPath = `nc/${String(requestId || "").trim()}/${normalizedName}`;
  const resp = await fetch(`${BRIDGE_BASE}/api/bridge-store/upload`, {
    method: "POST",
    headers: withBridgeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: relPath, content, normalizeName: false }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body?.success === false) {
    return {
      ok: false,
      reason: String(
        body?.message || body?.error || "bridge-store upload failed",
      ),
    };
  }
  const savedPath = String(body?.path || relPath);
  return { ok: true, path: savedPath, programNo: programNo ?? null };
}

const ensureReviewByStageDefaults = (request) => {
  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  request.caseInfos.reviewByStage.request = request.caseInfos.reviewByStage
    .request || { status: "PENDING" };
  request.caseInfos.reviewByStage.cam = request.caseInfos.reviewByStage.cam || {
    status: "PENDING",
  };
  request.caseInfos.reviewByStage.machining = request.caseInfos.reviewByStage
    .machining || { status: "PENDING" };
  request.caseInfos.reviewByStage.packaging = request.caseInfos.reviewByStage
    .packaging || { status: "PENDING" };
  request.caseInfos.reviewByStage.shipping = request.caseInfos.reviewByStage
    .shipping || { status: "PENDING" };
  request.caseInfos.reviewByStage.tracking = request.caseInfos.reviewByStage
    .tracking || { status: "PENDING" };
};

const revertManufacturerStageByReviewStage = (request, stage) => {
  const map = {
    request: "의뢰",
    cam: "CAM",
    machining: "생산",
    packaging: "생산",
    shipping: "발송",
    tracking: "추적관리",
  };
  const target = map[String(stage || "").trim()];
  if (target) {
    request.manufacturerStage = target;
  }
};

export async function deleteStageFile(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "").trim();
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    const allowed = ["machining", "packaging", "shipping", "tracking"];

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    const meta = request.caseInfos.stageFiles?.[stage] || null;
    const s3Key = meta?.s3Key;

    if (rollbackOnly) {
      request.caseInfos.reviewByStage[stage] = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      const prevStageMap = {
        machining: "CAM",
        packaging: "CAM",
        shipping: "생산",
        tracking: "발송",
      };
      const prevStage = prevStageMap[stage];
      if (prevStage) {
        request.manufacturerStage = prevStage;
      }

      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "삭제할 파일이 없습니다.",
      });
    }

    try {
      await deleteFileFromS3(s3Key);
    } catch {
      // ignore S3 delete errors
    }

    delete request.caseInfos.stageFiles[stage];

    request.caseInfos.reviewByStage[stage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    // stageFiles의 stage는 reviewByStage 키와 동일한 문자열을 사용
    revertManufacturerStageByReviewStage(request, stage);

    await request.save();

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

const advanceManufacturerStageByReviewStage = async ({
  request,
  stage,
  userId,
  session,
}) => {
  if (stage === "request") {
    applyStatusMapping(request, "CAM");
    return;
  }

  if (stage === "cam") {
    // [변경] CAM 승인(생산 시작) 시점에 크레딧 차감
    const organizationId =
      request.requestorOrganizationId || request.requestor?.organizationId;
    if (organizationId) {
      const { balance } = await getOrganizationCreditBalanceBreakdown({
        organizationId,
        session,
      });
      const amountToDeduct = Number(request.price?.amount || 0);

      if (balance < amountToDeduct) {
        const err = new Error("크레딧이 부족하여 생산을 시작할 수 없습니다.");
        err.statusCode = 402;
        throw err;
      }

      const uniqueKey = `request:${String(request._id)}:cam_approve_spend`;
      await CreditLedger.updateOne(
        { uniqueKey },
        {
          $setOnInsert: {
            organizationId,
            userId: userId || null,
            type: "SPEND",
            amount: -amountToDeduct,
            refType: "REQUEST",
            refId: request._id,
            uniqueKey,
          },
        },
        { upsert: true, session },
      );
    }

    applyStatusMapping(request, "생산");
    return;
  }

  if (stage === "machining" || stage === "packaging") {
    await ensureShippingPackageAndChargeFee({ request, userId, session });
    applyStatusMapping(request, "발송");
    return;
  }

  if (stage === "shipping") {
    await ensureShippingPackageAndChargeFee({ request, userId, session });
    applyStatusMapping(request, "발송"); // '발송' 상태 내에서 상세 단계(status2)만 변경됨
    return;
  }

  if (stage === "tracking") {
    applyStatusMapping(request, "추적관리");
  }
};

export async function updateReviewStatusByStage(req, res) {
  const session = await mongoose.startSession();
  try {
    const { id } = req.params;
    const { stage, status, reason } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "변경 권한이 없습니다." });
    }

    const allowedStages = [
      "request",
      "cam",
      "machining",
      "packaging",
      "shipping",
      "tracking",
    ];
    if (!allowedStages.includes(String(stage || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }

    const allowedStatuses = ["PENDING", "APPROVED", "REJECTED"];
    if (!allowedStatuses.includes(String(status || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 status 입니다.",
      });
    }

    let resultRequest = null;

    await session.withTransaction(async () => {
      const request = await Request.findById(id).session(session);
      if (!request) {
        const err = new Error("의뢰를 찾을 수 없습니다.");
        err.statusCode = 404;
        throw err;
      }

      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage[stage] = {
        status,
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: String(reason || ""),
      };

      // 승인 시 다음 공정으로 전환, 미승인(PENDING) 시 현재 단계로 되돌림
      if (status === "APPROVED") {
        await advanceManufacturerStageByReviewStage({
          request,
          stage,
          userId: req.user?._id,
          session,
        });

        const stageKey = String(stage || "").trim();
        if (stageKey === "packaging") {
          await ensureFinishedLotNumberForPackaging(request);
        }

        // CAM 단계 진입 직후(의뢰 승인 시) 반제품 로트번호 부여
        if (stageKey === "request") {
          await ensureLotNumberForMachining(request);
          await triggerEspritForNc({ request, session });
        }

        if (stageKey === "cam") {
          const selected = await chooseMachineForRequest({ request });
          request.productionSchedule = request.productionSchedule || {};
          request.productionSchedule.assignedMachine = selected.machineId;
          request.productionSchedule.queuePosition = selected.queuePosition;
          if (selected.diameterGroup) {
            request.productionSchedule.diameterGroup = selected.diameterGroup;
          }
          if (Number.isFinite(selected.diameter)) {
            request.productionSchedule.diameter = selected.diameter;
          }
          request.assignedMachine = selected.machineId;
          await triggerBridgeForCnc({ request });
        }
      } else if (status === "PENDING") {
        revertManufacturerStageByReviewStage(request, stage);
      }

      await request.save({ session });
      resultRequest = request;
    });

    return res.status(200).json({
      success: true,
      data: await normalizeRequestForResponse(resultRequest),
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "검토 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
}

export async function getStageFileUrl(req, res) {
  try {
    const { id } = req.params;
    const stage = String(req.query.stage || "").trim();
    const allowed = ["machining", "packaging", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(stage)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    const meta = request?.caseInfos?.stageFiles?.[stage];
    const s3Key = meta?.s3Key;
    const fileName = meta?.fileName || `${stage}-file`;
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveStageFile(req, res) {
  try {
    const { id } = req.params;
    const {
      stage,
      fileName,
      fileType,
      fileSize,
      s3Key,
      s3Url,
      filePath,
      source,
    } = req.body || {};

    const allowed = ["machining", "packaging", "shipping", "tracking"];
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!allowed.includes(String(stage || "").trim())) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 stage 입니다.",
      });
    }
    if (!fileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const normalizedStage = String(stage || "").trim();
    const normalizedSource =
      String(source || "manual").trim() === "worker" ? "worker" : "manual";

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.stageFiles = request.caseInfos.stageFiles || {};
    ensureReviewByStageDefaults(request);

    request.caseInfos.stageFiles[normalizedStage] = {
      fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      source: normalizedSource,
      uploadedBy: req.user?._id,
      uploadedAt: new Date(),
    };

    request.caseInfos.reviewByStage[normalizedStage] = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };

    await request.save();

    return res.status(200).json({
      success: true,
      message: "파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 의뢰 목록 조회 (관리자용)
 * @route GET /api/requests/all
 */
export async function getAllRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 필터링 파라미터
    const role = req.user?.role;
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 제조사: 본인에게 배정되었거나 미배정된 의뢰 + 취소 제외
    if (role === "manufacturer") {
      filter = {
        $and: [
          filter,
          { status: { $ne: "취소" } },
          {
            $or: [
              { manufacturer: req.user._id },
              { manufacturer: null },
              { manufacturer: { $exists: false } },
            ],
          },
        ],
      };
    }

    // 개발 환경 + MOCK_DEV_TOKEN 인 경우, 기존 시드 데이터 확인을 위해
    // requestor 필터를 제거하고 나머지 필터만 적용한다.
    const authHeader = req.headers.authorization || "";
    const isMockDevToken =
      process.env.NODE_ENV !== "production" &&
      authHeader === "Bearer MOCK_DEV_TOKEN";

    if (isMockDevToken) {
      // requestor 필터가 있다면 제거 (현재 코드에서는 위에서 requestor를 설정하지 않지만, 혹시 모를 로직에 대비)
      const { requestor, ...rest } = filter;
      filter = rest;
    }

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    const rawRequests = await Request.find(filter)
      .select("-messages")
      .populate("requestor", "name email organization")
      .populate("deliveryInfoRef")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const now = new Date();
    const requests = await Promise.all(
      rawRequests.map(async (r) => {
        const shippingPriority = await computeShippingPriority({
          request: r,
          now,
        });
        return { ...r, shippingPriority };
      }),
    );

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 의뢰 목록 조회 (의뢰자용)
 * @route GET /api/requests/my
 */
export async function getMyRequests(req, res) {
  try {
    // 페이지네이션 파라미터
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 기본 필터: 로그인한 의뢰자 소속 기공소(조직) 기준
    const filter = await buildRequestorOrgScopeFilter(req);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.implantType) filter.implantType = req.query.implantType;

    // 정렬 파라미터
    const sort = {};
    if (req.query.sortBy) {
      const sortField = req.query.sortBy;
      const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
      sort[sortField] = sortOrder;
    } else {
      sort.createdAt = -1; // 기본 정렬: 최신순
    }

    // 의뢰 조회
    const rawRequests = await Request.find(filter)
      .select("-messages -statusHistory") // 상세 내역 조회 시 불필요한 큰 필드 제외
      .populate("requestor", "name email organization organizationId")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = rawRequests;

    // 전체 의뢰 수
    const total = await Request.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상세 조회
 * @route GET /api/requests/:id
 */
export async function getRequestById(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate(
        "requestor",
        "name email phoneNumber organization organizationId role",
      );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 조회 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 접근할 권한이 없습니다.",
      });
    }

    const normalized = await normalizeRequestForResponse(request);
    res.status(200).json({
      success: true,
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 수정
 * @route PUT /api/requests/:id
 */
export async function updateRequest(req, res) {
  try {
    const requestId = req.params.id;
    const updateData = req.body;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId)
      .select("-messages")
      .populate("requestor", "organizationId");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 수정 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";
    const camApproved =
      request.caseInfos?.reviewByStage?.cam?.status === "APPROVED";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 수정할 권한이 없습니다.",
      });
    }

    // 수정 불가능한 필드 제거
    delete updateData.requestId;
    delete updateData.requestor;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // CAM 승인 후 임플란트 정보 수정 차단 (관리자 제외)
    if (!isAdmin && camApproved && updateData.caseInfos) {
      return res.status(400).json({
        success: false,
        message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
      });
    }

    // 의뢰 상태별 수정 가능 필드 제한 (비관리자)
    let caseInfosAllowed = true;
    if (!isAdmin) {
      const currentStatus = String(request.status || "");
      const stageStatus = String(request.manufacturerStage || "");

      // CAM 승인 이후(또는 생산/발송/추적 단계)는 caseInfos 수정 전면 차단
      const afterCam =
        camApproved ||
        ["생산", "발송", "추적관리"].includes(currentStatus) ||
        ["생산", "발송", "추적관리"].includes(stageStatus) ||
        (currentStatus === "CAM" && camApproved);

      if (afterCam) {
        const allowedTopLevelFields = [
          "messages",
          "patientName",
          "patientAge",
          "patientGender",
        ];
        Object.keys(updateData).forEach((key) => {
          if (key !== "caseInfos" && !allowedTopLevelFields.includes(key)) {
            delete updateData[key];
          }
        });
        if (updateData.caseInfos) {
          return res.status(400).json({
            success: false,
            message: "CAM 승인 후 임플란트 정보는 수정할 수 없습니다.",
          });
        }
        caseInfosAllowed = false;
      } else if (currentStatus === "의뢰") {
        // 제한 없음
      } else if (currentStatus === "CAM") {
        // CAM 승인 전: 제한 없음 (caseInfos 허용)
      }
    }

    // caseInfos 정규화 (허용되는 단계에서만)
    if (
      caseInfosAllowed &&
      updateData &&
      updateData.caseInfos &&
      typeof updateData.caseInfos === "object"
    ) {
      if (
        typeof updateData.caseInfos.connectionType === "string" &&
        !updateData.caseInfos.implantType
      ) {
        updateData.caseInfos.implantType = updateData.caseInfos.connectionType;
      }
      delete updateData.caseInfos.connectionType;

      updateData.caseInfos = await normalizeCaseInfosImplantFields(
        updateData.caseInfos,
      );
    } else if (!caseInfosAllowed && updateData?.caseInfos) {
      // 허용되지 않는 경우 caseInfos 삭제
      delete updateData.caseInfos;
    }

    // 의뢰 수정
    const updatedRequest = await Request.findById(requestId);
    if (updatedRequest) {
      Object.assign(updatedRequest, updateData);
      await updatedRequest.save();
    }

    const normalized = await normalizeRequestForResponse(updatedRequest);

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 수정되었습니다.",
      data: normalized,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 상태 변경
 * @route PATCH /api/requests/:id/status
 */
export async function updateRequestStatus(req, res) {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    // 상태 유효성 검사 (새 워크플로우)
    const validStatuses = ["의뢰", "CAM", "생산", "발송", "추적관리", "취소"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId).populate(
      "requestor",
      "organizationId",
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인 (의뢰자, 관리자만 상태 변경 가능)
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰의 상태를 변경할 권한이 없습니다.",
      });
    }

    // 상태 변경 권한 확인
    if (status === "취소" && !isRequestor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "의뢰자 또는 관리자만 의뢰를 취소할 수 있습니다.",
      });
    }

    // 취소는 의뢰 또는 CAM 상태에서만 가능 (생산 단계부터는 취소 불가)
    if (status === "취소") {
      const currentStatus = String(request.status || "").trim();
      const allowedCancelStatuses = ["의뢰", "의뢰접수", "CAM", "가공전"];
      if (!allowedCancelStatuses.includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          message:
            "의뢰 또는 CAM 단계에서만 취소할 수 있습니다. 생산 단계부터는 취소가 불가능합니다.",
        });
      }
    }

    // 의뢰 상태 변경 (status2 동기화 포함)
    applyStatusMapping(request, status);

    // 신속 배송이 출고(배송중)로 전환되면, 그동안 쌓인 묶음(일반) 배송대기 건도 함께 출고 처리
    if (status === "배송중" && request.shippingMode === "express") {
      const groupFilter = request.requestorOrganizationId
        ? { requestorOrganizationId: request.requestorOrganizationId }
        : request.requestor?.organizationId
          ? { requestorOrganizationId: request.requestor.organizationId }
          : { requestor: request.requestor };
      await Request.updateMany(
        {
          ...groupFilter,
          status: "배송대기",
          shippingMode: "normal",
          _id: { $ne: request._id },
        },
        {
          $set: {
            status: "배송중",
            status2: "중",
            manufacturerStage: "발송",
          },
        },
      );
    }

    await request.save();

    // 취소 시 크레딧 환불(차감 SPEND가 있는 경우에만)
    if (status === "취소") {
      const organizationId =
        request.requestorOrganizationId || request.requestor?.organizationId;

      if (organizationId) {
        const spendRows = await CreditLedger.find({
          organizationId,
          type: "SPEND",
          refType: "REQUEST",
          refId: request._id,
        })
          .select({ amount: 1 })
          .lean();

        const totalSpend = (spendRows || []).reduce((acc, r) => {
          const n = Number(r?.amount || 0);
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);

        const refundAmount = Math.abs(totalSpend);
        if (refundAmount > 0) {
          const uniqueKey = `request:${String(request._id)}:cancel_refund`;
          await CreditLedger.updateOne(
            { uniqueKey },
            {
              $setOnInsert: {
                organizationId,
                userId: req.user?._id || null,
                type: "REFUND",
                amount: refundAmount,
                refType: "REQUEST",
                refId: request._id,
                uniqueKey,
              },
            },
            { upsert: true },
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "의뢰 상태가 성공적으로 변경되었습니다.",
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: 의뢰 원본 STL 다운로드 URL 생성
 * @route GET /api/requests/:id/original-file-url
 */
export async function getOriginalFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사 또는 관리자만 접근
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.file?.s3Key;
    const fileName =
      request?.caseInfos?.file?.filePath ||
      request?.caseInfos?.file?.originalName ||
      "download.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "원본 STL 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "원본 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: CAM 결과 STL 다운로드 URL 생성
 * @route GET /api/requests/:id/cam-file-url
 */
export async function getCamFileUrl(req, res) {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id).lean();
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    // 제조사 또는 관리자만 접근
    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.camFile?.s3Key;
    const fileName =
      request?.caseInfos?.camFile?.fileName ||
      request?.caseInfos?.camFile?.originalName ||
      "cam-output.stl";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "CAM STL 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사/관리자: CAM 결과 업로드 메타 저장 및 상태 가공후 전환
 * @route POST /api/requests/:id/cam-file
 * body: { fileName, fileType, fileSize, s3Key, s3Url }
 */
export async function saveCamFileAndCompleteCam(req, res) {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, s3Key, s3Url, filePath } = req.body;

    if (!fileName || !s3Key || !s3Url) {
      throw new ApiError(400, "필수 파일 정보가 없습니다.");
    }

    const request = await Request.findById(id);
    if (!request) {
      throw new ApiError(404, "의뢰를 찾을 수 없습니다.");
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.cam = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.camFile = {
      fileName,
      fileType,
      fileSize,
      filePath: filePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 업로드 시 공정 전환은 하지 않고, 기존 단계 유지 (수동 승인 버튼 클릭 시에만 전환)
    // request.manufacturerStage = "CAM";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "CAM 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
/**
 * 제조사/관리자: CAM 결과 파일 제거 및 상태 가공전으로 롤백
 * @route DELETE /api/requests/:id/cam-file
 */
export async function deleteCamFileAndRollback(req, res) {
  try {
    const { id } = req.params;
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    // 롤백 전용 모드: 파일/정보 삭제 없이 공정 단계만 변경
    if (rollbackOnly) {
      ensureReviewByStageDefaults(request);
      request.caseInfos.reviewByStage.cam = {
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      request.manufacturerStage = "의뢰";
      await request.save();

      return res.status(200).json({
        success: true,
        data: await normalizeRequestForResponse(request),
      });
    }

    // camFile 제거, 상태 롤백
    request.caseInfos = request.caseInfos || {};
    request.caseInfos.camFile = undefined;
    request.status = "의뢰";
    request.status2 = "없음";
    request.lotNumber = request.lotNumber || {};
    request.lotNumber.part = undefined;
    request.lotNumber.final = undefined;
    request.lotNumber.material = "";
    request.manufacturerStage = "의뢰";

    await request.save();

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CAM 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getNcFileUrl(req, res) {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "다운로드 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    const fileName =
      request?.caseInfos?.ncFile?.fileName ||
      request?.caseInfos?.ncFile?.originalName ||
      "program.nc";
    if (!s3Key) {
      return res.status(404).json({
        success: false,
        message: "NC 파일 정보가 없습니다.",
      });
    }

    const disposition = `attachment; filename="${encodeURIComponent(
      fileName,
    )}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

    const url = await s3Utils.getSignedUrl(s3Key, 900, {
      responseDisposition: disposition,
    });

    return res.status(200).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 URL 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function saveNcFileAndMoveToMachining(req, res) {
  try {
    const { id } = req.params;
    const { fileName, fileType, fileSize, s3Key, s3Url, filePath } = req.body;
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }
    if (!fileName || !s3Key || !s3Url) {
      return res
        .status(400)
        .json({ success: false, message: "필수 파일 정보가 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "업로드 권한이 없습니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    let resolvedBridgePath = String(filePath || "").trim();
    if (!resolvedBridgePath && s3Key) {
      try {
        const pushed = await uploadNcToBridgeStore({
          requestId: request.requestId,
          s3Key,
          fileName,
        });
        if (pushed.ok && pushed.path) {
          resolvedBridgePath = String(pushed.path);
        } else if (pushed.reason) {
          console.warn(
            "[saveNcFileAndMoveToMachining] bridge-store push skipped",
            {
              requestId: request.requestId,
              reason: pushed.reason,
            },
          );
        }
      } catch (e) {
        console.warn(
          "[saveNcFileAndMoveToMachining] bridge-store push failed",
          {
            requestId: request.requestId,
            error: String(e?.message || e),
          },
        );
      }
    }

    const normalize = (name) => {
      try {
        return String(name || "")
          .trim()
          .normalize("NFC")
          .toLowerCase();
      } catch {
        return String(name || "")
          .trim()
          .toLowerCase();
      }
    };

    const getBaseName = (n) => {
      let s = String(n || "").trim();
      if (!s) return "";
      // .cam.stl, .stl, .nc 등 모든 확장자 제거
      // 가장 마지막 점부터 제거하는 것이 아니라, 알려진 확장자들을 순차적으로 제거
      s = s.replace(/\.cam\.stl$/i, "");
      s = s.replace(/\.stl$/i, "");
      s = s.replace(/\.nc$/i, "");
      return s;
    };

    const originalBase = getBaseName(
      request.caseInfos?.file?.fileName ||
        request.caseInfos?.file?.originalName,
    );
    const camBase = getBaseName(
      request.caseInfos?.camFile?.fileName ||
        request.caseInfos?.camFile?.originalName,
    );

    const originalName =
      request.caseInfos?.camFile?.fileName ||
      request.caseInfos?.camFile?.originalName ||
      request.caseInfos?.file?.fileName ||
      request.caseInfos?.file?.originalName ||
      "";

    const lowerName = normalize(fileName);
    const uploadedBase = getBaseName(lowerName);

    if (!lowerName.endsWith(".nc")) {
      return res.status(400).json({
        success: false,
        message: "NC 파일(.nc)만 업로드할 수 있습니다.",
      });
    }

    // 파일명 매칭 검사 (자동 매칭 드롭 시에만 엄격하게 적용하기 위해,
    // 여기서는 최소한의 검증만 수행하거나 경고 메시지 정도로 완화 가능)
    const matchesOriginal =
      originalBase && normalize(originalBase) === normalize(uploadedBase);
    const matchesCam =
      camBase && normalize(camBase) === normalize(uploadedBase);

    // 상세 페이지에서 직접 업로드하는 경우(파일명이 program.nc 등일 수 있음)를 위해
    // 매칭 실패 시에도 업로드는 허용하되, 가급적 매칭을 권장
    // 단, 아예 다른 환자의 파일이 올라가는 것을 방지하기 위해 최소한의 식별자가 있다면 체크하는 것이 좋으나
    // 현재는 사용자 편의를 위해 매칭 실패 시에도 저장을 허용하도록 수정합니다.

    const finalNcName = lowerName;

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
    request.caseInfos.reviewByStage.machining = {
      status: "PENDING",
      updatedAt: new Date(),
      updatedBy: req.user?._id,
      reason: "",
    };
    request.caseInfos.ncFile = {
      fileName: finalNcName,
      originalName: originalName || fileName,
      fileType,
      fileSize,
      filePath: resolvedBridgePath || "",
      s3Key: s3Key || "",
      s3Url: s3Url || "",
      uploadedAt: new Date(),
    };

    // 업로드 시 공정 전환은 하지 않고, 생산(검토) 대상으로만 전환
    request.manufacturerStage = "생산";

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 저장되었습니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function deleteNcFileAndRollbackCam(req, res) {
  try {
    const { id } = req.params;
    const rollbackOnly =
      String(req.query.rollbackOnly || "").trim() === "1" ||
      String(req.query.rollbackOnly || "")
        .trim()
        .toLowerCase() === "true";
    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 의뢰 ID입니다." });
    }

    const request = await Request.findById(id);
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    }

    if (req.user.role !== "manufacturer" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "삭제 권한이 없습니다." });
    }

    const s3Key = request?.caseInfos?.ncFile?.s3Key;
    if (s3Key) {
      try {
        await deleteFileFromS3(s3Key);
      } catch (e) {
        console.warn("delete nc file s3 failed", e);
      }
    }

    const bridgePath = String(
      request?.caseInfos?.ncFile?.filePath || "",
    ).trim();
    if (bridgePath && BRIDGE_BASE) {
      try {
        await fetch(
          `${BRIDGE_BASE}/api/bridge-store/file?path=${encodeURIComponent(
            bridgePath,
          )}`,
          { method: "DELETE", headers: withBridgeHeaders() },
        );
      } catch (e) {
        console.warn("delete nc file bridge-store failed", e);
      }
    }

    request.caseInfos = request.caseInfos || {};
    request.caseInfos.ncFile = undefined;
    if (request.caseInfos.reviewByStage?.machining) {
      request.caseInfos.reviewByStage.machining.status = "PENDING";
      request.caseInfos.reviewByStage.machining.updatedAt = new Date();
      request.caseInfos.reviewByStage.machining.updatedBy = req.user?._id;
      request.caseInfos.reviewByStage.machining.reason = "";
    }

    // 제조사 공정: 가공(중) -> CAM(가공/후) 또는 의뢰(의뢰접수)
    const isRollbackToRequest = req.query.nextStage === "request";
    if (isRollbackToRequest) {
      request.status = "의뢰";
      request.status2 = "없음";
      request.manufacturerStage = "의뢰";
    } else {
      request.status = "CAM";
      request.status2 = "없음";
      request.manufacturerStage = "CAM";
    }

    await request.save();

    return res.status(200).json({
      success: true,
      message: "NC 파일이 삭제되고 CAM 단계로 되돌아갑니다.",
      data: await normalizeRequestForResponse(request),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "NC 파일 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰 삭제 (관리자 또는 의뢰자 본인만 가능)
 * @route DELETE /api/requests/:id
 */
export async function deleteRequest(req, res) {
  try {
    const requestId = req.params.id;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    // 의뢰 조회
    const request = await Request.findById(requestId).populate(
      "requestor",
      "organizationId",
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 권한 검증: 관리자이거나 같은 기공소(조직) 의뢰자만 삭제 가능
    const isRequestor = await canAccessRequestAsRequestor(req, request);
    if (req.user.role !== "admin" && !isRequestor) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 삭제할 권한이 없습니다.",
      });
    }

    // 단계 검증: 관리자면 생산(machining) 단계 이전까지, 의뢰자면 의뢰/CAM 단계까지만 허용
    const currentStatus = String(request.status || "");
    const isAdmin = req.user.role === "admin";

    const deletableStatuses = isAdmin
      ? ["의뢰", "CAM", "생산"]
      : ["의뢰", "CAM"];

    if (!deletableStatuses.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: isAdmin
          ? "발송 단계 이후의 의뢰는 삭제할 수 없습니다."
          : "생산 단계 이후의 의뢰는 직접 삭제할 수 없습니다. 고객센터에 문의해주세요.",
      });
    }

    // 의뢰 취소 처리 (상태를 '취소'로 변경)
    applyStatusMapping(request, "취소");
    await request.save();

    res.status(200).json({
      success: true,
      message: "의뢰가 성공적으로 삭제되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
