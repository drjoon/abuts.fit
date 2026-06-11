import Request from "../../models/request.model.js";
import CncEvent from "../../models/cncEvent.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import MachiningRecord from "../../models/machiningRecord.model.js";
import { getIO } from "../../socket.js";
import {
  applyStatusMapping,
  ensureFinishedLotNumberForPacking,
  ensureLotNumberForMachining,
  normalizeRequestForResponse,
} from "../../controllers/requests/utils.js";
import { ensureDeliveryInfoShippedAtNow } from "../../controllers/requests/common.review.helpers.js";
import Machine from "../../models/machine.model.js";
import {
  BRIDGE_BASE,
  withBridgeHeaders,
  fetchBridgeQueueFromBridge,
  saveBridgeQueueSnapshot,
  invalidateBridgeFlagsCache,
} from "./shared.js";
import { allocateVirtualMailboxAddress } from "../requests/mailbox.utils.js";
import { appendMachiningJobStats } from "./tooling.js";
import {
  inferMaterialDiameterGroup,
  inferRequestDiameterGroup,
  normalizeDiameterGroupValue,
} from "./distribution.utils.js";

const REQUEST_ID_REGEX = /(\d{8}-[A-Z0-9]{6,10})/i;
const STARTED_EMIT_TTL_MS = 30 * 1000;
const startedEmitCache = new Map();
const MACHINING_TICK_LOG_WINDOW_MS = 60 * 1000;
const machiningTickLogCache = new Map();

function makeStartedEmitKey({ machineId, jobId, requestId, bridgePath }) {
  return [
    String(machineId || "").trim(),
    String(jobId || "").trim(),
    String(requestId || "").trim(),
    String(bridgePath || "").trim(),
  ].join("|");
}

function makeMachiningTickLogKey({
  machineId,
  jobId,
  requestId,
  bridgePath,
  phase,
}) {
  return [
    String(machineId || "").trim(),
    String(jobId || "").trim(),
    String(requestId || "").trim(),
    String(bridgePath || "").trim(),
    String(phase || "")
      .trim()
      .toUpperCase(),
  ].join("|");
}

function shouldLogMachiningTick({
  machineId,
  jobId,
  requestId,
  bridgePath,
  phase,
  nowMs = Date.now(),
}) {
  const phaseKey = String(phase || "")
    .trim()
    .toUpperCase();
  if (!phaseKey) return false;
  if (phaseKey === "ALARM" || phaseKey === "FAILED" || phaseKey === "COMPLETED")
    return true;

  const key = makeMachiningTickLogKey({
    machineId,
    jobId,
    requestId,
    bridgePath,
    phase: phaseKey,
  });
  const last = machiningTickLogCache.get(key) || 0;
  if (nowMs - last >= MACHINING_TICK_LOG_WINDOW_MS) {
    machiningTickLogCache.set(key, nowMs);
    return true;
  }
  return false;
}

function isMachineOnlineStatus(status) {
  const s = String(status || "")
    .trim()
    .toUpperCase();
  return ["OK", "ONLINE", "RUNNING", "IDLE", "STOP"].includes(s);
}

function resolveMachineRuntimeDiameterGroupSet(machineMeta) {
  const currentGroup = normalizeDiameterGroupValue(
    inferMaterialDiameterGroup(machineMeta),
  );
  if (currentGroup) {
    return new Set([currentGroup]);
  }

  const set = new Set(
    (Array.isArray(machineMeta?.maxModelDiameterGroups)
      ? machineMeta.maxModelDiameterGroups
      : []
    )
      .map((g) => normalizeDiameterGroupValue(g))
      .filter(Boolean),
  );
  return set;
}

function isRequestDiameterCompatibleWithMachine({ requestDoc, machineMeta }) {
  const reqGroup = normalizeDiameterGroupValue(
    inferRequestDiameterGroup(requestDoc),
  );
  if (!reqGroup) return true;
  const machineGroupSet = resolveMachineRuntimeDiameterGroupSet(machineMeta);
  if (machineGroupSet.size === 0) return true;
  return machineGroupSet.has(reqGroup);
}

export async function getCompletedMachiningRecords(req, res) {
  try {
    const machineId = String(req.query.machineId || "").trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(50, Math.max(1, limitRaw))
      : 5;
    const cursor = String(req.query.cursor || "").trim();
    // includeRequests=true: 워크시트에서 의뢰 자동가공 완료 건도 포함
    // includeRequests=false(기본): 장비 페이지에서 수동 업로드 완료만 표시
    const includeRequests = req.query.includeRequests === "true";

    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const query = {
      machineId,
      status: "COMPLETED",
      ...(includeRequests ? {} : { requestId: { $in: [null, ""] } }),
    };

    if (cursor) {
      const [cursorAt, cursorId] = cursor.split("|");
      const at = cursorAt ? new Date(cursorAt) : null;
      if (at && !Number.isNaN(at.getTime())) {
        query.$or = [
          { completedAt: { $lt: at } },
          { completedAt: at, _id: { $lt: cursorId } },
        ];
      }
    }

    // Fetch more records to account for items that might be filtered out
    const fetchLimit = limit * 3;
    const recs = await MachiningRecord.find(query)
      .sort({ completedAt: -1, _id: -1 })
      .limit(fetchLimit)
      .select(
        "requestId jobId status completedAt durationSeconds elapsedSeconds displayLabel lotNumber clinicName patientName tooth",
      )
      .lean();

    const validRecs = [];
    let nextCursor = null;
    let hasMore = false;

    for (const r of recs) {
      if (validRecs.length < limit) {
        validRecs.push(r);
      } else {
        hasMore = true;
        nextCursor = `${new Date(r.completedAt).toISOString()}|${String(r._id)}`;
        break;
      }
    }

    if (!hasMore && recs.length === fetchLimit) {
      // We exhausted the fetched records but there might be more in the database
      hasMore = true;
      const lastRec = recs[recs.length - 1];
      nextCursor = `${new Date(lastRec.completedAt).toISOString()}|${String(lastRec._id)}`;
    }

    // includeRequests=true일 때 requestId가 있는 레코드의 Request 정보를 일괄 조회
    let requestInfoMap = new Map();
    if (includeRequests) {
      const requestIds = validRecs
        .map((r) => String(r?.requestId || "").trim())
        .filter(Boolean);
      if (requestIds.length > 0) {
        const requests = await Request.find({ requestId: { $in: requestIds } })
          .select("requestId caseInfos lotNumber productionSchedule source")
          .lean();
        for (const r of requests) {
          const rid = String(r?.requestId || "").trim();
          if (!rid) continue;
          const rollbackCount = Number(
            r?.caseInfos?.rollbackCounts?.machining ?? 0,
          );
          const tooth = String(r?.caseInfos?.tooth || "").trim();
          const lotNumber = r?.lotNumber?.value ? r.lotNumber : null;
          requestInfoMap.set(rid, {
            clinicName: String(r?.caseInfos?.clinicName || "").trim(),
            patientName: String(r?.caseInfos?.patientName || "").trim(),
            tooth,
            lotNumber,
            requestMongoId: String(r?._id || "").trim(),
            rollbackCount,
            implantManufacturer: String(
              r?.caseInfos?.implantManufacturer || "",
            ).trim(),
            implantBrand: String(r?.caseInfos?.implantBrand || "").trim(),
            implantFamily: String(r?.caseInfos?.implantFamily || "").trim(),
            implantType: String(r?.caseInfos?.implantType || "").trim(),
            caseInfos: r?.caseInfos || null,
            source: String(r?.source || "").trim(),
          });
        }
      }
    }

    const items = validRecs.map((r) => {
      const displayLabel =
        String(
          r?.displayLabel || r?.originalFileName || r?.fileName || "",
        ).trim() || null;
      const recRequestId = String(r?.requestId || "").trim() || null;
      const reqInfo = recRequestId ? requestInfoMap.get(recRequestId) : null;
      return {
        id: String(r?._id || ""),
        machineId: String(r?.machineId || "").trim(),
        requestId: recRequestId,
        requestMongoId: reqInfo?.requestMongoId || null,
        jobId: r?.jobId != null ? String(r.jobId) : null,
        status: String(r?.status || "").trim(),
        completedAt: r?.completedAt
          ? new Date(r.completedAt).toISOString()
          : null,
        durationSeconds:
          typeof r?.durationSeconds === "number" && r.durationSeconds >= 0
            ? Math.floor(r.durationSeconds)
            : typeof r?.elapsedSeconds === "number" && r.elapsedSeconds >= 0
              ? Math.floor(r.elapsedSeconds)
              : 0,
        displayLabel,
        lotNumber: reqInfo?.lotNumber || null,
        clinicName: reqInfo?.clinicName || null,
        patientName: reqInfo?.patientName || null,
        tooth: reqInfo?.tooth || null,
        rollbackCount: reqInfo?.rollbackCount ?? 0,
        implantManufacturer: reqInfo?.implantManufacturer || null,
        implantBrand: reqInfo?.implantBrand || null,
        implantFamily: reqInfo?.implantFamily || null,
        implantType: reqInfo?.implantType || null,
        caseInfos: reqInfo?.caseInfos || null,
        source: reqInfo?.source || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: { items, nextCursor },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가공 완료 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getPendingSelfInspections(req, res) {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(200, Math.max(1, limitRaw))
      : 50;

    const recs = await MachiningRecord.find({
      status: "COMPLETED",
      requestId: { $nin: [null, ""] },
    })
      .sort({ completedAt: -1 })
      .limit(limit * 5)
      .select("requestId machineId completedAt durationSeconds")
      .lean();

    if (recs.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allRequestIds = [
      ...new Set(
        recs.map((r) => String(r?.requestId || "").trim()).filter(Boolean),
      ),
    ];

    const requests = await Request.find({
      requestId: { $in: allRequestIds },
      $or: [
        { "selfInspection.confirmed": { $ne: true } },
        { selfInspection: { $exists: false } },
      ],
    })
      .select("requestId caseInfos lotNumber")
      .lean();

    const unconfirmedIds = new Set(
      requests.map((r) => String(r?.requestId || "").trim()),
    );
    const requestInfoMap = new Map();
    for (const r of requests) {
      requestInfoMap.set(String(r.requestId).trim(), r);
    }

    const result = [];
    const seen = new Set();
    for (const rec of recs) {
      const rid = String(rec?.requestId || "").trim();
      if (!rid || !unconfirmedIds.has(rid) || seen.has(rid)) continue;
      seen.add(rid);
      const reqInfo = requestInfoMap.get(rid);
      result.push({
        requestId: rid,
        requestMongoId: String(reqInfo?._id || "") || null,
        clinicName: String(reqInfo?.caseInfos?.clinicName || "").trim(),
        patientName: String(reqInfo?.caseInfos?.patientName || "").trim(),
        tooth: String(reqInfo?.caseInfos?.tooth || "").trim(),
        lotNumber: reqInfo?.lotNumber?.value || null,
        completedAt: rec.completedAt
          ? new Date(rec.completedAt).toISOString()
          : null,
        implantManufacturer: String(
          reqInfo?.caseInfos?.implantManufacturer || "",
        ).trim(),
        implantBrand: String(reqInfo?.caseInfos?.implantBrand || "").trim(),
        implantFamily: String(reqInfo?.caseInfos?.implantFamily || "").trim(),
        implantType: String(reqInfo?.caseInfos?.implantType || "").trim(),
      });
      if (result.length >= limit) break;
    }

    return res.json({ success: true, data: result });
  } catch (e) {
    return res.status(500).json({ success: false, message: "조회 실패" });
  }
}

export async function triggerNextAutoMachiningManually(req, res) {
  try {
    const mid = String(req.params?.machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    await triggerNextAutoMachiningAfterComplete({
      machineId: mid,
      completedRequestId: "",
    });

    return res.status(200).json({
      success: true,
      data: { machineId: mid },
    });
  } catch (error) {
    console.warn(
      "[bridge:auto-next] triggerNextAutoMachiningManually failed",
      error?.message || error,
    );

    const status =
      (error && typeof error.statusCode === "number" && error.statusCode) ||
      (error && typeof error.status === "number" && error.status) ||
      500;

    let message = error?.message || "자동 가공 트리거 중 오류가 발생했습니다.";
    if (error?.code === "BRIDGE_PROCESS_FILE_FAILED") {
      message = "브리지 서버에서 가공 시작 요청이 거절되었습니다. (forbidden)";
    }

    return res.status(status).json({
      success: false,
      message,
      error: error?.meta || undefined,
    });
  }
}

function shouldEmitStarted(key) {
  const now = Date.now();
  const last = startedEmitCache.get(key);
  if (typeof last === "number" && now - last < STARTED_EMIT_TTL_MS)
    return false;
  startedEmitCache.set(key, now);
  return true;
}

function normalizeBridgePath(raw) {
  const p = String(raw || "").trim();
  if (!p) return "";
  return p
    .replace(/^nc\//i, "")
    .replace(/\.(nc|stl)$/i, "")
    .trim();
}

function formatRequestLabelForCompleted(reqDoc, fallbackRequestId) {
  const rid = String(reqDoc?.requestId || fallbackRequestId || "").trim();
  const clinicName = String(reqDoc?.caseInfos?.clinicName || "").trim();
  const patientName = String(reqDoc?.caseInfos?.patientName || "").trim();
  const tooth = String(reqDoc?.caseInfos?.tooth || "").trim();
  const lotPartRaw = String(reqDoc?.lotNumber?.value || "").trim();
  const lotPart = lotPartRaw.replace(/^CA/i, "").replace(/-/g, " ").trim();
  const ridSuffix = rid.includes("-") ? rid.split("-").pop() || rid : rid;

  const parts = [clinicName, patientName, tooth, lotPart, ridSuffix]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  if (parts.length) return parts.join(" ");
  if (rid) return `의뢰 (${rid})`;
  return "-";
}

async function fetchMachineAlarmsFromBridge(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return [];

  const base =
    process.env.BRIDGE_NODE_URL ||
    process.env.BRIDGE_PROCESS_BASE ||
    process.env.CNC_BRIDGE_BASE ||
    process.env.BRIDGE_BASE ||
    BRIDGE_BASE;
  if (!base) return [];
  const base0 = String(base).replace(/\/$/, "");

  const results = await Promise.all(
    [1, 2].map(async (headType) => {
      try {
        const resp = await fetch(
          `${base0}/api/cnc/alarms?machines=${encodeURIComponent(mid)}&headType=${encodeURIComponent(headType)}`,
          {
            method: "GET",
            headers: withBridgeHeaders(),
          },
        );
        const body = await resp.json().catch(() => ({}));
        if (
          !resp.ok ||
          body?.success !== true ||
          !Array.isArray(body?.results)
        ) {
          return [];
        }
        const item = body.results.find(
          (row) => String(row?.machineId || "").trim() === mid,
        );
        return Array.isArray(item?.data?.alarms) ? item.data.alarms : [];
      } catch {
        return [];
      }
    }),
  );

  const seen = new Set();
  return results.flat().filter((alarm) => {
    const key = `${alarm?.headType ?? ""}:${alarm?.type ?? ""}:${alarm?.no ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getLastCompletedMachiningMap(req, res) {
  try {
    // includeRequests=true: 워크시트에서 의뢰 자동가공 완료 건도 포함
    // includeRequests=false(기본): 장비 페이지에서 수동 업로드 완료만 표시
    const includeRequests = req.query.includeRequests === "true";

    const activeMachines = await CncMachine.find({ status: "active" })
      .select("machineId")
      .lean();
    const machineIds = (Array.isArray(activeMachines) ? activeMachines : [])
      .map((m) => String(m?.machineId || "").trim())
      .filter(Boolean);

    if (machineIds.length === 0) {
      return res.status(200).json({ success: true, data: {} });
    }

    const recs = await MachiningRecord.find({
      machineId: { $in: machineIds },
      status: "COMPLETED",
      ...(includeRequests ? {} : { requestId: { $in: [null, ""] } }),
    })
      .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean();

    const byMachine = new Map();
    for (const r of Array.isArray(recs) ? recs : []) {
      const mid = String(r?.machineId || "").trim();
      if (!mid) continue;
      if (byMachine.has(mid)) continue;
      byMachine.set(mid, r);
    }

    // includeRequests=true일 때 requestId가 있는 레코드의 Request 정보를 일괄 조회
    let requestInfoMap = new Map();
    if (includeRequests) {
      const requestIds = [];
      for (const [, rec] of byMachine) {
        const rid = String(rec?.requestId || "").trim();
        if (rid) requestIds.push(rid);
      }
      if (requestIds.length > 0) {
        const requests = await Request.find({ requestId: { $in: requestIds } })
          .select("requestId caseInfos lotNumber productionSchedule source")
          .lean();
        for (const r of requests) {
          const rid = String(r?.requestId || "").trim();
          if (!rid) continue;
          const rollbackCount = Number(
            r?.caseInfos?.rollbackCounts?.machining ?? 0,
          );
          const tooth = String(r?.caseInfos?.tooth || "").trim();
          const lotNumber = r?.lotNumber?.value ? r.lotNumber : null;
          requestInfoMap.set(rid, {
            clinicName: String(r?.caseInfos?.clinicName || "").trim(),
            patientName: String(r?.caseInfos?.patientName || "").trim(),
            tooth,
            lotNumber,
            requestMongoId: String(r?._id || "").trim(),
            rollbackCount,
            caseInfos: r?.caseInfos || null,
          });
        }
      }
    }

    const data = {};
    for (const mid of machineIds) {
      const rec = byMachine.get(mid) || null;
      if (!rec) continue;

      const displayLabel =
        String(
          rec?.displayLabel || rec?.originalFileName || rec?.fileName || "",
        ).trim() || null;
      const recRequestId = String(rec?.requestId || "").trim() || null;
      const reqInfo = recRequestId ? requestInfoMap.get(recRequestId) : null;
      const clinicName = reqInfo ? reqInfo.clinicName : "";
      const patientName = reqInfo ? reqInfo.patientName : "";
      const tooth = reqInfo ? reqInfo.tooth : "";
      const lotNumber = reqInfo ? reqInfo.lotNumber : { value: undefined };
      const caseInfos = reqInfo ? reqInfo.caseInfos : null;
      const completedAt = rec?.completedAt
        ? new Date(rec.completedAt).toISOString()
        : rec?.updatedAt
          ? new Date(rec.updatedAt).toISOString()
          : new Date().toISOString();
      const durationSeconds =
        typeof rec?.durationSeconds === "number" && rec.durationSeconds >= 0
          ? Math.floor(rec.durationSeconds)
          : typeof rec?.elapsedSeconds === "number" && rec.elapsedSeconds >= 0
            ? Math.floor(rec.elapsedSeconds)
            : 0;

      data[mid] = {
        machineId: mid,
        jobId: rec?.jobId != null ? String(rec.jobId) : null,
        requestId: recRequestId,
        requestMongoId: reqInfo?.requestMongoId || null,
        displayLabel: displayLabel || null,
        clinicName,
        patientName,
        tooth,
        rollbackCount: reqInfo?.rollbackCount ?? 0,
        lotNumber: lotNumber || { value: undefined },
        caseInfos,
        source: reqInfo?.source || null,
        completedAt,
        durationSeconds,
      };
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "마지막 가공 완료 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function triggerNextAutoMachiningAfterComplete({
  machineId,
  completedRequestId,
}) {
  const mid = String(machineId || "").trim();
  if (!mid) return;

  const startedAt = Date.now();
  console.log(
    `[bridge:auto-next] complete received machine=${mid} completedRequestId=${String(completedRequestId || "").trim() || "null"}`,
  );

  try {
    const m = await Machine.findOne({ $or: [{ uid: mid }, { name: mid }] })
      .select({
        allowAutoMachining: 1,
        allowJobStart: 1,
        allowProgramDelete: 1,
        allowRequestAssign: 1,
        manufacturerBusinessAnchorId: 1,
        lastStatus: 1,
      })
      .lean()
      .catch(() => null);

    if (m?.allowAutoMachining !== true) {
      console.log(
        `[bridge:auto-next] skip for ${mid}: allowAutoMachining is false`,
      );
      return;
    }

    const activeAlarms = await fetchMachineAlarmsFromBridge(mid);
    if (activeAlarms.length > 0) {
      console.log(
        `[bridge:auto-next] skip for ${mid}: active alarms detected`,
        {
          alarms: activeAlarms,
        },
      );
      return;
    }

    const cncRuntimeMeta = await CncMachine.findOne({ machineId: mid })
      .select({
        machineId: 1,
        currentMaterial: 1,
        maxModelDiameterGroups: 1,
      })
      .lean()
      .catch(() => null);

    const pending = await Request.find({
      // 자동 가공 트리거 대상은 "가공" 단계만 허용한다.
      // CAM 단계 건을 여기서 집어오면 승인/전환 우회로 보일 수 있어 제외한다.
      manufacturerStage: "가공",
      "productionSchedule.assignedMachine": mid,
    })
      .sort({ "productionSchedule.queuePosition": 1, updatedAt: 1 })
      .limit(20)
      .lean();

    let pick = null;
    let firstDiameterMismatched = null;

    for (const r of Array.isArray(pending) ? pending : []) {
      const rid = String(r?.requestId || "").trim();
      if (!rid) continue;
      if (completedRequestId && rid === completedRequestId) continue;
      const path = String(
        r?.ncFile?.filePath || r?.caseInfos?.ncFile?.filePath || "",
      ).trim();
      if (!path) continue;

      const compatible = isRequestDiameterCompatibleWithMachine({
        requestDoc: r,
        machineMeta: cncRuntimeMeta,
      });
      if (compatible) {
        pick = r;
        break;
      }
      if (!firstDiameterMismatched) {
        firstDiameterMismatched = r;
      }
    }

    if (!pick && firstDiameterMismatched) {
      const reqGroup = normalizeDiameterGroupValue(
        inferRequestDiameterGroup(firstDiameterMismatched),
      );

      if (reqGroup) {
        try {
          const allCnc = await CncMachine.find({ status: "active" })
            .select({
              machineId: 1,
              currentMaterial: 1,
              maxModelDiameterGroups: 1,
            })
            .lean();
          const allCncMap = new Map(
            (Array.isArray(allCnc) ? allCnc : [])
              .map((it) => [String(it?.machineId || "").trim(), it])
              .filter(([uid]) => Boolean(uid)),
          );

          const machineIds = Array.from(allCncMap.keys());
          const machineFilter = {
            uid: { $in: machineIds },
            allowAutoMachining: true,
            allowRequestAssign: { $ne: false },
            ...(m?.manufacturerBusinessAnchorId
              ? {
                  manufacturerBusinessAnchorId: m.manufacturerBusinessAnchorId,
                }
              : {}),
          };

          const machineFlags = await Machine.find(machineFilter)
            .select({ uid: 1, lastStatus: 1 })
            .lean();

          const candidates = (Array.isArray(machineFlags) ? machineFlags : [])
            .map((meta) => {
              const uid = String(meta?.uid || "").trim();
              if (!uid || uid === mid) return null;
              if (!isMachineOnlineStatus(meta?.lastStatus)) return null;
              const cncMeta = allCncMap.get(uid);
              if (!cncMeta) return null;
              const groups = resolveMachineRuntimeDiameterGroupSet(cncMeta);
              if (groups.size > 0 && !groups.has(reqGroup)) return null;
              return uid;
            })
            .filter(Boolean);

          if (candidates.length > 0) {
            const loads = await Request.aggregate([
              {
                $match: {
                  manufacturerStage: "가공",
                  "productionSchedule.assignedMachine": { $in: candidates },
                },
              },
              {
                $group: {
                  _id: "$productionSchedule.assignedMachine",
                  count: { $sum: 1 },
                },
              },
            ]);
            const loadMap = new Map(
              (Array.isArray(loads) ? loads : []).map((it) => [
                String(it?._id || "").trim(),
                Number(it?.count || 0),
              ]),
            );

            const targetMachineId = [...candidates]
              .sort((a, b) => {
                const ac = loadMap.get(a) ?? 0;
                const bc = loadMap.get(b) ?? 0;
                if (ac !== bc) return ac - bc;
                return a.localeCompare(b);
              })
              .at(0);

            if (targetMachineId) {
              await Request.updateOne(
                { _id: firstDiameterMismatched._id },
                {
                  $set: {
                    assignedMachine: targetMachineId,
                    "productionSchedule.assignedMachine": targetMachineId,
                  },
                },
              );

              console.log(
                `[bridge:auto-next] rerouted diameter-mismatched request ${String(firstDiameterMismatched?.requestId || "")} ${mid} -> ${targetMachineId} (reqGroup=${reqGroup})`,
              );

              void triggerNextAutoMachiningAfterComplete({
                machineId: targetMachineId,
                completedRequestId: "",
              });
            }
          }
        } catch (rerouteErr) {
          console.warn(
            "[bridge:auto-next] failed to reroute diameter-mismatched request",
            rerouteErr?.message || rerouteErr,
          );
        }
      }
    }

    if (!pick) {
      console.log(
        `[bridge:auto-next] no diameter-compatible pending jobs found for ${mid}, staying idle.`,
      );
      return;
    }

    const requestId = String(pick.requestId || "").trim();
    const bridgePath = String(
      pick?.ncFile?.filePath || pick?.caseInfos?.ncFile?.filePath || "",
    ).trim();
    const originalFileName = String(
      pick?.ncFile?.originalName || pick?.caseInfos?.ncFile?.originalName || "",
    ).trim();
    const s3Key = String(
      pick?.ncFile?.s3Key || pick?.caseInfos?.ncFile?.s3Key || "",
    ).trim();
    const s3Bucket = String(
      pick?.ncFile?.s3Bucket || pick?.caseInfos?.ncFile?.s3Bucket || "",
    ).trim();
    const rawFileName = String(
      pick?.ncFile?.fileName || pick?.caseInfos?.ncFile?.fileName || "",
    ).trim();
    const derivedFileName = bridgePath ? bridgePath.split(/[/\\]/).pop() : "";
    const fileName = rawFileName || derivedFileName;

    console.log(
      `[bridge:auto-next] attempting to trigger ${requestId} on ${mid}`,
      {
        bridgePath,
        fileName,
        originalFileName,
        hasS3Key: !!s3Key,
        elapsedMs: Date.now() - startedAt,
      },
    );

    if (!fileName || !bridgePath) {
      console.log(
        `[bridge:auto-next] skip for ${mid}: missing fileName or bridgePath for ${requestId}`,
      );
      return;
    }

    const base =
      process.env.BRIDGE_NODE_URL ||
      process.env.BRIDGE_PROCESS_BASE ||
      process.env.CNC_BRIDGE_BASE ||
      process.env.BRIDGE_BASE ||
      BRIDGE_BASE;
    if (!base) return;
    const base0 = String(base).replace(/\/$/, "");

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.3] 장비 페이지 수동 파일 우선 확인:
    // 브리지 큐에 source="manual_upload" 항목(requestId 없는 수동 업로드 파일)이
    // 남아 있으면 의뢰건 자동 가공 트리거를 건너뛴다.
    // 수동 파일은 브리지가 자체 순서대로 처리하며, 모두 소진된 뒤에야
    // 다음 의뢰건 자동 가공이 시작된다.
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const qResp = await fetch(
        `${base0}/api/bridge/queue/${encodeURIComponent(mid)}`,
        {
          method: "GET",
          headers: withBridgeHeaders(),
        },
      );
      const qBody = await qResp.json().catch(() => ({}));
      const list = Array.isArray(qBody?.data) ? qBody.data : [];
      console.log(
        `[bridge:auto-next] queue snapshot inspected machine=${mid} requestId=${requestId} queueSize=${list.length} elapsedMs=${Date.now() - startedAt}`,
      );

      // [정책 4.8.3] 수동 파일 항목: requestId가 없거나 source="manual_upload"인 항목
      const manualJobs = list.filter((j) => {
        const rid = String(j?.requestId || "").trim();
        return !rid; // requestId 없는 항목 = 수동 업로드 파일
      });
      if (manualJobs.length > 0) {
        console.log(
          `[bridge:auto-next] skip auto-trigger for ${mid}: manual_upload jobs exist in bridge queue (count=${manualJobs.length}), yielding to equipment-page queue elapsedMs=${Date.now() - startedAt}`,
        );
        // 수동 파일이 있는 경우: DB 스냅샷은 건드리지 않는다.
        // 브리지가 수동 파일을 모두 처리한 뒤 다음 완료 콜백에서 다시 이 함수를 호출한다.
        return;
      }

      // [정책 4.8.2] 이미 해당 의뢰건이 브리지 큐에 있는지 확인 (중복 enqueue 방지)
      // 단, 확인 후 스냅샷을 DB에 저장하지 않는다 (의뢰건이 스냅샷에 오염되는 원인 제거)
      const found = list.find((j) => {
        const rid = String(j?.requestId || "").trim();
        if (rid && rid === requestId) return true;
        const p = String(j?.bridgePath || "").trim();
        if (p && bridgePath && p === bridgePath) return true;
        return false;
      });
      if (found?.id && found?.paused === true) {
        console.log(
          `[bridge:auto-next] existing paused job found machine=${mid} jobId=${String(found.id)} requestId=${requestId} elapsedMs=${Date.now() - startedAt}`,
        );
        await fetch(
          `${base0}/api/bridge/queue/${encodeURIComponent(mid)}/${encodeURIComponent(
            String(found.id),
          )}/pause`,
          {
            method: "PATCH",
            headers: withBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ paused: false }),
          },
        );
        invalidateBridgeFlagsCache(mid).catch(() => {});
        // [정책 4.8.6] 의뢰건 auto-trigger 후 스냅샷 갱신 금지
        // (브리지 큐의 의뢰건 항목이 장비 페이지 스냅샷에 오염되는 것을 방지)
        return;
      }
      if (found?.id) {
        console.log(
          `[bridge:auto-next] existing job already queued machine=${mid} jobId=${String(found.id)} requestId=${requestId} elapsedMs=${Date.now() - startedAt}`,
        );
        invalidateBridgeFlagsCache(mid).catch(() => {});
        // [정책 4.8.6] 의뢰건 auto-trigger 후 스냅샷 갱신 금지
        return;
      }
    } catch {
      // ignore and try process-file
    }

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 의뢰건 자동 가공 트리거:
    // process-file API를 직접 호출하여 즉시 실행한다.
    // 브리지가 자체 큐에 올리더라도 백엔드 DB 스냅샷은 갱신하지 않는다.
    // (장비 페이지 예약목록 오염 방지)
    // ──────────────────────────────────────────────────────────────────────────
    const triggerUrl = `${base0}/api/bridge/process-file`;
    console.log(
      `[bridge:auto-next] process-file request machine=${mid} requestId=${requestId} fileName=${fileName} elapsedMs=${Date.now() - startedAt}`,
    );
    const triggerResp = await fetch(triggerUrl, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileName: fileName || null,
        originalFileName: originalFileName || fileName || null,
        requestId,
        machineId: mid,
        bridgePath: bridgePath || null,
        s3Key: s3Key || null,
        s3Bucket: s3Bucket || null,
      }),
    });
    if (!triggerResp.ok) {
      const txt = await triggerResp.text().catch(() => "");
      const errPayload = {
        machineId: mid,
        requestId,
        status: triggerResp.status,
        txt,
      };
      console.warn(
        "[bridge:auto-next] process-file failed",
        JSON.stringify(errPayload),
      );
      const error = new Error("bridge process-file failed");
      error.code = "BRIDGE_PROCESS_FILE_FAILED";
      error.meta = errPayload;
      throw error;
    }

    // [정책 4.8.6] process-file 성공 후 브리지 큐 스냅샷을 DB에 저장하지 않는다.
    // 브리지가 의뢰건을 자체 큐에 추가하더라도 백엔드 스냅샷에는 반영하지 않아
    // 장비 페이지 예약목록이 오염되지 않는다.
    console.log(
      `[bridge:auto-next] process-file success machine=${mid} requestId=${requestId} elapsedMs=${Date.now() - startedAt} (snapshot NOT updated per policy 4.8.6)`,
    );
  } catch (e) {
    console.warn(
      "[bridge:auto-next] triggerNextAutoMachiningAfterComplete failed",
      e?.message || e,
    );
    throw e;
  }
}

async function resolveJobMetaFromSnapshot({ machineId, jobId, bridgePath }) {
  const mid = String(machineId || "").trim();
  if (!mid) return { fileName: null, originalFileName: null };
  try {
    const machine = await CncMachine.findOne({ machineId: mid })
      .select("bridgeQueueSnapshot")
      .lean();
    const jobs = Array.isArray(machine?.bridgeQueueSnapshot?.jobs)
      ? machine.bridgeQueueSnapshot.jobs
      : [];
    const jid = String(jobId || "").trim();
    const bp = String(bridgePath || "").trim();
    const found = jobs.find((j) => {
      if (!j || typeof j !== "object") return false;
      if (jid && String(j.id || "").trim() === jid) return true;
      if (bp) {
        const p = String(j.bridgePath || j.path || "").trim();
        if (p && p === bp) return true;
      }
      return false;
    });
    const fileName = found?.fileName ? String(found.fileName).trim() : null;
    const originalFileName = found?.originalFileName
      ? String(found.originalFileName).trim()
      : null;
    return {
      fileName: fileName || null,
      originalFileName: originalFileName || null,
    };
  } catch {
    return { fileName: null, originalFileName: null };
  }
}

export async function recordMachiningStartForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const requestIdRaw = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const bridgePathRaw = req.body?.bridgePath
      ? String(req.body.bridgePath).trim()
      : "";

    const meta = await resolveJobMetaFromSnapshot({
      machineId: mid,
      jobId,
      bridgePath: bridgePathRaw,
    });

    let requestId = await resolveRequestIdFromDb({
      requestId: requestIdRaw,
      bridgePath: bridgePathRaw,
    });

    const now = new Date();
    const startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : now;
    const bridgeDelayMs = Math.max(0, now.getTime() - startedAt.getTime());

    console.log(
      `[bridge:machining:start] received machine=${mid} jobId=${jobId || "null"} requestId=${requestIdRaw || requestId || "null"} bridgePath=${bridgePathRaw || "null"} startedAt=${startedAt.toISOString()} receivedAt=${now.toISOString()} bridgeDelayMs=${bridgeDelayMs}`,
    );

    const recordQuery = requestId
      ? {
          requestId,
          machineId: mid,
          jobId: jobId || null,
          status: { $in: ["RUNNING"] },
        }
      : {
          requestId: null,
          machineId: mid,
          jobId: jobId || null,
          status: { $in: ["RUNNING"] },
        };

    const record = await MachiningRecord.findOneAndUpdate(
      recordQuery,
      {
        $setOnInsert: {
          requestId: requestId || null,
          machineId: mid,
          jobId: jobId || null,
          bridgePath: bridgePathRaw || null,
          fileName: meta.fileName,
          originalFileName: meta.originalFileName,
          status: "RUNNING",
        },
        $set: {
          startedAt,
          lastTickAt: startedAt,
          elapsedSeconds: 0,
        },
      },
      { new: true, upsert: true },
    );

    console.log(
      `[bridge:machining:start] record saved machine=${mid} jobId=${jobId || "null"} requestId=${requestId || "null"} fileName=${meta.fileName || "null"} originalFileName=${meta.originalFileName || "null"}`,
    );

    if (requestId) {
      const existing = await Request.findOne({ requestId }).select({
        productionSchedule: 1,
        requestId: 1,
      });

      const update = {
        $set: {
          "productionSchedule.machiningProgress": {
            machineId: mid,
            jobId: jobId || null,
            phase: "STARTED",
            percent: 0,
            startedAt,
            lastTickAt: startedAt,
            elapsedSeconds: 0,
          },
        },
      };

      if (!existing?.productionSchedule?.actualMachiningStart) {
        update.$set["productionSchedule.actualMachiningStart"] = startedAt;
      }
      if (record?._id && !existing?.productionSchedule?.machiningRecord) {
        update.$set["productionSchedule.machiningRecord"] = record._id;
      }
      await Request.updateOne({ requestId }, update);
    }

    console.log(
      `[bridge:machining:start] emit start machine=${mid} jobId=${jobId || "null"} requestId=${requestId || "null"} elapsedSinceBridgeStartMs=${bridgeDelayMs}`,
    );

    try {
      const key = makeStartedEmitKey({
        machineId: mid,
        jobId,
        requestId,
        bridgePath: bridgePathRaw,
      });
      if (shouldEmitStarted(key)) {
        const io = getIO();
        const payload = {
          machineId: mid,
          jobId: jobId || null,
          requestId: requestId || null,
          bridgePath: bridgePathRaw || null,
          startedAt,
        };
        console.log(
          "[bridge:machining:emit] cnc-machining-started",
          JSON.stringify({
            machineId: mid,
            jobId: jobId || null,
            requestId: requestId || null,
            bridgePath: bridgePathRaw || null,
          }),
        );
        if (jobId) {
          io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-started", payload);
        }
        io.emit("cnc-machining-started", payload);

        // 시작 시점에 STARTED phase tick도 함께 보내 로컬 타이머를 즉시 시작하도록 한다.
        const tickPayload = {
          ...payload,
          phase: "STARTED",
          percent: null,
          elapsedSeconds: 0,
          tickAt: now,
        };
        if (jobId) {
          io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-tick", tickPayload);
        }
        io.emit("cnc-machining-tick", tickPayload);
      }
    } catch {}

    return res.status(200).json({
      success: true,
      data: {
        machineId: mid,
        jobId: jobId || null,
        requestId: requestId || null,
        startedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining start 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function resolveRequestIdFromDb({ requestId: requestIdRaw, bridgePath }) {
  let candidate = String(requestIdRaw || "").trim();
  const normalizedPath = normalizeBridgePath(bridgePath);

  const ensureExists = async (rid) => {
    if (!rid) return null;
    const exists = await Request.exists({ requestId: rid });
    return exists ? rid : null;
  };

  let resolved = await ensureExists(candidate);
  if (resolved) return resolved;

  if (!candidate && normalizedPath) {
    const match = normalizedPath.match(REQUEST_ID_REGEX);
    if (match?.[1]) {
      resolved = await ensureExists(match[1].toUpperCase());
      if (resolved) return resolved;
    }
  }

  if (normalizedPath) {
    const doc = await Request.findOne(
      {
        $or: [
          { "file.filePath": normalizedPath },
          { "cam.filePath": normalizedPath },
          { "stageFiles.machining.filePath": normalizedPath },
          { "ncFile.filePath": normalizedPath },
        ],
      },
      { requestId: 1 },
    ).lean();
    if (doc?.requestId) {
      return doc.requestId;
    }
  }

  return candidate || "";
}

export async function recordMachiningTickForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const requestIdRaw = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const bridgePathRaw = req.body?.bridgePath
      ? String(req.body.bridgePath).trim()
      : "";
    const phase = req.body?.phase ? String(req.body.phase).trim() : "";
    const percentRaw = req.body?.percent;
    const percent = Number.isFinite(Number(percentRaw))
      ? Math.max(0, Math.min(100, Number(percentRaw)))
      : null;
    const message = req.body?.message ? String(req.body.message).trim() : "";

    let requestId = requestIdRaw;

    const meta = await resolveJobMetaFromSnapshot({
      machineId: mid,
      jobId,
      bridgePath: bridgePathRaw,
    });
    if (!requestId && bridgePathRaw) {
      try {
        const machine = await CncMachine.findOne({ machineId: mid }).select(
          "bridgeQueueSnapshot",
        );
        const jobs = machine?.bridgeQueueSnapshot?.jobs;
        if (Array.isArray(jobs)) {
          const found = jobs.find((j) => {
            const p = String(j?.bridgePath || j?.path || "").trim();
            return p && p === bridgePathRaw;
          });
          if (found?.requestId) requestId = String(found.requestId).trim();
        }
      } catch (err) {
        console.error(
          "[bridge:machining:tick] bridgePath lookup failed",
          err?.message,
        );
      }
    }

    requestId = await resolveRequestIdFromDb({
      requestId,
      bridgePath: bridgePathRaw,
    });
    const now = new Date();
    let elapsedSeconds = 0;
    let startedAt = now;

    const phaseUpper = String(phase || "")
      .trim()
      .toUpperCase();

    // AWAITING_START는 준비 중 상태로, 경과시간은 0으로 유지
    if (phaseUpper === "AWAITING_START") {
      startedAt = now;
      elapsedSeconds = 0;
    } else if (requestId) {
      const existing = await Request.findOne({ requestId }).select({
        productionSchedule: 1,
        requestId: 1,
      });

      const prevProgress = existing?.productionSchedule?.machiningProgress;
      const prevJobId = prevProgress?.jobId
        ? String(prevProgress.jobId).trim()
        : "";
      const startedAtRaw = prevProgress?.startedAt;
      const shouldResetStart =
        phaseUpper === "STARTED" ||
        (!!jobId && prevJobId && prevJobId !== String(jobId).trim());

      startedAt = shouldResetStart
        ? now
        : startedAtRaw
          ? new Date(startedAtRaw)
          : now;

      elapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - startedAt.getTime()) / 1000),
      );
    } else {
      const running = await MachiningRecord.findOne({
        requestId: null,
        machineId: mid,
        jobId: jobId || null,
        status: "RUNNING",
      }).select({ startedAt: 1 });

      const shouldResetStart = phaseUpper === "STARTED" || !running?.startedAt;
      startedAt = shouldResetStart ? now : new Date(running.startedAt);
      elapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - startedAt.getTime()) / 1000),
      );
    }

    const recordQuery = requestId
      ? {
          requestId,
          machineId: mid,
          jobId: jobId || null,
          status: { $in: ["RUNNING"] },
        }
      : {
          requestId: null,
          machineId: mid,
          jobId: jobId || null,
          status: { $in: ["RUNNING"] },
        };

    const record = await MachiningRecord.findOneAndUpdate(
      recordQuery,
      {
        $setOnInsert: {
          requestId: requestId || null,
          machineId: mid,
          jobId: jobId || null,
          bridgePath: bridgePathRaw || null,
          fileName: meta.fileName,
          originalFileName: meta.originalFileName,
          status: "RUNNING",
        },
        $set: {
          startedAt,
          lastTickAt: now,
          percent: percent == null ? null : percent,
          elapsedSeconds,
        },
      },
      { new: true, upsert: true },
    );

    const shouldLogTick = shouldLogMachiningTick({
      machineId: mid,
      jobId,
      requestId,
      bridgePath: bridgePathRaw,
      phase,
      nowMs: now.getTime(),
    });

    if (shouldLogTick) {
      console.log(
        "[bridge:machining:tick]",
        JSON.stringify({
          machineId: mid,
          phase: phase || null,
          elapsedSeconds,
          jobId: jobId || null,
          requestId: requestId || null,
        }),
      );
    }

    try {
      if (phaseUpper === "STARTED") {
        const key = makeStartedEmitKey({
          machineId: mid,
          jobId,
          requestId,
          bridgePath: bridgePathRaw,
        });
        if (shouldEmitStarted(key)) {
          const io = getIO();
          const payload = {
            machineId: mid,
            jobId: jobId || null,
            requestId: requestId || null,
            bridgePath: bridgePathRaw || null,
            startedAt: startedAt,
          };
          console.log(
            "[bridge:machining:emit] cnc-machining-started(from tick)",
            JSON.stringify({
              machineId: mid,
              jobId: jobId || null,
              requestId: requestId || null,
              bridgePath: bridgePathRaw || null,
              phase: phaseUpper,
            }),
          );
          if (jobId) {
            io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-started", payload);
          }
          io.emit("cnc-machining-started", payload);
        }
      }
    } catch {
      // ignore
    }

    if (requestId) {
      const existing = await Request.findOne({ requestId }).select({
        productionSchedule: 1,
        requestId: 1,
      });

      const update = {
        $set: {
          "productionSchedule.machiningProgress": {
            machineId: mid,
            jobId: jobId || null,
            phase: phase || null,
            percent: percent == null ? null : percent,
            message: message || null,
            startedAt,
            lastTickAt: now,
            elapsedSeconds,
          },
        },
      };

      if (!existing?.productionSchedule?.actualMachiningStart) {
        update.$set["productionSchedule.actualMachiningStart"] = startedAt;
      }

      if (record?._id && !existing?.productionSchedule?.machiningRecord) {
        update.$set["productionSchedule.machiningRecord"] = record._id;
      }

      await Request.updateOne({ requestId }, update);
    }

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        requestId: requestId || "",
        phase: phase || null,
        percent,
        message: message || null,
        startedAt,
        elapsedSeconds,
        tickAt: now,
      };
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-tick", payload);
      }
      io.emit("cnc-machining-tick", payload);

      if (phaseUpper === "ALARM") {
        const alarms = await fetchMachineAlarmsFromBridge(mid);
        console.log(
          `[bridge:machining:tick] ALARM detected, emitting cnc-machining-alarm event`,
          {
            machineId: mid,
            requestId: requestId || null,
            message,
            alarms,
          },
        );
        io.emit("cnc-machining-alarm", {
          machineId: mid,
          jobId: jobId || null,
          requestId: requestId || null,
          message: message || null,
          alarms,
          alarmAt: now,
        });
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(
      "[bridge:machining:tick] failed",
      JSON.stringify({
        machineId: mid,
        jobId,
        requestId: requestIdRaw || null,
        bridgePath: bridgePathRaw || null,
        phase: phase || null,
        error: error?.message || String(error),
      }),
    );
    return res.status(500).json({
      success: false,
      message: "machining tick 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function recordMachiningCompleteForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const requestIdRaw = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const bridgePathRaw = req.body?.bridgePath
      ? String(req.body.bridgePath).trim()
      : "";

    const now = new Date();
    let requestId = requestIdRaw;

    requestId = await resolveRequestIdFromDb({
      requestId,
      bridgePath: bridgePathRaw,
    });

    const meta = await resolveJobMetaFromSnapshot({
      machineId: mid,
      jobId,
      bridgePath: bridgePathRaw,
    });

    console.log(
      "[bridge:machining:complete] requestId resolved",
      JSON.stringify({
        machineId: mid,
        requestIdRaw,
        derivedRequestId: requestId,
        bridgePath: bridgePathRaw,
      }),
    );

    if (!requestId && requestIdRaw) {
      console.warn(
        "[bridge:machining:complete] requestIdRaw provided but not matched",
        JSON.stringify({
          machineId: mid,
          requestIdRaw,
          derivedRequestId: requestId,
        }),
      );
    }

    let request = null;
    if (requestId) {
      request = await Request.findOne({ requestId }).populate(
        "requestor",
        "businessAnchorId",
      );
      if (request) {
        const progress = request?.productionSchedule?.machiningProgress || null;
        const startBase =
          progress?.startedAt ||
          request?.productionSchedule?.actualMachiningStart;
        const durationSeconds = startBase
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(startBase).getTime()) / 1000,
              ),
            )
          : 0;

        const recordId = request?.productionSchedule?.machiningRecord || null;
        const record = recordId
          ? await MachiningRecord.findByIdAndUpdate(
              recordId,
              {
                $set: {
                  requestId,
                  machineId: mid,
                  jobId: jobId || null,
                  bridgePath: bridgePathRaw || null,
                  fileName: meta.fileName,
                  originalFileName: meta.originalFileName,
                  status: "COMPLETED",
                  startedAt: startBase ? new Date(startBase) : now,
                  lastTickAt: now,
                  completedAt: now,
                  percent: 100,
                  elapsedSeconds: durationSeconds,
                  durationSeconds,
                },
              },
              { new: true },
            )
          : await MachiningRecord.create({
              requestId,
              machineId: mid,
              jobId: jobId || null,
              bridgePath: bridgePathRaw || null,
              fileName: meta.fileName,
              originalFileName: meta.originalFileName,
              status: "COMPLETED",
              startedAt: startBase ? new Date(startBase) : now,
              lastTickAt: now,
              completedAt: now,
              percent: 100,
              elapsedSeconds: durationSeconds,
              durationSeconds,
            });

        request.productionSchedule = request.productionSchedule || {};
        request.productionSchedule.actualMachiningComplete = now;
        if (!request.productionSchedule.machiningRecord && record?._id) {
          request.productionSchedule.machiningRecord = record._id;
        }

        request.productionSchedule.machiningProgress = {
          ...(progress || {}),
          machineId: mid,
          jobId: jobId || (progress?.jobId ?? null),
          phase: "COMPLETED",
          percent: 100,
          startedAt: startBase ? new Date(startBase) : now,
          lastTickAt: now,
          elapsedSeconds: durationSeconds,
        };

        // CNC 가공 완료 시 제조 단계는 세척/패킹 단계로 전환한다.
        // status/manufacturerStage enum 은 '세척.패킹' 을 사용한다.
        applyStatusMapping(request, "세척.패킹");
        if (!request.mailboxAddress) {
          try {
            const requestorOrgId = String(
              request.businessAnchorId ||
                request.requestor?.businessAnchorId ||
                "",
            ).trim();
            request.mailboxAddress =
              await allocateVirtualMailboxAddress(requestorOrgId);
          } catch (err) {
            console.error("[MAILBOX_ALLOCATION_ERROR]", {
              requestId,
              machineId: mid,
              message: err?.message || String(err),
            });
          }
        }
        await request.save();
        console.log(
          "[bridge:machining:complete] request/record updated",
          JSON.stringify({
            machineId: mid,
            requestId,
            recordId: record?._id,
            stage: "세척.패킹",
          }),
        );
      } else {
        // requestId가 없어도 완료 기록은 남긴다.
        const now = new Date();
        await MachiningRecord.findOneAndUpdate(
          {
            requestId: null,
            machineId: mid,
            jobId: jobId || null,
            status: { $in: ["RUNNING"] },
          },
          {
            $setOnInsert: {
              requestId: null,
              machineId: mid,
              jobId: jobId || null,
              bridgePath: bridgePathRaw || null,
              fileName: meta.fileName,
              originalFileName: meta.originalFileName,
            },
            $set: {
              status: "COMPLETED",
              startedAt: now,
              lastTickAt: now,
              completedAt: now,
              percent: 100,
              durationSeconds: 0,
              elapsedSeconds: 0,
            },
          },
          { upsert: true },
        );
        console.warn(
          "[bridge:machining:complete] missing requestId, record saved",
          JSON.stringify({
            machineId: mid,
            jobId,
            bridgePath: bridgePathRaw,
          }),
        );
      }
    } else {
      const now = new Date();
      const running = await MachiningRecord.findOne({
        requestId: null,
        machineId: mid,
        jobId: jobId || null,
        status: "RUNNING",
      }).select({ startedAt: 1, elapsedSeconds: 1 });

      const startedAt = running?.startedAt ? new Date(running.startedAt) : now;
      const durationSeconds = running?.startedAt
        ? Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000))
        : Math.max(0, Number(running?.elapsedSeconds ?? 0) || 0);

      const completionSet = {
        status: "COMPLETED",
        lastTickAt: now,
        completedAt: now,
        percent: 100,
        durationSeconds,
        elapsedSeconds: durationSeconds,
      };

      await MachiningRecord.findOneAndUpdate(
        {
          requestId: null,
          machineId: mid,
          jobId: jobId || null,
          status: { $in: ["RUNNING"] },
        },
        {
          $setOnInsert: {
            requestId: null,
            machineId: mid,
            jobId: jobId || null,
            bridgePath: bridgePathRaw || null,
            startedAt,
            fileName: meta.fileName,
            originalFileName: meta.originalFileName,
          },
          $set: {
            ...completionSet,
          },
        },
        { upsert: true },
      );
      console.warn(
        "[bridge:machining:complete] missing requestId, record saved",
        JSON.stringify({
          machineId: mid,
          jobId,
          bridgePath: bridgePathRaw,
        }),
      );
    }

    await CncEvent.create({
      requestId: requestId || null,
      machineId: mid,
      sourceStep: "machining",
      status: "success",
      eventType: "MACHINING_COMPLETE",
      message: "OK",
      metadata: { jobId: jobId || null },
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 가공 통계(machiningStats) 누적
    //
    // 정책:
    // - 가공 1건 완료 시 toolNum=0(장비 단위) 통계에 자동 누적한다.
    // - 슬롯 단위(toolNum > 0) 통계는 추후 NC 프로그램 사용 공구 식별이
    //   가능해지면 RecordMachiningJobStats로 별도 호출하여 누적한다.
    // - 실패해도 가공 완료 응답 흐름에는 영향을 주지 않도록 try/catch로 감싼다.
    // ──────────────────────────────────────────────────────────────────────────
    try {
      // MachiningRecord에서 방금 기록된 durationSeconds 조회
      const completedRecord = await MachiningRecord.findOne({
        machineId: mid,
        ...(jobId ? { jobId } : {}),
        status: "COMPLETED",
      })
        .sort({ completedAt: -1 })
        .select({ durationSeconds: 1, elapsedSeconds: 1, completedAt: 1 })
        .lean();

      const recordedDuration =
        Number(completedRecord?.durationSeconds) ||
        Number(completedRecord?.elapsedSeconds) ||
        0;
      const completedAt = completedRecord?.completedAt
        ? new Date(completedRecord.completedAt)
        : now;

      // 장비(toolNum=0) 단위 통계 누적
      const cncMachine = await CncMachine.findOne({ machineId: mid });
      if (cncMachine) {
        const { nextStats } = appendMachiningJobStats({
          existingStats: cncMachine.tooling?.machiningStats,
          toolNum: 0,
          jobDurationSeconds: recordedDuration,
          completedAt,
        });
        cncMachine.tooling = {
          ...(cncMachine.tooling?.toObject?.() || cncMachine.tooling || {}),
          machiningStats: nextStats,
        };
        await cncMachine.save();
      }
    } catch (statsErr) {
      // 통계 집계 실패는 무시 (메인 워크플로우 보호)
      console.warn(
        "[bridge:machining:complete] machiningStats accumulate skipped",
        statsErr?.message || statsErr,
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 완료 후 DB 스냅샷 정리:
    // 1. 방금 완료된 의뢰건 항목 제거 (requestId 우선, 없으면 bridgePath로 제거)
    // 2. 스냅샷에 남아있는 다른 의뢰건 항목도 모두 제거 (requestId 있는 항목 전부)
    //    → 장비 페이지 예약목록에는 수동 업로드 파일(requestId 없음)만 남아야 함
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const machine = await CncMachine.findOne({ machineId: mid }).select(
        "bridgeQueueSnapshot",
      );
      if (machine?.bridgeQueueSnapshot?.jobs) {
        const before = machine.bridgeQueueSnapshot.jobs.length;
        machine.bridgeQueueSnapshot.jobs =
          machine.bridgeQueueSnapshot.jobs.filter((j) => {
            // 방금 완료된 의뢰건 제거
            if (requestId && String(j?.requestId || "") === requestId)
              return false;
            if (!requestId && bridgePathRaw) {
              const p = String(j?.bridgePath || j?.path || "").trim();
              if (p && p === bridgePathRaw) return false;
            }
            // [정책 4.8.2] requestId가 있는 항목은 모두 의뢰건 자동 가공 항목 →
            // 장비 페이지 스냅샷에 포함되면 안 되므로 제거한다
            const jRid = String(j?.requestId || "").trim();
            if (jRid) return false;
            return true;
          });
        if (machine.bridgeQueueSnapshot.jobs.length !== before) {
          machine.bridgeQueueSnapshot.updatedAt = now;
          await machine.save();
          console.log(
            "[bridge:machining:complete] queue trimmed (request_auto items removed)",
            JSON.stringify({
              machineId: mid,
              before,
              after: machine.bridgeQueueSnapshot.jobs.length,
              requestId,
              bridgePath: bridgePathRaw,
            }),
          );
        }
      } else {
        console.warn(
          "[bridge:machining:complete] queue snapshot empty",
          JSON.stringify({
            machineId: mid,
            requestId,
            bridgePath: bridgePathRaw,
          }),
        );
      }
    } catch (e) {
      console.error("Error removing completed job from queue:", e.message);
    }

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        status: "COMPLETED",
        completedAt: now,
        requestId: requestId || null,
        bridgePath: bridgePathRaw || null,
      };
      console.log(
        "[bridge:machining:emit] cnc-machining-completed",
        JSON.stringify({
          machineId: mid,
          jobId: jobId || null,
          requestId: requestId || null,
          bridgePath: bridgePathRaw || null,
        }),
      );
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-completed", payload);
      }
      io.emit("cnc-machining-completed", payload);
    } catch {
      // ignore
    }

    // ...
    try {
      void triggerNextAutoMachiningAfterComplete({
        machineId: mid,
        completedRequestId: requestId || requestIdRaw || "",
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining complete 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function recordMachiningFailForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const requestId = req.body?.requestId
      ? String(req.body.requestId).trim()
      : "";
    const jobId = req.body?.jobId ? String(req.body.jobId).trim() : "";
    const bridgePathRaw = req.body?.bridgePath
      ? String(req.body.bridgePath).trim()
      : "";
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";
    const errorCode = req.body?.errorCode
      ? String(req.body.errorCode).trim()
      : "";
    const alarms = Array.isArray(req.body?.alarms) ? req.body.alarms : [];

    const meta = await resolveJobMetaFromSnapshot({
      machineId: mid,
      jobId,
      bridgePath: bridgePathRaw,
    });
    const now = new Date();

    await CncEvent.create({
      requestId: requestId || null,
      machineId: mid,
      sourceStep: "machining",
      status: "failed",
      eventType: "MACHINING_FAILED",
      message: reason || "FAILED",
      metadata: { jobId: jobId || null, errorCode: errorCode || null, alarms },
    });

    if (requestId) {
      try {
        const request = await Request.findOne({ requestId }).select({
          productionSchedule: 1,
          requestId: 1,
          status: 1,
        });

        const recordId = request?.productionSchedule?.machiningRecord || null;
        const baseUpdate = {
          requestId,
          machineId: mid,
          jobId: jobId || null,
          bridgePath: bridgePathRaw || null,
          fileName: meta.fileName,
          originalFileName: meta.originalFileName,
          status: "FAILED",
          failReason: reason || "FAILED",
          errorCode: errorCode || null,
          alarms,
          completedAt: now,
        };

        const record = recordId
          ? await MachiningRecord.findByIdAndUpdate(
              recordId,
              { $set: baseUpdate },
              { new: true },
            )
          : await MachiningRecord.create(baseUpdate);

        if (
          request &&
          !request.productionSchedule?.machiningRecord &&
          record?._id
        ) {
          await Request.updateOne(
            { requestId },
            { $set: { "productionSchedule.machiningRecord": record._id } },
          );
        }

        await Request.updateOne(
          { requestId },
          {
            $set: {
              "productionSchedule.machiningProgress": {
                machineId: mid,
                jobId: jobId || null,
                phase: "ALARM",
                percent: null,
                message: reason || "FAILED",
                startedAt:
                  request?.productionSchedule?.machiningProgress?.startedAt ||
                  request?.productionSchedule?.actualMachiningStart ||
                  now,
                lastTickAt: now,
                elapsedSeconds:
                  request?.productionSchedule?.machiningProgress
                    ?.elapsedSeconds ?? 0,
              },
            },
          },
        );
      } catch {
        // ignore
      }
    } else {
      try {
        await MachiningRecord.findOneAndUpdate(
          {
            requestId: null,
            machineId: mid,
            jobId: jobId || null,
            status: { $in: ["RUNNING"] },
          },
          {
            $setOnInsert: {
              requestId: null,
              machineId: mid,
              jobId: jobId || null,
              bridgePath: bridgePathRaw || null,
              fileName: meta.fileName,
              originalFileName: meta.originalFileName,
            },
            $set: {
              status: "FAILED",
              failReason: reason || "FAILED",
              errorCode: errorCode || null,
              alarms,
              completedAt: now,
              fileName: meta.fileName,
              originalFileName: meta.originalFileName,
            },
          },
          { upsert: true },
        );
      } catch {
        // ignore
      }
    }

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        requestId: requestId || null,
        bridgePath: bridgePathRaw || null,
        status: "FAILED",
        reason: reason || "FAILED",
        errorCode: errorCode || null,
        alarms,
        failedAt: now,
      };
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-failed", payload);
      }
      io.emit("cnc-machining-failed", payload);
      io.emit("cnc-machining-alarm", {
        machineId: mid,
        jobId: jobId || null,
        requestId: requestId || null,
        message: reason || "FAILED",
        errorCode: errorCode || null,
        alarms,
        alarmAt: now,
      });
    } catch {
      // ignore
    }

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 실패 후 DB 스냅샷에서 의뢰건 항목 제거:
    // 실패 시에도 스냅샷에 requestId 있는 항목이 남으면 장비 페이지가 오염된다.
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const machine = await CncMachine.findOne({ machineId: mid }).select(
        "bridgeQueueSnapshot",
      );
      if (machine?.bridgeQueueSnapshot?.jobs) {
        const before = machine.bridgeQueueSnapshot.jobs.length;
        machine.bridgeQueueSnapshot.jobs =
          machine.bridgeQueueSnapshot.jobs.filter((j) => {
            const jRid = String(j?.requestId || "").trim();
            return !jRid;
          });
        if (machine.bridgeQueueSnapshot.jobs.length !== before) {
          machine.bridgeQueueSnapshot.updatedAt = now;
          await machine.save();
          console.log(
            "[bridge:machining:fail] request_auto items removed from snapshot",
            JSON.stringify({
              machineId: mid,
              before,
              after: machine.bridgeQueueSnapshot.jobs.length,
            }),
          );
        }
      }
    } catch (e) {
      console.error(
        "[bridge:machining:fail] Error removing request items from queue:",
        e.message,
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // [정책 4.8.2] 알람 fail 후 다음 의뢰건 자동 가공 트리거:
    // 알람/실패로 현재 job이 종료된 후 다음 대기 의뢰건이 있으면 트리거.
    // triggerNextAutoMachiningAfterComplete 내부에서 장비 알람 체크를 수행하므로
    // 알람 미해제 상태면 자동으로 skip된다.
    // ──────────────────────────────────────────────────────────────────────────
    try {
      void triggerNextAutoMachiningAfterComplete({
        machineId: mid,
        completedRequestId: requestId || "",
      });
    } catch {
      // ignore: fire-and-forget
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining fail 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function cancelMachiningForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const now = new Date();

    // requestId를 못 받아도(Stop 버튼 등) machineId 기준 RUNNING record를 마감한다.
    const record = await MachiningRecord.findOne({
      machineId: mid,
      status: "RUNNING",
    }).sort({ startedAt: -1, createdAt: -1 });

    if (!record?._id) {
      return res.status(200).json({ success: true, data: { updated: false } });
    }

    const startedAt = record.startedAt ? new Date(record.startedAt) : null;
    const durationSeconds = startedAt
      ? Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000))
      : record.elapsedSeconds != null
        ? Math.max(0, Number(record.elapsedSeconds) || 0)
        : 0;

    record.status = "CANCELED";
    record.completedAt = now;
    record.lastTickAt = record.lastTickAt || now;
    record.durationSeconds = record.durationSeconds ?? durationSeconds;
    record.elapsedSeconds = record.elapsedSeconds ?? durationSeconds;
    record.failReason = record.failReason || "USER_STOP";

    try {
      if (!record.fileName || !record.originalFileName) {
        const meta = await resolveJobMetaFromSnapshot({
          machineId: mid,
          jobId: String(record.jobId || "").trim(),
          bridgePath: String(record.bridgePath || "").trim(),
        });
        record.fileName = record.fileName || meta.fileName;
        record.originalFileName =
          record.originalFileName || meta.originalFileName;
      }
    } catch {
      // ignore
    }
    await record.save();

    const requestId = String(record.requestId || "").trim();
    if (requestId) {
      await Request.updateOne(
        { requestId },
        {
          $set: {
            "productionSchedule.actualMachiningComplete": now,
            "productionSchedule.machiningProgress.phase": "CANCELED",
            "productionSchedule.machiningProgress.lastTickAt": now,
            "productionSchedule.machiningProgress.elapsedSeconds":
              durationSeconds,
          },
        },
      );
    }

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: String(record.jobId || "") || null,
        requestId: requestId || null,
        status: "CANCELED",
        canceledAt: now,
        durationSeconds,
      };
      if (payload.jobId) {
        io.to(`cnc:${mid}:${payload.jobId}`).emit(
          "cnc-machining-canceled",
          payload,
        );
      }
      io.emit("cnc-machining-canceled", payload);
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      data: {
        updated: true,
        recordId: record._id,
        requestId: requestId || null,
        status: record.status,
        durationSeconds,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "machining cancel 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
