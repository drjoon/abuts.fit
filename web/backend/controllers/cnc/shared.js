import CncMachine from "../../models/cncMachine.model.js";
import Machine from "../../models/machine.model.js";
import Request from "../../models/request.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import ManufacturerCreditLedger from "../../models/manufacturerCreditLedger.model.js";
import User from "../../models/user.model.js";
import {
  getPresignedGetUrl,
  getPresignedPutUrl,
} from "../../utils/s3.utils.js";
import multer from "multer";
import {
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "../../utils/krBusinessDays.js";
import {
  getAllProductionQueues,
  recalculateQueueOnMaterialChange,
} from "../../controllers/requests/production.utils.js";

export const CAM_RETRY_BATCH_LIMIT = Number(
  process.env.CAM_RETRY_BATCH_LIMIT || 30,
);

export const BRIDGE_BASE = process.env.BRIDGE_BASE || "http://localhost:8002";
export const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

let warnedMissingBridgeSecret = false;

export const toNumberOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function makeSafeFileStem(input) {
  const raw = String(input || "")
    .trim()
    .normalize("NFC")
    .replace(/\.nc$/i, "")
    .replace(/\.[a-z0-9]{1,6}$/i, "");
  const safe = raw
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
  return safe;
}

export function makeCncUploadFilePath({ machineId, originalFilename }) {
  const mid = String(machineId || "").trim();
  const stem = makeSafeFileStem(originalFilename);
  const rand = Math.random().toString(36).slice(2, 10);
  const base = stem ? `${mid}_${stem}_${rand}` : `${mid}_${Date.now()}_${rand}`;
  return base;
}

export function normalizeOriginalFilename(name) {
  const raw = String(name || "").trim();
  if (!raw) return raw;

  try {
    const fixed = Buffer.from(raw, "latin1").toString("utf8").trim();
    if (fixed && fixed !== raw) {
      const hasHangul = /[\uAC00-\uD7AF]/.test(raw);
      const fixedHasHangul = /[\uAC00-\uD7AF]/.test(fixed);

      const hasReplacement = raw.includes("�");
      const fixedHasReplacement = fixed.includes("�");

      const looksMojibake = /Ã.|Â.|â€|ì|ë|ê|í|ï|ð|ñ|ò|ó|ô|õ|ö|ø|ù|ú|û|ü/i.test(
        raw,
      );

      // 케이스:
      // - raw가 깨져 보이고(fallback 문자/모지박), fixed가 한글을 복구했다면 fixed 사용
      // - raw가 이미 한글이면(정상) fixed로 바꾸지 않는다
      if (
        !hasHangul &&
        (fixedHasHangul ||
          (hasReplacement && !fixedHasReplacement) ||
          looksMojibake)
      ) {
        return fixed;
      }
    }
  } catch {
    // ignore
  }
  return raw;
}

export function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  } else if (!warnedMissingBridgeSecret) {
    warnedMissingBridgeSecret = true;
    console.warn(
      "[Bridge] BRIDGE_SHARED_SECRET is not configured. Bridge requests will be sent without X-Bridge-Secret.",
    );
  }
  return { ...base, ...extra };
}

export const cncUploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export function runMulter(mw, req, res) {
  return new Promise((resolve, reject) => {
    mw(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function callBridgeJson({
  url,
  method = "POST",
  body,
  timeoutMs = 30000,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => ({}));
    return { resp, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getOrCreateCncMachine(machineId, extraSet = {}) {
  const mid = String(machineId || "").trim();
  if (!mid) return null;

  const $setOnInsert = {
    machineId: mid,
    name: mid,
    status: "active",
    currentMaterial: {
      diameter: 8,
      diameterGroup: "8",
      remainingLength: 0,
    },
  };

  return CncMachine.findOneAndUpdate(
    { machineId: mid },
    {
      $setOnInsert,
      ...(extraSet && Object.keys(extraSet).length > 0
        ? { $set: extraSet }
        : {}),
    },
    { new: true, upsert: true },
  );
}

export function normalizeCncProgramFileName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const m = upper.match(/^O(\d{1,5})(?:\.NC)?$/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 0) {
      return `O${String(n).padStart(4, "0")}.nc`;
    }
  }
  return raw;
}

export function sanitizeS3KeySegment(name) {
  const raw = String(name || "")
    .trim()
    .normalize("NFC");
  if (!raw) return "";
  return raw.replace(/[\\/]/g, "_");
}

export function parseProgramNoFromFileName(fileName) {
  const upper = String(fileName || "")
    .toUpperCase()
    .trim();
  const m = upper.match(/^O(\d{1,5})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function saveBridgeQueueSnapshot(machineId, jobs) {
  const mid = String(machineId || "").trim();
  if (!mid) return null;

  const safeJobs0 = Array.isArray(jobs)
    ? jobs
        .map((j) => {
          if (!j || typeof j !== "object") return null;
          return {
            id: j.id != null ? String(j.id).trim() : "",
            kind: j.kind != null ? String(j.kind).trim() : "",
            fileName: j.fileName != null ? String(j.fileName).trim() : "",
            originalFileName:
              j.originalFileName != null
                ? String(j.originalFileName).trim()
                : "",
            bridgePath: j.bridgePath != null ? String(j.bridgePath).trim() : "",
            s3Key: j.s3Key != null ? String(j.s3Key).trim() : "",
            s3Bucket: j.s3Bucket != null ? String(j.s3Bucket).trim() : "",
            fileSize:
              typeof j.fileSize === "number" && Number.isFinite(j.fileSize)
                ? j.fileSize
                : null,
            contentType:
              j.contentType != null ? String(j.contentType).trim() : "",
            requestId: j.requestId != null ? String(j.requestId).trim() : "",
            priority:
              typeof j.priority === "number" && Number.isFinite(j.priority)
                ? j.priority
                : null,
            programNo:
              typeof j.programNo === "number" && Number.isFinite(j.programNo)
                ? j.programNo
                : null,
            programName:
              j.programName != null ? String(j.programName).trim() : "",
            qty:
              typeof j.qty === "number" && Number.isFinite(j.qty)
                ? j.qty
                : null,
            createdAtUtc: j.createdAtUtc ? new Date(j.createdAtUtc) : null,
            source: j.source != null ? String(j.source).trim() : "",
            paused: j.paused === true,
            allowAutoStart:
              j.allowAutoStart === true ||
              ((typeof j.priority === "number" ? j.priority : null) === 1 &&
                j.paused !== true),
          };
        })
        .filter(Boolean)
    : [];

  // 우선순위(장비=1, 가공=2) 기반으로 stable ordering
  const equipment = [];
  const machining = [];
  for (const j of safeJobs0) {
    const p = typeof j?.priority === "number" ? j.priority : 2;
    if (p === 1) equipment.push(j);
    else machining.push(j);
  }
  const safeJobs = equipment.concat(machining);

  const now = new Date();
  const updated = await getOrCreateCncMachine(mid, {
    bridgeQueueSnapshot: {
      jobs: safeJobs,
      updatedAt: now,
    },
    bridgeQueueSyncedAt: now,
  });

  try {
    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
      mid,
    )}/replace`;
    await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jobs: safeJobs }),
    });
  } catch {
    // ignore
  }

  return updated;
}

export async function getDbBridgeQueueSnapshot(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return { jobs: [], updatedAt: null, syncedAt: null };
  const machine = await CncMachine.findOne({ machineId: mid })
    .select("bridgeQueueSnapshot bridgeQueueSyncedAt")
    .lean();
  const snapshot = machine?.bridgeQueueSnapshot || null;
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];

  // requestId -> 원본 파일명 매핑 (Request SSOT)
  const requestIdToOriginal = new Map();
  try {
    const rids = Array.from(
      new Set(
        jobs.map((j) => String(j?.requestId || "").trim()).filter((v) => !!v),
      ),
    );
    if (rids.length > 0) {
      const reqs = await Request.find({ requestId: { $in: rids } })
        .select("requestId caseInfos.ncFile.originalName")
        .lean();
      for (const r of reqs) {
        const rid = String(r?.requestId || "").trim();
        const on = String(r?.caseInfos?.ncFile?.originalName || "").trim();
        if (rid && on) requestIdToOriginal.set(rid, on);
      }
    }
  } catch {
    // ignore
  }

  // 각 job에 originalFileName 추가 (Request SSOT)
  const jobsWithMeta = jobs.map((job) => {
    const rid = String(job?.requestId || "").trim();
    const fromRequest = rid ? requestIdToOriginal.get(rid) : null;
    return {
      ...job,
      ...(job?.originalFileName
        ? { originalFileName: job.originalFileName }
        : fromRequest
          ? { originalFileName: fromRequest }
          : {}),
    };
  });

  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt) : null;
  const syncedAt = machine?.bridgeQueueSyncedAt
    ? new Date(machine.bridgeQueueSyncedAt)
    : null;
  return { jobs: jobsWithMeta, updatedAt, syncedAt };
}

export async function fetchBridgeQueueFromBridge(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) {
    return { ok: false, status: 400, error: "machineId is required", jobs: [] };
  }

  const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
    mid,
  )}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: withBridgeHeaders(),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body?.success === false) {
    return {
      ok: false,
      status: resp.status,
      error:
        body?.message ||
        body?.error ||
        "브리지 예약 큐 조회 중 오류가 발생했습니다.",
      jobs: [],
    };
  }
  const list = Array.isArray(body?.data) ? body.data : body?.data || [];
  const jobs = Array.isArray(list) ? list : [];
  return { ok: true, status: resp.status, error: null, jobs };
}

export async function rollbackRequestToCamByRequestId(requestId) {
  const rid = String(requestId || "").trim();
  if (!rid) return null;

  const request = await Request.findOne({ requestId: rid });
  if (!request) return null;

  const stage = String(request.manufacturerStage || "").trim();
  const rollbackStages = ["가공", "세척.포장", "세척.패킹"];
  if (!rollbackStages.includes(stage)) return request;

  try {
    const orgId =
      request.requestorOrganizationId || request.requestor?.organizationId;
    if (orgId) {
      const amount = Number(request.price?.amount || 0);
      if (amount > 0) {
        const spendKey = `request:${String(request._id)}:cam_approve_spend`;
        const refundKey = `request:${String(request._id)}:cam_approve_refund`;

        const spend = await CreditLedger.findOne({
          uniqueKey: spendKey,
          type: "SPEND",
        }).lean();

        if (spend) {
          const existingRefund = await CreditLedger.findOne({
            uniqueKey: refundKey,
          }).lean();

          if (!existingRefund) {
            await CreditLedger.create({
              organizationId: orgId,
              userId: null,
              type: "REFUND",
              amount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: refundKey,
            });
          }
        }
      }
    }

    // 제조사 리펀드 (건당 6,500) - 조직 단위
    try {
      const manufacturerId = request?.manufacturer;
      if (manufacturerId) {
        const m = await User.findById(manufacturerId)
          .select({ organization: 1 })
          .lean();
        const manufacturerOrganization = String(m?.organization || "").trim();
        if (manufacturerOrganization) {
          const refundKey = `request:${String(request._id)}:manufacturer_refund_request`;
          await ManufacturerCreditLedger.updateOne(
            { uniqueKey: refundKey },
            {
              $setOnInsert: {
                manufacturerOrganization,
                manufacturerId,
                type: "REFUND",
                amount: -6500,
                refType: "REQUEST",
                refId: request._id,
                uniqueKey: refundKey,
                occurredAt: new Date(),
              },
            },
            { upsert: true },
          );
        }
      }
    } catch (e) {
      console.error(
        "rollbackRequestToCamByRequestId manufacturer refund error:",
        e,
      );
    }
  } catch (e) {
    console.error("rollbackRequestToCamByRequestId credit refund error:", e);
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};
  request.caseInfos.rollbackCounts = request.caseInfos.rollbackCounts || {};
  request.caseInfos.rollbackCounts.cam =
    Number(request.caseInfos.rollbackCounts.cam || 0) + 1;

  const now = new Date();

  const camReview = request.caseInfos.reviewByStage.cam || {};
  request.caseInfos.reviewByStage.cam = {
    status: "PENDING",
    updatedAt: now,
    updatedBy: null,
    reason: "",
    ...camReview,
  };

  const machiningReview = request.caseInfos.reviewByStage.machining || {};
  request.caseInfos.reviewByStage.machining = {
    status: "PENDING",
    updatedAt: now,
    updatedBy: null,
    reason: "",
    ...machiningReview,
  };

  request.manufacturerStage = "CAM";

  request.productionSchedule = request.productionSchedule || {};
  request.productionSchedule.actualMachiningStart = null;
  request.productionSchedule.actualMachiningComplete = null;
  request.productionSchedule.assignedMachine = null;
  request.productionSchedule.queuePosition = null;
  request.assignedMachine = null;

  await request.save();
  return request;
}

export async function getMachinesHandler(req, res) {
  try {
    const machines = await CncMachine.find({ status: "active" }).sort({
      machineId: 1,
    });

    res.status(200).json({
      success: true,
      data: machines,
    });
  } catch (error) {
    console.error("Error in getMachines:", error);
    res.status(500).json({
      success: false,
      message: "장비 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getProductionQueuesHandler(req, res) {
  try {
    const requests = await Request.find({
      manufacturerStage: { $in: ["의뢰", "CAM", "가공"] },
    })
      .select(
        "requestId manufacturerStage productionSchedule caseInfos timeline",
      )
      .populate({
        path: "productionSchedule.machiningRecord",
        select:
          "status startedAt completedAt durationSeconds elapsedSeconds lastTickAt machineId jobId",
      });

    const queues = getAllProductionQueues(requests);

    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((req, index) => ({
        requestId: req.requestId,
        status: req.manufacturerStage || req.status,
        queuePosition:
          req.productionSchedule?.queuePosition != null
            ? req.productionSchedule.queuePosition
            : index + 1,
        machiningQty:
          req.productionSchedule?.machiningQty != null
            ? req.productionSchedule.machiningQty
            : 1,
        estimatedShipYmd: req.timeline?.estimatedShipYmd || null,
        scheduledShipPickup: req.productionSchedule?.scheduledShipPickup,
        diameter: req.productionSchedule?.diameter,
        diameterGroup: req.productionSchedule?.diameterGroup,
        ncFile: req.caseInfos?.ncFile
          ? {
              fileName: req.caseInfos.ncFile.fileName,
              filePath: req.caseInfos.ncFile.filePath,
              s3Key: req.caseInfos.ncFile.s3Key,
              s3Bucket: req.caseInfos.ncFile.s3Bucket,
            }
          : null,
        ncPreload: req.productionSchedule?.ncPreload
          ? {
              status: req.productionSchedule.ncPreload.status,
              machineId: req.productionSchedule.ncPreload.machineId,
              updatedAt: req.productionSchedule.ncPreload.updatedAt,
              error: req.productionSchedule.ncPreload.error,
            }
          : null,
        machiningRecord: req.productionSchedule?.machiningRecord
          ? {
              status: req.productionSchedule.machiningRecord.status,
              startedAt: req.productionSchedule.machiningRecord.startedAt,
              completedAt: req.productionSchedule.machiningRecord.completedAt,
              durationSeconds:
                req.productionSchedule.machiningRecord.durationSeconds,
              elapsedSeconds:
                req.productionSchedule.machiningRecord.elapsedSeconds,
              lastTickAt: req.productionSchedule.machiningRecord.lastTickAt,
              machineId: req.productionSchedule.machiningRecord.machineId,
              jobId: req.productionSchedule.machiningRecord.jobId,
            }
          : null,
        clinicName: req.caseInfos?.clinicName,
        patientName: req.caseInfos?.patientName,
      }));
    }

    res.status(200).json({
      success: true,
      data: queues,
    });
  } catch (error) {
    console.error("Error in getProductionQueues:", error);
    res.status(500).json({
      success: false,
      message: "생산 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export {
  CncMachine,
  Machine,
  Request,
  CreditLedger,
  getPresignedGetUrl,
  getPresignedPutUrl,
  getTodayYmdInKst,
  isKoreanBusinessDay,
  recalculateQueueOnMaterialChange,
  getAllProductionQueues,
};
