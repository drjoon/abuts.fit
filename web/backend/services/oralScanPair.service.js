// 의뢰 저장 이후 — 바이트 기준 상악·하악 겹침, 보철·스캔 접점 마진.
// 응답은 기다리지 않는다. STL·PLY만 계산하고 실패는 로그만 남긴다.
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { resolvePerformingLabAnchorId } from "../utils/practiceTransferAutoMatchCore.js";
import { getObjectBufferFromS3 } from "../utils/s3.utils.js";
import { resolveStoredScanRole } from "../utils/oralScanRole.js";
import {
  alignJawsToBite,
  archRoleFromTooth,
  sampleMeshPoints,
  sampleProsthesisMargin,
} from "../utils/oralScanPairCore.js";
import {
  buildAiTrainingRecord,
  shouldIncludeInAiTraining,
} from "../utils/practiceTransferAiTraining.js";

const MAX_BYTES = 60 * 1024 * 1024;

const meshName = (row) => String(row?.file?.originalName || "").trim();

async function loadPoints(row) {
  const name = meshName(row);
  const key = String(row?.file?.s3Key || "").trim();
  if (!name || !key) return null;
  if (!/\.(stl|ply|obj)$/i.test(name)) return null;
  const size = Number(row?.file?.size || 0);
  if (size > MAX_BYTES) return null;
  const buffer = await getObjectBufferFromS3(key);
  if (!buffer || buffer.length > MAX_BYTES) return null;
  return sampleMeshPoints(buffer, name);
}

function fileByRole(files, role) {
  return (files || []).find((row) => {
    const stored = resolveStoredScanRole({
      originalName: row?.file?.originalName,
      scanRole: row?.scanRole,
      scanRoleSetBy: row?.scanRoleSetBy,
    });
    return stored.scanRole === role;
  });
}

const scanJobTails = new Map();

function enqueueScanJob(transferMongoId, job) {
  const id = String(transferMongoId || "").trim();
  if (!id) return;
  const prev = scanJobTails.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => job(id));
  const tracked = run.catch((err) => {
    console.warn("[oral-scan] prep failed", id, err?.message || err);
  });
  scanJobTails.set(
    id,
    tracked.finally(() => {
      if (scanJobTails.get(id) === tracked) scanJobTails.delete(id);
    }),
  );
}

async function writePracticeAiTraining(id) {
  const doc = await PracticeTransfer.findById(id)
    .select({
      files: 1,
      resultFiles: 1,
      scanAlignment: 1,
      autoMatch: 1,
      billing: 1,
      assigneeLabAnchorId: 1,
      targetLabAnchorId: 1,
    })
    .lean();
  if (!doc) return;
  const performerId = resolvePerformingLabAnchorId(doc);
  const performer = performerId
    ? await BusinessAnchor.findById(performerId)
        .select({ businessType: 1 })
        .lean()
    : null;
  if (!shouldIncludeInAiTraining(doc, performer)) {
    await PracticeTransfer.updateOne({ _id: id }, { $unset: { aiTraining: "" } });
    return;
  }
  const record = buildAiTrainingRecord(doc);
  await PracticeTransfer.updateOne({ _id: id }, { $set: { aiTraining: record } });
}

export function schedulePracticeScanAlignment(transferMongoId) {
  enqueueScanJob(transferMongoId, async (id) => {
    await computeScanAlignment(id);
    await writePracticeAiTraining(id);
  });
}

async function computeScanAlignment(id) {
  const doc = await PracticeTransfer.findById(id)
    .select({ files: 1 })
    .lean();
  if (!doc) return;
  const files = Array.isArray(doc.files) ? doc.files : [];
  const upper = fileByRole(files, "upper");
  const lower = fileByRole(files, "lower");
  const bite = fileByRole(files, "bite");
  if (!upper || !lower || !bite) {
    await PracticeTransfer.updateOne(
      { _id: id },
      {
        $set: {
          scanAlignment: {
            status: "unavailable",
            method: "",
            upperMatrix: null,
            lowerMatrix: null,
            residualUpperMm: null,
            residualLowerMm: null,
            computedAt: new Date(),
          },
        },
      },
    );
    return;
  }
  const [upperPts, lowerPts, bitePts] = await Promise.all([
    loadPoints(upper),
    loadPoints(lower),
    loadPoints(bite),
  ]);
  const aligned =
    upperPts && lowerPts && bitePts
      ? alignJawsToBite({ upper: upperPts, lower: lowerPts, bite: bitePts })
      : {
          status: "unavailable",
          method: "",
          upperMatrix: null,
          lowerMatrix: null,
          residualUpperMm: null,
          residualLowerMm: null,
        };
  await PracticeTransfer.updateOne(
    { _id: id },
    {
      $set: {
        scanAlignment: {
          ...aligned,
          computedAt: new Date(),
        },
      },
    },
  );
}

export function schedulePracticeProsthesisMargin(transferMongoId) {
  enqueueScanJob(transferMongoId, async (id) => {
    await computeMargins(id);
    await writePracticeAiTraining(id);
  });
}

/** 작업완료 후 — 정합, 마진, 학습 쌍. 응답은 기다리지 않는다. */
export function schedulePracticeAiTrainingPrep(transferMongoId) {
  enqueueScanJob(transferMongoId, async (id) => {
    await computeScanAlignment(id);
    await computeMargins(id);
    await writePracticeAiTraining(id);
  });
}

async function computeMargins(id) {
  const doc = await PracticeTransfer.findById(id)
    .select({ files: 1, resultFiles: 1 })
    .lean();
  if (!doc) return;
  const files = Array.isArray(doc.files) ? doc.files : [];
  const results = Array.isArray(doc.resultFiles) ? doc.resultFiles : [];
  if (!results.length) return;
  const scanCache = new Map();
  const loadRole = async (role) => {
    if (!role) return null;
    if (scanCache.has(role)) return scanCache.get(role);
    const row = fileByRole(files, role);
    const points = row ? await loadPoints(row) : null;
    scanCache.set(role, points);
    return points;
  };
  let changed = false;
  const next = [];
  for (const row of results) {
    const copy = {
      ...row,
      file: row?.file ? { ...row.file } : row?.file,
    };
    const existing = Array.isArray(copy.marginPoints) ? copy.marginPoints : [];
    if (existing.length >= 8 || !/\.(stl|ply|obj)$/i.test(meshName(copy))) {
      next.push(copy);
      continue;
    }
    const preferred = archRoleFromTooth(copy.tooth);
    const prosthesis = await loadPoints(copy);
    if (!prosthesis) {
      next.push(copy);
      continue;
    }
    const roles = preferred ? [preferred, preferred === "upper" ? "lower" : "upper"] : ["upper", "lower"];
    let best = [];
    let bestArch = "";
    for (const role of roles) {
      const scan = await loadRole(role);
      if (!scan) continue;
      const points = sampleProsthesisMargin(prosthesis, scan);
      if (points.length > best.length) {
        best = points;
        bestArch = role;
      }
      if (preferred && role === preferred && points.length >= 8) break;
    }
    if (best.length) {
      copy.marginPoints = best;
      copy.marginArch = bestArch;
      changed = true;
    }
    next.push(copy);
  }
  if (!changed) return;
  await PracticeTransfer.updateOne({ _id: id }, { $set: { resultFiles: next } });
}
