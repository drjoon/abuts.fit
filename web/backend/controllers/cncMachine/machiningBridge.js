import Request from "../../models/request.model.js";
import CncEvent from "../../models/cncEvent.model.js";
import CncMachine from "../../models/cncMachine.model.js";
import MachiningRecord from "../../models/machiningRecord.model.js";
import { getIO } from "../../socket.js";
import { applyStatusMapping } from "../request/utils.js";

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
      }
    } catch {
      // ignore
    }

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

        applyStatusMapping(request, "세척.포장");
        await request.save();
        console.log(
          "[bridge:machining:complete] request/record updated",
          JSON.stringify({
            machineId: mid,
            requestId,
            recordId: record?._id,
            stage: "세척.포장",
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
          },
          $set: {
            status: "COMPLETED",
            startedAt,
            lastTickAt: now,
            completedAt: now,
            percent: 100,
            durationSeconds,
            elapsedSeconds: durationSeconds,
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
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";
    const alarms = Array.isArray(req.body?.alarms) ? req.body.alarms : [];

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
            },
            $set: {
              status: "FAILED",
              failReason: reason || "FAILED",
              alarms,
              completedAt: new Date(),
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
