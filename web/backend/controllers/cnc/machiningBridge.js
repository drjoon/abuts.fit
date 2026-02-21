import Request from "../../models/request.model.js";
import CncEvent from "../../models/cncEvent.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import MachiningRecord from "../../models/machiningRecord.model.js";
import { getIO } from "../../socket.js";
import {
  applyStatusMapping,
  ensureFinishedLotNumberForPackaging,
  ensureLotNumberForMachining,
  normalizeRequestForResponse,
} from "../../controllers/requests/utils.js";
import Machine from "../../models/machine.model.js";
import {
  BRIDGE_BASE,
  withBridgeHeaders,
  fetchBridgeQueueFromBridge,
  saveBridgeQueueSnapshot,
} from "./shared.js";

const REQUEST_ID_REGEX = /(\d{8}-[A-Z0-9]{6,10})/i;

const STARTED_EMIT_TTL_MS = 30 * 1000;
const startedEmitCache = new Map();

function makeStartedEmitKey({ machineId, jobId, requestId, bridgePath }) {
  return [
    String(machineId || "").trim(),
    String(jobId || "").trim(),
    String(requestId || "").trim(),
    String(bridgePath || "").trim(),
  ].join("|");
}

export async function getCompletedMachiningRecords(req, res) {
  try {
    const machineId = String(req.query.machineId || "").trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(50, Math.max(1, limitRaw))
      : 5;
    const cursor = String(req.query.cursor || "").trim();

    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const query = {
      machineId,
      status: "COMPLETED",
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

    const recs = await MachiningRecord.find(query)
      .sort({ completedAt: -1, _id: -1 })
      .limit(limit + 1)
      .select(
        "requestId jobId status completedAt durationSeconds displayLabel lotNumber clinicName patientName tooth",
      )
      .lean();

    const slice = recs.slice(0, limit);
    const hasMore = recs.length > limit;

    const requestIds = slice
      .map((r) => String(r?.requestId || "").trim())
      .filter(Boolean);
    const uniqueRequestIds = Array.from(new Set(requestIds));

    // request 정보 병합 (lotNumber, clinic/patient/tooth)
    const reqDocs = await Request.find({
      requestId: { $in: uniqueRequestIds },
    })
      .select(
        "requestId lotNumber caseInfos.clinicName caseInfos.patientName caseInfos.tooth",
      )
      .lean();
    const reqMap = new Map(
      (Array.isArray(reqDocs) ? reqDocs : [])
        .map((doc) => [String(doc?.requestId || "").trim(), doc])
        .filter(([k]) => !!k),
    );

    const merged = slice.map((r) => {
      const req = reqMap.get(String(r?.requestId || "").trim());
      return {
        ...r,
        lotNumber: req?.lotNumber || r?.lotNumber || {},
        clinicName: req?.caseInfos?.clinicName || r?.clinicName,
        patientName: req?.caseInfos?.patientName || r?.patientName,
        tooth: req?.caseInfos?.tooth || r?.tooth,
      };
    });

    const items = merged.map((r) => {
      const rid = String(r?.requestId || "").trim();
      const displayLabel = formatRequestLabelForCompleted(r, rid);
      return {
        id: String(r?._id || ""),
        machineId: String(r?.machineId || "").trim(),
        requestId: rid || null,
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
        displayLabel: String(displayLabel || "").trim() || null,
        lotNumber: r?.lotNumber || null,
        clinicName: r?.clinicName || null,
        patientName: r?.patientName || null,
        tooth: r?.tooth || null,
      };
    });

    const last = slice[slice.length - 1] || null;
    const nextCursor =
      hasMore && last?.completedAt
        ? `${new Date(last.completedAt).toISOString()}|${String(last._id)}`
        : null;

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
  const lotPartRaw = String(reqDoc?.lotNumber?.part || "").trim();
  const lotPart = lotPartRaw.replace(/^CAP/i, "").replace(/-/g, " ").trim();
  const ridSuffix = rid.includes("-") ? rid.split("-").pop() || rid : rid;

  const parts = [clinicName, patientName, tooth, lotPart, ridSuffix]
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  if (parts.length) return parts.join(" ");
  if (rid) return `의뢰 (${rid})`;
  return "-";
}

export async function getLastCompletedMachiningMap(req, res) {
  try {
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
    })
      .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(200)
      .lean();

    const byMachine = new Map();
    for (const r of Array.isArray(recs) ? recs : []) {
      const mid = String(r?.machineId || "").trim();
      if (!mid) continue;
      if (byMachine.has(mid)) continue;
      byMachine.set(mid, r);
    }

    const requestIds = Array.from(byMachine.values())
      .map((r) => String(r?.requestId || "").trim())
      .filter(Boolean);
    const uniqueRequestIds = Array.from(new Set(requestIds));

    const reqDocs = uniqueRequestIds.length
      ? await Request.find({ requestId: { $in: uniqueRequestIds } })
          .select(
            "requestId lotNumber caseInfos.clinicName caseInfos.patientName caseInfos.tooth",
          )
          .lean()
      : [];
    const reqById = new Map();
    for (const r of Array.isArray(reqDocs) ? reqDocs : []) {
      const rid = String(r?.requestId || "").trim();
      if (rid) reqById.set(rid, r);
    }

    const data = {};
    for (const mid of machineIds) {
      const rec = byMachine.get(mid) || null;
      if (!rec) continue;

      const rid = String(rec?.requestId || "").trim();
      const reqDoc = rid ? reqById.get(rid) : null;
      const displayLabel = formatRequestLabelForCompleted(reqDoc, rid);
      const clinicName = reqDoc?.caseInfos?.clinicName
        ? String(reqDoc.caseInfos.clinicName).trim()
        : "";
      const patientName = reqDoc?.caseInfos?.patientName
        ? String(reqDoc.caseInfos.patientName).trim()
        : "";
      const tooth = reqDoc?.caseInfos?.tooth
        ? String(reqDoc.caseInfos.tooth).trim()
        : "";
      const lotPart = reqDoc?.lotNumber?.part
        ? String(reqDoc.lotNumber.part).trim()
        : "";
      const lotFinal = reqDoc?.lotNumber?.final
        ? String(reqDoc.lotNumber.final).trim()
        : "";
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
        requestId: rid || null,
        displayLabel: String(displayLabel || "").trim() || null,
        clinicName,
        patientName,
        tooth,
        lotNumber: {
          part: lotPart || undefined,
          final: lotFinal || undefined,
        },
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

async function triggerNextAutoMachiningAfterComplete({
  machineId,
  completedRequestId,
}) {
  const mid = String(machineId || "").trim();
  if (!mid) return;

  try {
    const m = await Machine.findOne({ $or: [{ uid: mid }, { name: mid }] })
      .select({ allowAutoMachining: 1 })
      .lean()
      .catch(() => null);
    if (m?.allowAutoMachining !== true) return;

    const pending = await Request.find({
      status: { $in: ["CAM", "가공", "생산"] },
      "productionSchedule.assignedMachine": mid,
    })
      .sort({ "productionSchedule.queuePosition": 1, updatedAt: 1 })
      .limit(3)
      .lean();

    const pick = (Array.isArray(pending) ? pending : []).find((r) => {
      const rid = String(r?.requestId || "").trim();
      if (!rid) return false;
      if (completedRequestId && rid === completedRequestId) return false;
      const path = String(r?.caseInfos?.ncFile?.filePath || "").trim();
      return !!path;
    });
    if (!pick) return;

    const requestId = String(pick.requestId || "").trim();
    const bridgePath = String(pick?.caseInfos?.ncFile?.filePath || "").trim();
    const rawFileName = String(pick?.caseInfos?.ncFile?.fileName || "").trim();
    const derivedFileName = bridgePath ? bridgePath.split(/[/\\]/).pop() : "";
    const fileName = rawFileName || derivedFileName;
    if (!fileName || !bridgePath) return;

    const base =
      process.env.BRIDGE_NODE_URL ||
      process.env.BRIDGE_PROCESS_BASE ||
      process.env.CNC_BRIDGE_BASE ||
      process.env.BRIDGE_BASE ||
      BRIDGE_BASE;
    if (!base) return;
    const base0 = String(base).replace(/\/$/, "");

    // if job already exists in bridge queue but paused, unpause it.
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
      const found = list.find((j) => {
        const rid = String(j?.requestId || "").trim();
        if (rid && rid === requestId) return true;
        const p = String(j?.bridgePath || "").trim();
        if (p && bridgePath && p === bridgePath) return true;
        return false;
      });
      if (found?.id && found?.paused === true) {
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
        return;
      }
      if (found?.id) {
        return;
      }
    } catch {
      // ignore and try process-file
    }

    const triggerUrl = `${base0}/api/bridge/process-file`;
    const triggerResp = await fetch(triggerUrl, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        fileName: fileName || null,
        requestId,
        machineId: mid,
        bridgePath: bridgePath || null,
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

    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore
    }
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

    console.log(
      "[bridge:machining:tick] incoming",
      JSON.stringify({
        machineId: mid,
        jobId,
        requestId: requestIdRaw,
        bridgePath: bridgePathRaw,
        phase,
        percent,
      }),
    );

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
    console.log(
      "[bridge:machining:tick] resolved requestId",
      JSON.stringify({
        machineId: mid,
        jobId,
        requestId,
        bridgePath: bridgePathRaw,
      }),
    );

    const now = new Date();
    let elapsedSeconds = 0;
    let startedAt = now;

    const phaseUpper = String(phase || "")
      .trim()
      .toUpperCase();

    let existing = null;

    if (requestId) {
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

    console.log(
      "[bridge:machining:tick] updated record",
      JSON.stringify({
        machineId: mid,
        requestId: requestId || null,
        recordId: record?._id,
        startedAt,
        elapsedSeconds,
        phase,
        percent,
      }),
    );

    try {
      const io = getIO();
      const payload = {
        machineId: mid,
        jobId: jobId || null,
        requestId: requestId || "",
        phase: phase || null,
        percent,
        startedAt,
        elapsedSeconds,
        tickAt: now,
      };
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-tick", payload);
      }
      io.emit("cnc-machining-tick", payload);
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true });
  } catch (error) {
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
      request = await Request.findOne({ requestId });
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
          JSON.stringify({ machineId: mid, jobId, bridgePath: bridgePathRaw }),
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
        JSON.stringify({ machineId: mid, jobId, bridgePath: bridgePathRaw }),
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

    // 완료된 작업을 DB 큐에서 제거 (requestId 우선, 없으면 bridgePath로 제거)
    try {
      const machine = await CncMachine.findOne({ machineId: mid }).select(
        "bridgeQueueSnapshot",
      );
      if (machine?.bridgeQueueSnapshot?.jobs) {
        const before = machine.bridgeQueueSnapshot.jobs.length;
        machine.bridgeQueueSnapshot.jobs =
          machine.bridgeQueueSnapshot.jobs.filter((j) => {
            if (requestId && String(j?.requestId || "") === requestId)
              return false;
            if (!requestId && bridgePathRaw) {
              const p = String(j?.bridgePath || j?.path || "").trim();
              if (p && p === bridgePathRaw) return false;
            }
            return true;
          });
        if (machine.bridgeQueueSnapshot.jobs.length !== before) {
          machine.bridgeQueueSnapshot.updatedAt = now;
          await machine.save();
          console.log(
            "[bridge:machining:complete] queue trimmed",
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
      if (jobId) {
        io.to(`cnc:${mid}:${jobId}`).emit("cnc-machining-completed", payload);
      }
      io.emit("cnc-machining-completed", payload);
    } catch {
      // ignore
    }

    // 완료 이후 다음 작업 자동 트리거(베스트 에포트)
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
    const alarms = Array.isArray(req.body?.alarms) ? req.body.alarms : [];

    const meta = await resolveJobMetaFromSnapshot({
      machineId: mid,
      jobId,
      bridgePath: bridgePathRaw,
    });

    await CncEvent.create({
      requestId: requestId || null,
      machineId: mid,
      sourceStep: "machining",
      status: "failed",
      eventType: "MACHINING_FAILED",
      message: reason || "FAILED",
      metadata: { jobId: jobId || null, alarms },
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
          alarms,
          completedAt: new Date(),
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
              alarms,
              completedAt: new Date(),
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
