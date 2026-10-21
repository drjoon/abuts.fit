// related files:
// - web/backend/services/lowFinishLineWatch.js
// - web/backend/models/lowFinishLineCase.model.js
// - web/backend/controllers/admin/lowFinishLineWatch.controller.js
// - web/backend/controllers/bg/bg.controller.js
//
// 짧은 커프(피니시라인 min_z < 1mm) 실의뢰를 모아, 50건 통과·실패 0이면 준비 경고를 끈다.
import Request from "../models/request.model.js";
import LowFinishLineCase from "../models/lowFinishLineCase.model.js";
import {
  LOW_FINISH_LINE_SUCCESS_TARGET,
  LOW_FINISH_LINE_Z_MM,
  deriveLowFinishLineStatus,
  isLowFinishLineMinZ,
  isLowFinishLineSample,
  isLowFinishLineWarningOn,
  lowFinishLineCaseLabel,
  resolveLowFinishLineStatus,
} from "./lowFinishLineWatch.js";

const CACHE_MS = 15_000;
const REQUEST_FIELDS =
  "requestId source requestCategory manufacturerStage rnd.unmachinableAt caseInfos.finishLine.min_z caseInfos.clinicName caseInfos.patientName caseInfos.tooth caseInfos.implantBrand caseInfos.implantType caseInfos.implantManufacturer";

let cache = { at: 0, value: null };

export function invalidateLowFinishLineWatchCache() {
  cache = { at: 0, value: null };
}

function publicCase(doc) {
  return {
    requestId: String(doc.requestId || ""),
    minZ: Number(doc.minZ),
    clinicName: String(doc.clinicName || ""),
    patientName: String(doc.patientName || ""),
    tooth: String(doc.tooth || ""),
    connection: String(doc.connection || ""),
    status: String(doc.status || "open"),
    verdict: String(doc.verdict || ""),
  };
}

async function reconcileAutoStatuses() {
  const rows = await LowFinishLineCase.find({ verdict: "" })
    .select("_id request status")
    .lean();
  if (!rows.length) return;

  const requests = await Request.find({
    _id: { $in: rows.map((row) => row.request) },
  })
    .select(REQUEST_FIELDS)
    .lean();
  const byId = new Map(requests.map((row) => [String(row._id), row]));
  const ops = [];
  const now = new Date();

  for (const row of rows) {
    const request = byId.get(String(row.request));
    if (!request) continue;
    const minZ = Number(request.caseInfos?.finishLine?.min_z);
    const next = !isLowFinishLineMinZ(minZ)
      ? "skipped"
      : deriveLowFinishLineStatus(request);
    if (next === row.status) continue;
    const label = lowFinishLineCaseLabel(request.caseInfos);
    ops.push({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            status: next,
            minZ: Number.isFinite(minZ) ? minZ : row.minZ,
            requestId: String(request.requestId || ""),
            ...label,
            resolvedAt: next === "success" || next === "failed" ? now : null,
          },
        },
      },
    });
  }

  if (ops.length) await LowFinishLineCase.bulkWrite(ops);
}

async function loadSummary() {
  await reconcileAutoStatuses();
  const grouped = await LowFinishLineCase.aggregate([
    { $match: { status: { $in: ["open", "success", "failed"] } } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const countOf = (status) =>
    grouped.find((row) => row._id === status)?.n || 0;
  const success = countOf("success");
  const failed = countOf("failed");
  const open = countOf("open");
  const cases = await LowFinishLineCase.find({
    status: { $in: ["failed", "open", "success"] },
  })
    .sort({ status: 1, updatedAt: -1 })
    .limit(40)
    .lean();

  return {
    thresholdMm: LOW_FINISH_LINE_Z_MM,
    target: LOW_FINISH_LINE_SUCCESS_TARGET,
    success,
    failed,
    open,
    warning: isLowFinishLineWarningOn({ success, failed }),
    cases: cases.map(publicCase),
  };
}

export async function getLowFinishLineWatch({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  const value = await loadSummary();
  cache = { at: Date.now(), value };
  return value;
}

/**
 * 피니시라인 min_z < 1mm 실의뢰를 명단에 넣거나 상태를 맞춘다.
 * 샘플·더미는 세지 않는다. 응답 뒤에서 호출한다.
 */
export async function noteLowFinishLineRequest(requestLike) {
  const request = requestLike && typeof requestLike === "object" ? requestLike : null;
  if (!request?._id) return null;
  if (isLowFinishLineSample(request)) return null;
  const minZ = Number(request.caseInfos?.finishLine?.min_z);
  if (!isLowFinishLineMinZ(minZ)) return null;

  const label = lowFinishLineCaseLabel(request.caseInfos);
  const existing = await LowFinishLineCase.findOne({ request: request._id })
    .select("verdict resolvedAt")
    .lean();
  const status = resolveLowFinishLineStatus(
    deriveLowFinishLineStatus(request),
    existing?.verdict,
  );
  const now = new Date();
  const resolvedAt =
    status === "success" || status === "failed"
      ? existing?.resolvedAt || now
      : null;

  await LowFinishLineCase.findOneAndUpdate(
    { request: request._id },
    {
      $set: {
        requestId: String(request.requestId || ""),
        minZ,
        ...label,
        status,
        resolvedAt,
      },
      $setOnInsert: {
        request: request._id,
        observedAt: now,
        verdict: "",
      },
    },
    { upsert: true },
  );
  invalidateLowFinishLineWatchCache();
  return status;
}

export async function setLowFinishLineVerdict(requestId, verdict) {
  const nextVerdict = verdict === "success" || verdict === "failed" ? verdict : "";
  if (verdict !== "success" && verdict !== "failed" && verdict !== "") {
    const error = new Error("판정은 통과, 실패, 해제만 가능합니다.");
    error.statusCode = 400;
    throw error;
  }

  const doc = await LowFinishLineCase.findOne({
    requestId: String(requestId || "").trim(),
  });
  if (!doc) {
    const error = new Error("짧은 커프 의뢰를 찾지 못했습니다.");
    error.statusCode = 404;
    throw error;
  }

  doc.verdict = nextVerdict;
  if (nextVerdict) {
    doc.status = nextVerdict;
    doc.resolvedAt = new Date();
  } else {
    const request = await Request.findById(doc.request).select(REQUEST_FIELDS).lean();
    const auto = request ? deriveLowFinishLineStatus(request) : "open";
    doc.status = auto === "skipped" ? "open" : auto;
    doc.resolvedAt =
      doc.status === "success" || doc.status === "failed" ? new Date() : null;
  }
  await doc.save();
  invalidateLowFinishLineWatchCache();
  return getLowFinishLineWatch({ fresh: true });
}
