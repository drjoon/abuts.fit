// related files:
// - web/backend/models/systemSettings.model.js
// - web/backend/models/request.model.js
// - web/backend/modules/cnc/cncMachine.routes.js
// - web/backend/controllers/requests/production.utils.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/DummyMachiningModal.tsx
// change-log:
// - 2026-10-06: 더미 복사본은 원본 완료 상태를 비운다. 장비에 넣을 때만 Next Up.
// - 2026-10-02: 저장한 더미는 가공 단계 복사본으로 보관하고 대기열·카운터에서 뺀다.
// - 2026-10-02: 추천도 로트 검색과 같이 3개씩 다음 페이지를 넘긴다.
// - 2026-10-02: 더미 검색에 기공소명을 실어 보낸다.
// - 2026-10-02: 더미 후보는 가공 5분 이상만 남긴다.
// - 2026-10-02: 로트 없이도 직경별 가공이 가장 짧은 3개를 추천한다.
// - 2026-10-02: 더미 검색은 가공 시간이 짧은 순. 시간은 기록에서 읽는다.
// - 2026-10-02: 더미 검색은 3개씩 다음 페이지를 넘긴다.
// - 2026-10-02: 직경별 더미 제거(DELETE).
// - 2026-10-02: 더미 직경은 구간만 맞다. 8은 6 초과~8, 5.5는 6이다.
// - 2026-10-02: 직경별 더미 저장. 장비 확인 시 Next Up 맨 앞에 끼운다.
import Request from "../../models/request.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import MachiningRecord from "../../models/machiningRecord.model.js";
import User from "../../models/user.model.js";
import {
  EXCLUDE_UNMACHINABLE_FILTER,
  EXCLUDE_IDLE_DUMMY_SAMPLE_FILTER,
  inferCurrentMaterialDiameter,
  inferDiameterGroupFromValue,
  inferMaterialDiameterGroup,
  isMachiningInProgress,
  machineMaterialCoversMaxDiameter,
  normalizeDiameterGroupValue,
} from "./distribution.utils.js";
import { compareMachiningQueueOrder } from "../requests/production.utils.js";
import { pickFilledStlFileForClone } from "../../utils/filledStlFile.js";

const DIAMETER_GROUPS = ["6", "8", "10", "12", "14"];

const DUMMY_PRODUCT_SELECT = [
  "requestId",
  "lotNumber",
  "assignedMachine",
  "manufacturerStage",
  "source",
  "requestCategory",
  "createdAt",
  "rnd.unmachinableAt",
  "productionSchedule.assignedMachine",
  "productionSchedule.machiningRecord",
  "productionSchedule.machiningProgress.elapsedSeconds",
  "caseInfos.clinicName",
  "caseInfos.patientName",
  "caseInfos.tooth",
  "caseInfos.implantManufacturer",
  "caseInfos.implantBrand",
  "caseInfos.implantFamily",
  "caseInfos.implantType",
  "caseInfos.maxDiameter",
  "caseInfos.connectionDiameter",
  "caseInfos.totalLength",
  "caseInfos.stlFile",
  "caseInfos.camFile",
  "caseInfos.ncFile",
  "caseInfos.finishLine.points",
].join(" ");

const SEARCH_PAGE_SIZE = 3;
const MIN_MACHINING_SECONDS = 5 * 60;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveDurationSeconds(record, progress) {
  const duration = Number(record?.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) return Math.floor(duration);
  const elapsed = Number(record?.elapsedSeconds);
  if (Number.isFinite(elapsed) && elapsed > 0) return Math.floor(elapsed);
  const start = record?.startedAt ? new Date(record.startedAt).getTime() : 0;
  const end = record?.completedAt ? new Date(record.completedAt).getTime() : 0;
  if (start > 0 && end > start) return Math.floor((end - start) / 1000);
  const progressElapsed = Number(progress?.elapsedSeconds);
  if (Number.isFinite(progressElapsed) && progressElapsed > 0) {
    return Math.floor(progressElapsed);
  }
  return null;
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeGroup(value) {
  const group = normalizeDiameterGroupValue(value);
  return DIAMETER_GROUPS.includes(group) ? group : "";
}

function fitsDiameterGroup(doc, group) {
  const maxD = Number(doc?.caseInfos?.maxDiameter);
  if (!Number.isFinite(maxD) || maxD <= 0) return false;
  return inferDiameterGroupFromValue(maxD) === group;
}

function diameterBandQuery(group) {
  if (group === "6") return { $gt: 0, $lte: 6 };
  if (group === "8") return { $gt: 6, $lte: 8 };
  if (group === "10") return { $gt: 8, $lte: 10 };
  if (group === "12") return { $gt: 10, $lte: 12 };
  if (group === "14") return { $gt: 12 };
  return null;
}

function resolveAssignedMachine(doc) {
  const scheduled = String(
    doc?.productionSchedule?.assignedMachine || "",
  ).trim();
  const assigned = String(doc?.assignedMachine || "").trim();
  return scheduled || assigned || null;
}

function resolveNcLocator(doc) {
  const bridgePath = String(doc?.caseInfos?.ncFile?.filePath || "").trim();
  const s3Key = String(doc?.caseInfos?.ncFile?.s3Key || "").trim();
  const rawFileName = String(doc?.caseInfos?.ncFile?.fileName || "").trim();
  const derivedFileNameFromPath = bridgePath
    ? bridgePath.split(/[/\\]/).pop()
    : "";
  const derivedFileNameFromS3 = s3Key ? s3Key.split("/").pop() : "";
  const fileName =
    rawFileName || derivedFileNameFromPath || derivedFileNameFromS3 || "";
  return { hasNc: Boolean(fileName && (bridgePath || s3Key)) };
}

function toDummyProductDto(doc) {
  if (!doc) return null;
  const caseInfos = doc.caseInfos || {};
  const requestor =
    doc.requestor && typeof doc.requestor === "object" ? doc.requestor : null;
  const nc = resolveNcLocator(doc);
  const finishPoints = caseInfos?.finishLine?.points;
  return {
    _id: String(doc._id || ""),
    requestId: String(doc.requestId || "").trim(),
    lotNumber: String(doc?.lotNumber?.value || "").trim(),
    assignedMachine: resolveAssignedMachine(doc),
    manufacturerStage: String(doc.manufacturerStage || "").trim() || null,
    createdAt: doc.createdAt || null,
    hasNc: nc.hasNc,
    durationSeconds: resolveDurationSeconds(
      doc?._machiningRecord?.[0] ||
        (doc?.productionSchedule?.machiningRecord &&
        typeof doc.productionSchedule.machiningRecord === "object"
          ? doc.productionSchedule.machiningRecord
          : null),
      doc?.productionSchedule?.machiningProgress,
    ),
    requestor: requestor
      ? {
          name: String(requestor.name || "").trim(),
          business: String(requestor.business || "").trim(),
        }
      : null,
    caseInfos: {
      clinicName: String(caseInfos.clinicName || "").trim(),
      patientName: String(caseInfos.patientName || "").trim(),
      tooth: String(caseInfos.tooth || "").trim(),
      implantManufacturer: String(caseInfos.implantManufacturer || "").trim(),
      implantBrand: String(caseInfos.implantBrand || "").trim(),
      implantFamily: String(caseInfos.implantFamily || "").trim(),
      implantType: String(caseInfos.implantType || "").trim(),
      maxDiameter: numOrNull(caseInfos.maxDiameter),
      connectionDiameter: numOrNull(caseInfos.connectionDiameter),
      totalLength: numOrNull(caseInfos.totalLength),
      stlFile: caseInfos.stlFile || null,
      camFile: caseInfos.camFile || null,
      finishLine: Array.isArray(finishPoints) ? { points: finishPoints } : null,
    },
  };
}

async function findRequestByRequestId(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return null;
  return Request.findOne({ requestId: id })
    .select(DUMMY_PRODUCT_SELECT)
    .populate({ path: "requestor", select: "name business" })
    .populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt durationSeconds elapsedSeconds",
    })
    .lean();
}

function dummyLotTail(lotValue) {
  const raw = String(lotValue || "").trim().toUpperCase();
  const tail = raw.includes("-")
    ? raw.slice(raw.lastIndexOf("-") + 1)
    : raw.slice(-3);
  const letters = tail.replace(/[^A-Z]/g, "").slice(-3);
  return letters || "DMY";
}

function kstYyMmDd() {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return ymd.replace(/-/g, "");
}

function cloneDummyCaseInfos(sourceCaseInfos) {
  const raw =
    sourceCaseInfos && typeof sourceCaseInfos === "object"
      ? JSON.parse(JSON.stringify(sourceCaseInfos))
      : {};
  delete raw._id;
  const now = new Date();
  const filled = pickFilledStlFileForClone(raw);
  return {
    ...raw,
    ...filled,
    ncFile: raw.ncFile || null,
    reviewByStage: {
      request: { status: "APPROVED", updatedAt: now },
      cam: { status: "APPROVED", updatedAt: now },
      machining: { status: "PENDING", updatedAt: null },
      packing: { status: "PENDING", updatedAt: null },
      shipping: { status: "PENDING", updatedAt: null },
      tracking: { status: "PENDING", updatedAt: null },
    },
    rollbackCounts: {
      request: 0,
      cam: 0,
      machining: 0,
      packing: 0,
      shipping: 0,
      tracking: 0,
    },
    stageFiles: {
      machining: null,
      packing: null,
      shipping: null,
      tracking: null,
    },
  };
}

function expectedDummyDurationSeconds(elapsed) {
  const n = Number(elapsed);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function applyIdleDummySchedule({ elapsedSeconds, sourceRequestId }) {
  const duration = expectedDummyDurationSeconds(elapsedSeconds);
  return {
    assignedMachine: null,
    queuePosition: null,
    machiningQty: 1,
    machiningRecord: null,
    actualCamStart: null,
    actualCamComplete: null,
    actualMachiningStart: null,
    actualMachiningComplete: null,
    dummyNextUpPinnedAt: null,
    dummySampleSourceRequestId: sourceRequestId || null,
    machiningProgress:
      duration != null ? { elapsedSeconds: duration } : undefined,
  };
}

function resetDummySampleForNextUp(
  doc,
  { machineId, diameterGroup, materialDia },
) {
  const prevElapsed = resolveDurationSeconds(
    doc?.productionSchedule?.machiningRecord &&
      typeof doc.productionSchedule.machiningRecord === "object"
      ? doc.productionSchedule.machiningRecord
      : null,
    doc?.productionSchedule?.machiningProgress,
  );
  doc.manufacturerStage = "가공";
  if (typeof doc.depopulate === "function") {
    doc.depopulate("productionSchedule.machiningRecord");
  }
  doc.set("assignedMachine", machineId);
  doc.set("productionSchedule.assignedMachine", machineId);
  doc.set("productionSchedule.dummyNextUpPinnedAt", new Date());
  doc.set("productionSchedule.queuePosition", null);
  doc.set("productionSchedule.machiningRecord", null);
  doc.set("productionSchedule.actualCamStart", null);
  doc.set("productionSchedule.actualCamComplete", null);
  doc.set("productionSchedule.actualMachiningStart", null);
  doc.set("productionSchedule.actualMachiningComplete", null);
  if (Number.isFinite(materialDia) && materialDia > 0) {
    doc.set("productionSchedule.diameter", materialDia);
  }
  if (diameterGroup) {
    doc.set("productionSchedule.diameterGroup", diameterGroup);
  }
  const duration = expectedDummyDurationSeconds(prevElapsed);
  if (duration != null) {
    doc.set("productionSchedule.machiningProgress", {
      elapsedSeconds: duration,
    });
  } else {
    doc.set("productionSchedule.machiningProgress", undefined);
  }
  if (doc?.caseInfos?.reviewByStage) {
    doc.set("caseInfos.reviewByStage.machining", {
      status: "PENDING",
      updatedAt: null,
    });
    doc.set("caseInfos.reviewByStage.packing", {
      status: "PENDING",
      updatedAt: null,
    });
  }
  return doc;
}

async function uniqueDummyLot(sourceLot) {
  const tail = dummyLotTail(sourceLot);
  const ymd = kstYyMmDd();
  for (let i = 0; i < 12; i += 1) {
    const code =
      i === 0 ? tail : `${tail.slice(0, 2)}${String.fromCharCode(65 + (i % 26))}`;
    const value = `DY${ymd}-${code}`;
    const exists = await Request.exists({ "lotNumber.value": value });
    if (!exists) return value;
  }
  return `DY${ymd}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

async function createDummySample(source, userId) {
  const sourceId = String(source?.requestId || "").trim();
  const full = await Request.findOne({ requestId: sourceId }).lean();
  if (!full) return null;
  if (String(full.source || "") === "dummy_sample") return full;
  const duration = resolveDurationSeconds(
    null,
    full?.productionSchedule?.machiningProgress,
  );
  const fromRecord = await MachiningRecord.findById(
    full?.productionSchedule?.machiningRecord,
  )
    .select("durationSeconds elapsedSeconds startedAt completedAt")
    .lean();
  const elapsed = resolveDurationSeconds(fromRecord, full?.productionSchedule?.machiningProgress) || duration;
  const lotValue = await uniqueDummyLot(full?.lotNumber?.value);
  const requestorId = full.requestor?._id || full.requestor;
  const copy = new Request({
    caseInfos: cloneDummyCaseInfos(full.caseInfos),
    requestor: requestorId,
    businessAnchorId: full.businessAnchorId || null,
    caManufacturer: userId || full.caManufacturer || null,
    assignedMachine: null,
    manufacturerStage: "가공",
    source: "dummy_sample",
    requestCategory: "dummy_sample",
    price: {
      amount: 0,
      baseAmount: 0,
      discountAmount: 0,
      currency: "KRW",
      rule: "dummy_sample",
      paidAmount: 0,
      bonusAmount: 0,
    },
    originalShipping: { mode: "normal", requestedAt: new Date() },
    finalShipping: { mode: "normal", updatedAt: new Date() },
    shippingMode: "normal",
    paymentStatus: "결제전",
    lotNumber: {
      material: full.lotNumber?.material || null,
      value: lotValue,
    },
    productionSchedule: {
      ...applyIdleDummySchedule({
        elapsedSeconds: elapsed,
        sourceRequestId: sourceId,
      }),
      diameter: Number(full?.caseInfos?.maxDiameter) || null,
      diameterGroup: inferDiameterGroupFromValue(
        Number(full?.caseInfos?.maxDiameter),
      ),
    },
  });
  await copy.save();
  return copy.toObject();
}

async function retireDummySample(requestId) {
  const id = String(requestId || "").trim();
  if (!id) return;
  const doc = await Request.findOne({ requestId: id, source: "dummy_sample" });
  if (!doc || isMachiningInProgress(doc)) return;
  doc.manufacturerStage = "취소";
  doc.set("productionSchedule.dummyNextUpPinnedAt", null);
  doc.set("productionSchedule.assignedMachine", null);
  doc.set("assignedMachine", null);
  await doc.save();
}

async function materializeSavedRow(row, userId) {
  const requestId = String(row?.requestId || "").trim();
  if (!requestId) return row;
  const doc = await Request.findOne({ requestId }).select("source requestId").lean();
  if (!doc) return row;
  if (String(doc.source || "") === "dummy_sample") return row;
  const copy = await createDummySample(doc, userId);
  if (!copy?.requestId) return row;
  return {
    ...row,
    requestId: String(copy.requestId),
  };
}

async function materializeSavedRows(rows, userId) {
  const next = [];
  let changed = false;
  for (const row of rows) {
    const materialized = await materializeSavedRow(row, userId);
    if (String(materialized?.requestId || "") !== String(row?.requestId || "")) {
      changed = true;
    }
    next.push(materialized);
  }
  if (changed) {
    await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { dummyMachiningProducts: next } },
      { upsert: true },
    );
  }
  return next;
}

async function readSavedRows() {
  const settings = await SystemSettings.findOne({ key: "global" })
    .select({ dummyMachiningProducts: 1 })
    .lean();
  return Array.isArray(settings?.dummyMachiningProducts)
    ? settings.dummyMachiningProducts
    : [];
}

async function renumberMachineQueue(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid || mid === "unassigned") return;
  const rows = await Request.find({
    manufacturerStage: "가공",
    ...EXCLUDE_UNMACHINABLE_FILTER,
    ...EXCLUDE_IDLE_DUMMY_SAMPLE_FILTER,
    "productionSchedule.assignedMachine": mid,
  })
    .select(
      "_id requestId productionSchedule caseInfos shippingMode finalShipping originalShipping rnd",
    )
    .populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt durationSeconds elapsedSeconds",
    });
  const ordered = [...rows].sort(compareMachiningQueueOrder);
  await Promise.all(
    ordered.map((item, idx) =>
      Request.updateOne(
        { _id: item._id },
        { $set: { "productionSchedule.queuePosition": idx + 1 } },
      ),
    ),
  );
}

export async function getDummyMachiningProduct(req, res) {
  try {
    const rows = await materializeSavedRows(
      await readSavedRows(),
      req.user?._id || null,
    );
    const items = [];
    for (const row of rows) {
      const diameterGroup = normalizeGroup(row?.diameterGroup);
      const requestId = String(row?.requestId || "").trim();
      if (!diameterGroup || !requestId) continue;
      const doc = await findRequestByRequestId(requestId);
      items.push({
        diameterGroup,
        product: doc ? toDummyProductDto(doc) : null,
        missingRequestId: doc ? null : requestId,
      });
    }
    return res.json({ success: true, data: { items } });
  } catch (error) {
    console.error("getDummyMachiningProduct failed", error);
    return res.status(500).json({
      success: false,
      message: "더미 제품을 불러오지 못했습니다.",
    });
  }
}

export async function searchDummyMachiningProducts(req, res) {
  try {
    const lot = String(req.query?.lot || "").trim();
    const diameterGroup = normalizeGroup(req.query?.diameterGroup);
    if (!lot && !diameterGroup) {
      return res.json({
        success: true,
        data: { items: [], hasMore: false, nextSkip: 0 },
      });
    }
    const regex = lot ? new RegExp(escapeRegex(lot), "i") : null;
    const band = diameterGroup ? diameterBandQuery(diameterGroup) : null;
    const skip = Math.max(
      0,
      Number.parseInt(String(req.query?.skip || "0"), 10) || 0,
    );
    const missingDurationKey = 1e12;
    const docs = await Request.aggregate([
      {
        $match: {
          source: { $ne: "dummy_sample" },
          ...(regex ? { "lotNumber.value": regex } : {}),
          ...(band ? { "caseInfos.maxDiameter": band } : {}),
        },
      },
      {
        $lookup: {
          from: MachiningRecord.collection.name,
          localField: "productionSchedule.machiningRecord",
          foreignField: "_id",
          as: "_machiningRecord",
        },
      },
      {
        $addFields: {
          _durationSeconds: {
            $let: {
              vars: { rec: { $arrayElemAt: ["$_machiningRecord", 0] } },
              in: {
                $let: {
                  vars: {
                    fromRecord: {
                      $cond: [
                        { $gt: ["$$rec.durationSeconds", 0] },
                        "$$rec.durationSeconds",
                        {
                          $cond: [
                            { $gt: ["$$rec.elapsedSeconds", 0] },
                            "$$rec.elapsedSeconds",
                            {
                              $cond: [
                                {
                                  $and: [
                                    { $ne: ["$$rec.startedAt", null] },
                                    { $ne: ["$$rec.completedAt", null] },
                                  ],
                                },
                                {
                                  $divide: [
                                    {
                                      $subtract: [
                                        "$$rec.completedAt",
                                        "$$rec.startedAt",
                                      ],
                                    },
                                    1000,
                                  ],
                                },
                                0,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                  in: {
                    $cond: [
                      { $gt: ["$$fromRecord", 0] },
                      "$$fromRecord",
                      {
                        $cond: [
                          {
                            $gt: [
                              "$productionSchedule.machiningProgress.elapsedSeconds",
                              0,
                            ],
                          },
                          "$productionSchedule.machiningProgress.elapsedSeconds",
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      { $match: { _durationSeconds: { $gte: MIN_MACHINING_SECONDS } } },
      {
        $addFields: {
          _durationSortKey: {
            $cond: [
              { $gt: ["$_durationSeconds", 0] },
              "$_durationSeconds",
              missingDurationKey,
            ],
          },
        },
      },
      { $sort: { _durationSortKey: 1, createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: SEARCH_PAGE_SIZE + 1 },
    ]);
    const pageDocs = Array.isArray(docs) ? docs : [];
    const hasMore = pageDocs.length > SEARCH_PAGE_SIZE;
    const page = pageDocs.slice(0, SEARCH_PAGE_SIZE);
    const requestorIds = page
      .map((doc) => String(doc?.requestor?._id || doc?.requestor || "").trim())
      .filter(Boolean);
    if (requestorIds.length) {
      const users = await User.find({ _id: { $in: requestorIds } })
        .select("name business")
        .lean();
      const byId = new Map(users.map((user) => [String(user._id), user]));
      for (const doc of page) {
        const user = byId.get(
          String(doc?.requestor?._id || doc?.requestor || ""),
        );
        if (user) doc.requestor = user;
      }
    }
    const items = page
      .filter((doc) => !diameterGroup || fitsDiameterGroup(doc, diameterGroup))
      .map((doc) => toDummyProductDto(doc))
      .filter(Boolean);
    return res.json({
      success: true,
      data: {
        items,
        hasMore,
        nextSkip: skip + Math.min(pageDocs.length, SEARCH_PAGE_SIZE),
      },
    });
  } catch (error) {
    console.error("searchDummyMachiningProducts failed", error);
    return res.status(500).json({
      success: false,
      message: "더미 제품 검색에 실패했습니다.",
    });
  }
}

export async function selectDummyMachiningProduct(req, res) {
  try {
    const requestId = String(req.body?.requestId || "").trim();
    const diameterGroup = normalizeGroup(req.body?.diameterGroup);
    if (!diameterGroup) {
      return res.status(400).json({
        success: false,
        message: "소재 직경을 선택해 주세요.",
      });
    }
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "의뢰를 선택해 주세요.",
      });
    }
    const doc = await findRequestByRequestId(requestId);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "해당 로트의 제품을 찾지 못했습니다.",
      });
    }
    if (!fitsDiameterGroup(doc, diameterGroup)) {
      return res.status(409).json({
        success: false,
        message: `이 제품은 Ø${diameterGroup} 소재에 맞지 않습니다.`,
      });
    }

    const current = await readSavedRows();
    const previous = current.find(
      (row) => normalizeGroup(row?.diameterGroup) === diameterGroup,
    );
    const copy = await createDummySample(doc, req.user?._id || null);
    if (!copy?.requestId) {
      return res.status(500).json({
        success: false,
        message: "더미 복사본을 만들지 못했습니다.",
      });
    }
    const previousId = String(previous?.requestId || "").trim();
    if (previousId && previousId !== String(copy.requestId)) {
      await retireDummySample(previousId);
    }
    const nextRows = current
      .filter((row) => normalizeGroup(row?.diameterGroup) !== diameterGroup)
      .map((row) => ({
        diameterGroup: normalizeGroup(row?.diameterGroup),
        requestId: String(row?.requestId || "").trim(),
        selectedAt: row?.selectedAt || null,
        selectedBy: row?.selectedBy || null,
      }))
      .filter((row) => row.diameterGroup && row.requestId);
    nextRows.push({
      diameterGroup,
      requestId: String(copy.requestId),
      selectedAt: new Date(),
      selectedBy: req.user?._id || null,
    });

    await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { dummyMachiningProducts: nextRows } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const savedCopy = await findRequestByRequestId(copy.requestId);
    return res.json({
      success: true,
      data: {
        diameterGroup,
        product: toDummyProductDto(savedCopy || copy),
      },
    });
  } catch (error) {
    console.error("selectDummyMachiningProduct failed", error);
    return res.status(500).json({
      success: false,
      message: "더미 제품 저장에 실패했습니다.",
    });
  }
}

export async function clearDummyMachiningProduct(req, res) {
  try {
    const diameterGroup = normalizeGroup(
      req.query?.diameterGroup || req.body?.diameterGroup,
    );
    if (!diameterGroup) {
      return res.status(400).json({
        success: false,
        message: "소재 직경을 선택해 주세요.",
      });
    }

    const current = await readSavedRows();
    const nextRows = current
      .filter((row) => normalizeGroup(row?.diameterGroup) !== diameterGroup)
      .map((row) => ({
        diameterGroup: normalizeGroup(row?.diameterGroup),
        requestId: String(row?.requestId || "").trim(),
        selectedAt: row?.selectedAt || null,
        selectedBy: row?.selectedBy || null,
      }))
      .filter((row) => row.diameterGroup && row.requestId);

    await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { dummyMachiningProducts: nextRows } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.json({
      success: true,
      data: { diameterGroup, product: null },
    });
  } catch (error) {
    console.error("clearDummyMachiningProduct failed", error);
    return res.status(500).json({
      success: false,
      message: "더미 제거에 실패했습니다.",
    });
  }
}

export async function enqueueDummyMachiningProduct(req, res) {
  try {
    const machineId = String(req.body?.machineId || "").trim();
    if (!machineId || machineId === "unassigned") {
      return res.status(400).json({
        success: false,
        message: "장비가 필요합니다.",
      });
    }

    const machine = await CncMachine.findOne({ machineId })
      .select({ currentMaterial: 1, maxModelDiameterGroups: 1 })
      .lean();
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾지 못했습니다.",
      });
    }
    const diameterGroup = inferMaterialDiameterGroup(machine);
    const materialDia = inferCurrentMaterialDiameter(machine);
    if (!diameterGroup || !Number.isFinite(materialDia)) {
      return res.status(400).json({
        success: false,
        message: "이 장비에 소재 직경이 없습니다.",
      });
    }

    const rows = await materializeSavedRows(
      await readSavedRows(),
      req.user?._id || null,
    );
    const saved = rows.find(
      (row) => normalizeGroup(row?.diameterGroup) === diameterGroup,
    );
    const requestId = String(saved?.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: `Ø${diameterGroup} 더미가 없습니다.`,
      });
    }

    const doc = await Request.findOne({ requestId }).populate({
      path: "productionSchedule.machiningRecord",
      select: "status startedAt completedAt durationSeconds elapsedSeconds",
    });
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "저장된 더미 제품을 찾지 못했습니다.",
      });
    }
    if (doc?.rnd?.unmachinableAt) {
      return res.status(409).json({
        success: false,
        message: "불완전가공 건은 Next Up에 넣을 수 없습니다.",
      });
    }
    if (String(doc.source || "").trim() !== "dummy_sample") {
      const copy = await createDummySample(
        doc.toObject(),
        req.user?._id || null,
      );
      if (!copy?.requestId) {
        return res.status(500).json({
          success: false,
          message: "더미 복사본을 만들지 못했습니다.",
        });
      }
      const savedRows = await readSavedRows();
      const nextRows = savedRows.map((row) =>
        String(row?.requestId || "").trim() === requestId
          ? { ...row, requestId: String(copy.requestId) }
          : row,
      );
      await SystemSettings.findOneAndUpdate(
        { key: "global" },
        { $set: { dummyMachiningProducts: nextRows } },
        { upsert: true },
      );
      const copied = await Request.findOne({
        requestId: copy.requestId,
      }).populate({
        path: "productionSchedule.machiningRecord",
        select: "status startedAt completedAt durationSeconds elapsedSeconds",
      });
      if (!copied) {
        return res.status(500).json({
          success: false,
          message: "더미 복사본을 만들지 못했습니다.",
        });
      }
      return finishDummyEnqueue(copied, {
        res,
        machineId,
        diameterGroup,
        materialDia,
        requestId: String(copy.requestId),
      });
    }
    if (isMachiningInProgress(doc)) {
      return res.status(409).json({
        success: false,
        message: "가공 중인 건은 Next Up에 넣을 수 없습니다.",
      });
    }
    return finishDummyEnqueue(doc, {
      res,
      machineId,
      diameterGroup,
      materialDia,
      requestId,
    });
  } catch (error) {
    console.error("enqueueDummyMachiningProduct failed", error);
    return res.status(500).json({
      success: false,
      message: "Next Up에 넣지 못했습니다.",
    });
  }
}

async function finishDummyEnqueue(
  doc,
  { res, machineId, diameterGroup, materialDia, requestId },
) {
  const maxD = Number(doc?.caseInfos?.maxDiameter);
  if (
    Number.isFinite(maxD) &&
    maxD > 0 &&
    !machineMaterialCoversMaxDiameter(materialDia, maxD)
  ) {
    return res.status(409).json({
      success: false,
      message: `장비 소재(Ø${materialDia})가 이 제품 최대직경을 커버하지 않습니다.`,
    });
  }

  const previousMachineId = resolveAssignedMachine(doc);
  resetDummySampleForNextUp(doc, {
    machineId,
    diameterGroup,
    materialDia,
  });
  await doc.save();

  await renumberMachineQueue(machineId);
  if (previousMachineId && previousMachineId !== machineId) {
    await renumberMachineQueue(previousMachineId);
  }

  return res.json({
    success: true,
    data: {
      requestId,
      machineId,
      diameterGroup,
      previousMachineId:
        previousMachineId && previousMachineId !== machineId
          ? previousMachineId
          : null,
    },
  });
}
