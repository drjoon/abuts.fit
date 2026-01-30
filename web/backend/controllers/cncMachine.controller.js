import CncMachine from "../models/cncMachine.model.js";
import Machine from "../models/machine.model.js";
import Request from "../models/request.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import { getPresignedGetUrl, getPresignedPutUrl } from "../utils/s3.utils.js";
import {
  getTodayYmdInKst,
  isKoreanBusinessDay,
} from "../utils/krBusinessDays.js";
import {
  getAllProductionQueues,
  recalculateQueueOnMaterialChange,
} from "./request/production.utils.js";

const CAM_RETRY_BATCH_LIMIT = Number(process.env.CAM_RETRY_BATCH_LIMIT || 30);

const toNumberOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const BRIDGE_BASE = process.env.BRIDGE_BASE || "http://localhost:8002";
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

export async function updateBridgeQueueJobPause(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const paused = req.body?.paused === true;
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const nextJobs = jobs.map((j) => {
      if (!j?.id) return j;
      return String(j.id) === jid ? { ...j, paused } : j;
    });
    await saveBridgeQueueSnapshot(mid, nextJobs);

    // 브리지 동기화 best-effort
    try {
      const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
        mid,
      )}/${encodeURIComponent(jid)}/pause`;
      await fetch(url, {
        method: "PATCH",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ paused }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: { paused } });
  } catch (error) {
    console.error("Error in updateBridgeQueueJobPause:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 일시정지 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function enqueueBridgeManualInsertJob(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const s3Key = String(req.body?.s3Key || "").trim();
    const s3Bucket = String(req.body?.s3Bucket || "").trim();
    if (!fileName || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileName and s3Key are required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      requestId: null,
      bridgePath: null,
      s3Key,
      s3Bucket: s3Bucket || null,
      enqueueFront: true,
    };

    // 0) DB(SSOT) 스냅샷에 먼저 반영: manual_insert는 Next Up 직전(큐 맨 앞)으로 취급한다.
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const rest = jobs0.filter(
      (j) => String(j?.source || "") !== "manual_insert",
    );
    const jobId = `${mid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const manualJob = {
      id: jobId,
      kind: "File",
      fileName,
      bridgePath: "",
      s3Key,
      s3Bucket: s3Bucket || "",
      fileSize: null,
      contentType: "",
      requestId: "",
      programNo: null,
      programName: "",
      qty: 1,
      createdAtUtc: new Date(),
      source: "manual_insert",
      paused: false,
    };
    await saveBridgeQueueSnapshot(mid, [manualJob, ...rest]);

    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 수동 끼워넣기 enqueue 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        jobId,
        machineId: mid,
        fileName,
        s3Key,
        s3Bucket: s3Bucket || null,
      },
    });
  } catch (error) {
    console.error("Error in enqueueBridgeManualInsertJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 수동 끼워넣기 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function fetchBridgeMachineStatusMap() {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.BRIDGE_STATUS_TIMEOUT_MS || 2500);
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(
      `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/status`,
      {
        method: "GET",
        headers: withBridgeHeaders(),
        signal: controller.signal,
      },
    );
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) return null;
    const list = Array.isArray(body?.data) ? body.data : [];
    const map = new Map();
    for (const item of list) {
      const id = String(item?.machineId || item?.id || "").trim();
      if (!id) continue;
      map.set(id, item);
    }
    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function isBridgeOnlineStatus(status) {
  const s = String(status || "")
    .trim()
    .toUpperCase();
  return ["OK", "ONLINE", "RUN", "RUNNING", "IDLE", "STOP"].includes(s);
}

/**
 * 브리지 예약 큐 배치 업데이트 (머신별)
 * - body: {
 *    order?: string[],
 *    qtyUpdates?: { jobId: string, qty: number }[],
 *    deleteJobIds?: string[],
 *    clear?: boolean,
 *  }
 */
export async function applyBridgeQueueBatchForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const clear = req.body?.clear === true;
    const orderRaw = req.body?.order;
    const order = Array.isArray(orderRaw)
      ? orderRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : null;

    const qtyRaw = req.body?.qtyUpdates;
    const qtyUpdates = Array.isArray(qtyRaw)
      ? qtyRaw
          .map((u) => {
            if (!u) return null;
            const jobId = String(u.jobId || u.id || "").trim();
            if (!jobId) return null;
            const qty = Math.max(1, Number(u.qty ?? 1) || 1);
            return { jobId, qty };
          })
          .filter(Boolean)
      : [];

    const delRaw = req.body?.deleteJobIds;
    const deleteJobIds = Array.isArray(delRaw)
      ? delRaw.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs0 = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];

    let jobs = clear ? [] : jobs0;

    // delete first (so reorder/qty doesn't include deleted)
    let removedJobs = [];
    if (!clear && deleteJobIds.length > 0) {
      const delSet = new Set(deleteJobIds);
      removedJobs = jobs.filter((j) => delSet.has(String(j?.id || "")));
      jobs = jobs.filter((j) => !delSet.has(String(j?.id || "")));
    }

    // qty updates
    if (!clear && qtyUpdates.length > 0) {
      const qtyMap = new Map(qtyUpdates.map((u) => [u.jobId, u.qty]));
      jobs = jobs.map((j) => {
        const id = String(j?.id || "");
        if (!id) return j;
        if (!qtyMap.has(id)) return j;
        return { ...j, qty: qtyMap.get(id) };
      });
    }

    // reorder
    if (!clear && order && order.length > 0) {
      const jobById = new Map();
      for (const j of jobs) {
        if (j?.id) jobById.set(String(j.id), j);
      }

      const reordered = [];
      for (const id of order) {
        const j = jobById.get(id);
        if (j) reordered.push(j);
      }
      for (const j of jobs) {
        if (!j?.id) continue;
        if (!order.includes(String(j.id))) reordered.push(j);
      }
      jobs = reordered;
    }

    await saveBridgeQueueSnapshot(mid, jobs);

    // 브리지 동기화 best-effort
    try {
      if (clear) {
        const clearUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/clear`;
        await fetch(clearUrl, {
          method: "POST",
          headers: withBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ machineId: mid }),
        });
      } else {
        if (order && order.length > 0) {
          const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/reorder`;
          await fetch(url, {
            method: "POST",
            headers: withBridgeHeaders({
              "Content-Type": "application/json",
            }),
            body: JSON.stringify({ machineId: mid, order }),
          });
        }

        for (const u of qtyUpdates) {
          try {
            const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
              mid,
            )}/${encodeURIComponent(u.jobId)}/qty`;
            await fetch(url, {
              method: "PATCH",
              headers: withBridgeHeaders({
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ qty: u.qty }),
            });
          } catch {
            // ignore
          }
        }

        for (const jid of deleteJobIds) {
          try {
            const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/${encodeURIComponent(
              mid,
            )}/${encodeURIComponent(jid)}`;
            await fetch(url, {
              method: "DELETE",
              headers: withBridgeHeaders(),
            });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    // 삭제된 항목의 requestId는 CAM 단계로 롤백
    const uniqueRequestIds = new Set();
    for (const r of removedJobs) {
      const rid = String(r?.requestId || "").trim();
      if (rid) uniqueRequestIds.add(rid);
    }
    const rolledBack = [];
    for (const rid of uniqueRequestIds) {
      const rr = await rollbackRequestToCamByRequestId(rid);
      if (rr?._id) rolledBack.push(String(rr._id));
    }

    return res.status(200).json({
      success: true,
      data: {
        jobs,
        rolledBackRequestIds: rolledBack,
      },
    });
  } catch (error) {
    console.error("Error in applyBridgeQueueBatchForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 배치 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

function normalizeCncProgramFileName(name) {
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

function sanitizeS3KeySegment(name) {
  const raw = String(name || "")
    .trim()
    .normalize("NFC");
  if (!raw) return "";
  return raw.replace(/[\\/]/g, "_");
}

function parseProgramNoFromFileName(fileName) {
  const upper = String(fileName || "")
    .toUpperCase()
    .trim();
  const m = upper.match(/^O(\d{1,5})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function saveBridgeQueueSnapshot(machineId, jobs) {
  const mid = String(machineId || "").trim();
  if (!mid) return null;

  const safeJobs = Array.isArray(jobs)
    ? jobs
        .map((j) => {
          if (!j || typeof j !== "object") return null;
          return {
            id: j.id != null ? String(j.id).trim() : "",
            kind: j.kind != null ? String(j.kind).trim() : "",
            fileName: j.fileName != null ? String(j.fileName).trim() : "",
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
          };
        })
        .filter(Boolean)
    : [];

  const now = new Date();
  const updated = await getOrCreateCncMachine(mid, {
    bridgeQueueSnapshot: {
      jobs: safeJobs,
      updatedAt: now,
    },
    bridgeQueueSyncedAt: now,
  });

  // 이벤트 드리븐: DB(SSOT) 변경 시 브리지로 즉시 push (best-effort)
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

async function getDbBridgeQueueSnapshot(machineId) {
  const mid = String(machineId || "").trim();
  if (!mid) return { jobs: [], updatedAt: null, syncedAt: null };
  const machine = await CncMachine.findOne({ machineId: mid })
    .select("bridgeQueueSnapshot bridgeQueueSyncedAt")
    .lean();
  const snapshot = machine?.bridgeQueueSnapshot || null;
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt) : null;
  const syncedAt = machine?.bridgeQueueSyncedAt
    ? new Date(machine.bridgeQueueSyncedAt)
    : null;
  return { jobs, updatedAt, syncedAt };
}

async function fetchBridgeQueueFromBridge(machineId) {
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

/**
 * CNC(3-direct) 업로드용 presigned PUT URL 발급 (제조사 인증 기반)
 * - 파일은 S3에 업로드하고, DB에는 메타만 저장한다.
 */
export async function createCncDirectUploadPresign(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const rawName = String(req.body?.fileName || "").trim();
    const fileName = rawName;
    if (!fileName) {
      return res
        .status(400)
        .json({ success: false, message: "fileName is required" });
    }

    const contentType = String(
      req.body?.contentType || "application/octet-stream",
    ).trim();
    const fileSize = Number(req.body?.fileSize || 0);

    const safeName = sanitizeS3KeySegment(fileName);
    const key = `bg/3-direct/${mid}/${safeName}`;
    const presign = await getPresignedPutUrl(key, contentType, 3600);

    return res.status(200).json({
      success: true,
      data: {
        uploadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        fileName,
        contentType,
        fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectUploadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 제조사용: CNC(3-direct) 다운로드 presigned GET URL 발급
 */
export async function createCncDirectDownloadPresign(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const s3Key = String(req.query?.s3Key || req.body?.s3Key || "").trim();
    if (!s3Key) {
      return res
        .status(400)
        .json({ success: false, message: "s3Key is required" });
    }

    const expiresIn = Math.max(
      60,
      Math.min(3600, Number(req.query?.expiresIn || 300)),
    );
    const presign = await getPresignedGetUrl(s3Key, expiresIn);

    return res.status(200).json({
      success: true,
      data: {
        downloadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        expiresIn,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectDownloadPresign:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 서버용: CNC(3-direct) 다운로드 presigned GET URL 발급
 * - 브리지는 AWS 자격증명을 갖지 않으므로, 백엔드가 presigned URL을 발급한다.
 * - 보안은 bridgeSecret/ipAllowlist 미들웨어로 처리한다.
 */
export async function createCncDirectDownloadPresignForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const s3Key = String(req.query?.s3Key || req.body?.s3Key || "").trim();
    if (!s3Key) {
      return res.status(400).json({
        success: false,
        message: "s3Key is required",
      });
    }

    const expiresIn = Math.max(
      60,
      Math.min(3600, Number(req.query?.expiresIn || 300)),
    );
    const presign = await getPresignedGetUrl(s3Key, expiresIn);

    return res.status(200).json({
      success: true,
      data: {
        downloadUrl: presign.url,
        s3Key: presign.key,
        s3Bucket: presign.bucket,
        expiresIn,
      },
    });
  } catch (error) {
    console.error("Error in createCncDirectDownloadPresignForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "CNC download presign 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * CNC(3-direct) 예약목록(DB) enqueue
 * - 브리지 서버가 다운이어도 동작해야 하므로 브리지를 호출하지 않는다.
 */
export async function enqueueCncDirectToDb(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res
        .status(400)
        .json({ success: false, message: "machineId is required" });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const s3Key = String(req.body?.s3Key || "").trim();
    const s3Bucket = String(req.body?.s3Bucket || "").trim();
    const contentType = String(req.body?.contentType || "").trim();
    const fileSize = Number(req.body?.fileSize || 0);
    const qty = Math.max(1, Number(req.body?.qty ?? 1) || 1);
    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";

    if (!fileName || !s3Key) {
      return res.status(400).json({
        success: false,
        message: "fileName and s3Key are required",
      });
    }

    const now = new Date();
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const jobId = `${mid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

    jobs.push({
      id: jobId,
      kind: "file",
      fileName,
      bridgePath: `${mid}/${fileName}`,
      s3Key,
      s3Bucket: s3Bucket || process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
      fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
      contentType: contentType || "application/octet-stream",
      requestId: requestId || "",
      programNo: null,
      programName: "",
      qty,
      createdAtUtc: now,
      source: "manual_upload",
    });

    await saveBridgeQueueSnapshot(mid, jobs);

    return res.status(200).json({
      success: true,
      data: { jobId, fileName },
    });
  } catch (error) {
    console.error("Error in enqueueCncDirectToDb:", error);
    return res.status(500).json({
      success: false,
      message: "DB 예약목록 등록 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function enqueueBridgeContinuousJob(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const fileName = String(req.body?.fileName || "").trim();
    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";
    const bridgePathRaw = req.body?.bridgePath;
    const bridgePath =
      bridgePathRaw != null ? String(bridgePathRaw).trim() : "";
    const enqueueFront = req.body?.enqueueFront === true;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "fileName is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      requestId: requestId || null,
      bridgePath: bridgePath || null,
      enqueueFront,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      });
    }

    // 브리지 enqueue 성공 시에만 DB 스냅샷 갱신
    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore: enqueue 응답 자체는 성공 유지
    }

    return res.status(200).json({ success: true, data: body?.data ?? body });
  } catch (error) {
    console.error("Error in enqueueBridgeContinuousJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function enqueueBridgeContinuousJobFromDb(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const requestIdRaw = req.body?.requestId;
    const requestId = requestIdRaw != null ? String(requestIdRaw).trim() : "";
    if (!requestId) {
      return res.status(400).json({
        success: false,
        message: "requestId is required",
      });
    }

    const reqDoc = await Request.findOne({ requestId })
      .select("requestId caseInfos.ncFile")
      .lean();
    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: "request not found",
      });
    }

    const bridgePath = String(reqDoc?.caseInfos?.ncFile?.filePath || "").trim();
    const rawFileName = String(
      reqDoc?.caseInfos?.ncFile?.fileName || "",
    ).trim();
    const derivedFileName = bridgePath
      ? String(bridgePath).split(/[/\\]/).pop()
      : "";
    const fileName = rawFileName || derivedFileName;

    if (!fileName || !bridgePath) {
      return res.status(400).json({
        success: false,
        message:
          "NC 파일 정보(fileName/filePath)가 없어 enqueue 할 수 없습니다.",
      });
    }

    // UI 표시용: preload 상태를 UPLOADING으로 기록 (실제 READY/FAILED는 브리지 콜백으로 갱신)
    try {
      await Request.updateOne(
        { requestId },
        {
          $set: {
            "productionSchedule.ncPreload": {
              status: "UPLOADING",
              machineId: mid,
              bridgePath,
              updatedAt: new Date(),
              error: null,
            },
          },
        },
      );
    } catch (e) {
      console.warn("enqueue-from-db ncPreload UPLOADING update failed", e);
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/enqueue`;

    const payload = {
      fileName,
      requestId,
      bridgePath,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      try {
        await Request.updateOne(
          { requestId },
          {
            $set: {
              "productionSchedule.ncPreload": {
                status: "FAILED",
                machineId: mid,
                bridgePath,
                updatedAt: new Date(),
                error:
                  body?.message ||
                  body?.error ||
                  `bridge enqueue failed (status=${resp.status})`,
              },
            },
          },
        );
      } catch (e2) {
        console.warn("enqueue-from-db ncPreload FAILED update failed", e2);
      }

      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      });
    }

    // 브리지 enqueue 성공 시에만 DB 스냅샷 갱신 (best-effort)
    try {
      const q = await fetchBridgeQueueFromBridge(mid);
      if (q.ok) {
        await saveBridgeQueueSnapshot(mid, q.jobs);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({
      success: true,
      data: {
        requestId,
        fileName,
        bridgePath,
        bridge: body?.data ?? body,
      },
    });
  } catch (error) {
    console.error("Error in enqueueBridgeContinuousJobFromDb:", error);
    return res.status(500).json({
      success: false,
      message: "DB 기반 브리지 연속 가공 enqueue 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getBridgeContinuousState(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/cnc/machines/${encodeURIComponent(
      mid,
    )}/continuous/state`;

    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 연속 가공 상태 조회 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({ success: true, data: body?.data ?? body });
  } catch (error) {
    console.error("Error in getBridgeContinuousState:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 연속 가공 상태 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function getOrCreateCncMachine(machineId, extraSet = {}) {
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

/**
 * 브리지 예약 큐 조회 (머신별)
 */
export async function getBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    // DB를 단일 소스로 사용한다. (브리지 서버 다운이어도 조회 가능)
    const snap = await getDbBridgeQueueSnapshot(mid);
    return res.status(200).json({
      success: true,
      data: snap.jobs,
      meta: {
        source: "db",
        updatedAt: snap.updatedAt ? snap.updatedAt.toISOString() : null,
        syncedAt: snap.syncedAt ? snap.syncedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Error in getBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 서버 전용: DB에 저장된 큐 스냅샷 조회
 */
export async function getDbBridgeQueueSnapshotForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);
    return res.status(200).json({
      success: true,
      data: snap.jobs,
      meta: {
        source: "db",
        updatedAt: snap.updatedAt ? snap.updatedAt.toISOString() : null,
        syncedAt: snap.syncedAt ? snap.syncedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Error in getDbBridgeQueueSnapshotForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "DB 예약 큐 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 예약 큐 재정렬 (머신별)
 * - body: { order: string[] }
 */
export async function reorderBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const orderRaw = req.body?.order;
    const order = Array.isArray(orderRaw)
      ? orderRaw.map((v) => String(v || "").trim()).filter((v) => !!v)
      : [];

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const idOrder =
      order.length > 0 ? order : jobs.map((j) => j?.id).filter(Boolean);

    const jobById = new Map();
    for (const j of jobs) {
      if (j?.id) jobById.set(String(j.id), j);
    }

    const reordered = [];
    for (const id of idOrder) {
      const j = jobById.get(id);
      if (j) reordered.push(j);
    }
    // 누락된 항목은 뒤에 유지
    for (const j of jobs) {
      if (!j?.id) continue;
      if (!idOrder.includes(String(j.id))) reordered.push(j);
    }

    await saveBridgeQueueSnapshot(mid, reordered);

    // 브리지 동기화는 best-effort (실패해도 성공 유지)
    try {
      const url = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/reorder`;
      await fetch(url, {
        method: "POST",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          machineId: mid,
          order: reordered.map((j) => j.id),
        }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: reordered });
  } catch (error) {
    console.error("Error in reorderBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 재정렬 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 예약 큐 작업 수량(qty) 변경 (머신별)
 * - body: { qty: number }
 */
export async function updateBridgeQueueJobQty(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();
    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const qty = Math.max(1, Number(req.body?.qty ?? 1) || 1);

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const nextJobs = jobs.map((j) => {
      if (!j?.id) return j;
      return String(j.id) === jid ? { ...j, qty } : j;
    });

    await saveBridgeQueueSnapshot(mid, nextJobs);

    // 브리지 동기화는 best-effort
    try {
      const url = `${BRIDGE_BASE.replace(
        /\/$/,
        "",
      )}/api/bridge/queue/${encodeURIComponent(mid)}/${encodeURIComponent(jid)}/qty`;
      await fetch(url, {
        method: "PATCH",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ qty }),
      });
    } catch {
      // ignore
    }

    return res.status(200).json({ success: true, data: { jobId: jid, qty } });
  } catch (error) {
    console.error("Error in updateBridgeQueueJobQty:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 수량 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 활성 프로그램 조회 (브리지 경유)
 */
export async function getBridgeActiveProgram(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const url = `${BRIDGE_BASE.replace(
      /\/$/,
      "",
    )}/api/cnc/machines/${encodeURIComponent(mid)}/programs/active`;

    const resp = await fetch(url, {
      method: "GET",
      headers: withBridgeHeaders(),
    });
    const body = await resp.json().catch(() => ({}));

    if (!resp.ok || body?.success === false) {
      return res.status(resp.status).json({
        success: false,
        message:
          body?.message ||
          body?.error ||
          "브리지 활성 프로그램 조회 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({ success: true, data: body?.data ?? body });
  } catch (error) {
    console.error("Error in getBridgeActiveProgram:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 활성 프로그램 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 생산 → CAM 롤백 시 크레딧 환불(CREDIT) 처리 포함
async function rollbackRequestToCamByRequestId(requestId) {
  const rid = String(requestId || "").trim();
  if (!rid) return null;

  const request = await Request.findOne({ requestId: rid });
  if (!request) return null;

  const status = String(request.status || "").trim();
  const stage = String(request.manufacturerStage || "").trim();

  // 생산 단계가 아니면 롤백하지 않는다.
  if (status !== "생산" && stage !== "생산") {
    return request;
  }

  // 크레딧 환불: CAM 승인 시 차감된 SPEND를 되돌리는 CREDIT 생성 (idempotent)
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
              type: "CHARGE",
              amount,
              refType: "REQUEST",
              refId: request._id,
              uniqueKey: refundKey,
            });
          }
        }
      }
    }
  } catch (e) {
    // 크레딧 환불 실패는 롤백 자체를 막지는 않는다. (로그만 남김)
    console.error("rollbackRequestToCamByRequestId credit refund error:", e);
  }

  request.caseInfos = request.caseInfos || {};
  request.caseInfos.reviewByStage = request.caseInfos.reviewByStage || {};

  const now = new Date();

  // CAM/가공 단계 검토 상태를 PENDING으로 되돌린다.
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

  // 상태를 CAM 단계로 롤백
  request.status = "CAM";
  request.manufacturerStage = "CAM";
  request.status2 = "없음";

  // 생산 스케줄 중 실제 가공 시각을 초기화 (필요 시 재계산)
  request.productionSchedule = request.productionSchedule || {};
  request.productionSchedule.actualMachiningStart = null;
  request.productionSchedule.actualMachiningComplete = null;

  await request.save();
  return request;
}

/**
 * 브리지 예약 큐에서 단일 작업 삭제 + 해당 의뢰를 CAM 단계로 롤백
 */
export async function deleteBridgeQueueJob(req, res) {
  try {
    const { machineId, jobId } = req.params;
    const mid = String(machineId || "").trim();
    const jid = String(jobId || "").trim();

    if (!mid || !jid) {
      return res.status(400).json({
        success: false,
        message: "machineId and jobId are required",
      });
    }

    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs.slice() : [];
    const removedJob = jobs.find((j) => String(j?.id || "") === jid) || null;
    const nextJobs = jobs.filter((j) => String(j?.id || "") !== jid);

    await saveBridgeQueueSnapshot(mid, nextJobs);

    // 브리지 동기화는 best-effort
    try {
      const url = `${BRIDGE_BASE.replace(
        /\/$/,
        "",
      )}/api/bridge/queue/${encodeURIComponent(mid)}/${encodeURIComponent(jid)}`;
      await fetch(url, {
        method: "DELETE",
        headers: withBridgeHeaders(),
      });
    } catch {
      // ignore
    }

    let rolledBackRequest = null;
    const reqIdRaw = removedJob?.requestId;
    if (reqIdRaw) {
      rolledBackRequest = await rollbackRequestToCamByRequestId(reqIdRaw);
    }

    return res.status(200).json({
      success: true,
      data: {
        removedJob,
        rolledBackRequestId: rolledBackRequest?._id || null,
      },
    });
  } catch (error) {
    console.error("Error in deleteBridgeQueueJob:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 작업 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 예약 큐 전체 삭제 + 관련 의뢰를 CAM 단계로 롤백
 */
export async function clearBridgeQueueForMachine(req, res) {
  try {
    const { machineId } = req.params;
    const mid = String(machineId || "").trim();
    if (!mid) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    // 1) DB 스냅샷 기준으로 롤백 대상 수집
    const snap = await getDbBridgeQueueSnapshot(mid);
    const jobs = Array.isArray(snap.jobs) ? snap.jobs : [];

    // 2) DB에서 큐 비우기
    await saveBridgeQueueSnapshot(mid, []);

    // 3) 브리지 동기화는 best-effort
    try {
      const clearUrl = `${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/queue/clear`;
      await fetch(clearUrl, {
        method: "POST",
        headers: withBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ machineId: mid }),
      });
    } catch {
      // ignore
    }

    // 3) 큐에 있던 각 의뢰를 CAM 단계로 롤백 (중복 requestId는 1회만 처리)
    const uniqueRequestIds = new Set();
    for (const job of jobs) {
      const rid = String(job?.requestId || "").trim();
      if (!rid) continue;
      uniqueRequestIds.add(rid);
    }

    const rolledBack = [];
    for (const rid of uniqueRequestIds) {
      const r = await rollbackRequestToCamByRequestId(rid);
      if (r?._id) {
        rolledBack.push(String(r._id));
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        clearedMachineId: mid,
        rolledBackRequestIds: rolledBack,
      },
    });
  } catch (error) {
    console.error("Error in clearBridgeQueueForMachine:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 예약 큐 전체 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function syncMachineMaterialToBridge(machineId, material) {
  try {
    const mid = String(machineId || "").trim();
    if (!mid) return;
    const dia = Number(material?.diameter);
    if (!Number.isFinite(dia) || dia <= 0) return;

    await fetch(`${BRIDGE_BASE.replace(/\/$/, "")}/api/bridge/material`, {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        machineId: mid,
        materialType: String(material?.materialType || "").trim(),
        heatNo: String(material?.heatNo || "").trim(),
        diameter: dia,
        diameterGroup: String(material?.diameterGroup || "").trim(),
        remainingLength:
          typeof material?.remainingLength === "number" &&
          Number.isFinite(material.remainingLength)
            ? material.remainingLength
            : null,
      }),
    });
  } catch {
    // ignore: 브리지 연동 실패해도 소재 저장은 성공 처리
  }
}

/**
 * CNC 장비 목록 조회
 */
export async function getMachines(req, res) {
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

/**
 * 브리지 서버용: 더미 스케줄/프로그램 설정 조회
 * - 브리지는 인증 토큰 없이 X-Bridge-Secret으로만 접근
 * - excludeHolidays 적용을 위해 ymd(YYYY-MM-DD) 기준 영업일 여부도 함께 반환
 */
export async function getDummySettingsForBridge(req, res) {
  try {
    const ymdRaw = typeof req.query?.ymd === "string" ? req.query.ymd : "";
    const ymd = (ymdRaw || "").trim() || getTodayYmdInKst();
    const isBusinessDay = await isKoreanBusinessDay(ymd);

    const machines = await CncMachine.find({ status: "active" })
      .sort({ machineId: 1 })
      .lean();

    const list = Array.isArray(machines)
      ? machines.map((m) => ({
          machineId: m.machineId,
          dummySettings: m.dummySettings || null,
        }))
      : [];

    return res.status(200).json({
      success: true,
      data: {
        ymd,
        isBusinessDay,
        machines: list,
      },
    });
  } catch (error) {
    console.error("Error in getDummySettingsForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 더미 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 브리지 서버용: 더미 스케줄 idempotency 키(lastRunKey) 업데이트
 */
export async function updateDummyLastRunKeyForBridge(req, res) {
  try {
    const { machineId } = req.params;
    const { lastRunKey } = req.body || {};

    const key = typeof lastRunKey === "string" ? lastRunKey.trim() : "";
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "lastRunKey is required",
      });
    }

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    machine.dummySettings = machine.dummySettings || {};
    machine.dummySettings.lastRunKey = key;
    await machine.save();

    return res.status(200).json({
      success: true,
      data: { machineId, lastRunKey: key },
    });
  } catch (error) {
    console.error("Error in updateDummyLastRunKeyForBridge:", error);
    return res.status(500).json({
      success: false,
      message: "브리지 lastRunKey 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateMaterialRemaining(req, res) {
  try {
    const { machineId } = req.params;
    const { remainingLength } = req.body;

    if (
      typeof remainingLength !== "number" ||
      !Number.isFinite(remainingLength)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효한 remainingLength 값이 필요합니다.",
      });
    }

    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    machine.currentMaterial = machine.currentMaterial || {
      diameter: 8,
      diameterGroup: "8",
    };
    machine.currentMaterial.remainingLength = remainingLength;
    await machine.save();

    syncMachineMaterialToBridge(machineId, machine.currentMaterial);

    return res.status(200).json({
      success: true,
      data: machine,
    });
  } catch (error) {
    console.error("Error in updateMaterialRemaining:", error);
    return res.status(500).json({
      success: false,
      message: "소재 잔여량 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 장비별 생산 큐 조회
 */
export async function getProductionQueues(req, res) {
  try {
    const requests = await Request.find({
      status: { $in: ["의뢰", "CAM", "생산"] },
    }).select("requestId status productionSchedule caseInfos");

    const queues = getAllProductionQueues(requests);

    // 각 큐에 위치 번호 추가
    for (const machineId in queues) {
      queues[machineId] = queues[machineId].map((req, index) => ({
        requestId: req.requestId,
        status: req.status,
        queuePosition: index + 1,
        estimatedDelivery: req.productionSchedule?.estimatedDelivery,
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

/**
 * 장비 소재 세팅 변경
 */
export async function updateMachineMaterial(req, res) {
  try {
    const { machineId } = req.params;
    const {
      diameter,
      diameterGroup,
      materialType,
      heatNo,
      remainingLength,
      maxModelDiameterGroups,
    } = req.body;

    // 프론트에서 '8mm' 같은 포맷으로 올 수 있으므로 그룹 문자열을 정규화한다.
    const rawGroup = String(diameterGroup || "").trim();
    const normalizedGroup = rawGroup.replace(/mm$/i, "");

    if (
      !normalizedGroup ||
      !["6", "8", "10", "10+"].includes(normalizedGroup)
    ) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    // 장비 메타(CncMachine)는 없으면 생성한다.
    const machine = await getOrCreateCncMachine(machineId);
    if (!machine) {
      return res.status(400).json({
        success: false,
        message: "machineId is required",
      });
    }

    const normalizedMaxGroups = Array.isArray(maxModelDiameterGroups)
      ? maxModelDiameterGroups
          .map((v) =>
            String(v || "")
              .trim()
              .replace(/mm$/i, ""),
          )
          .filter(Boolean)
      : [];

    if (normalizedMaxGroups.length > 0) {
      const uniq = Array.from(new Set(normalizedMaxGroups));
      const ok = uniq.every((g) => ["6", "8", "10", "10+"].includes(g));
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 최대 직경 그룹입니다.",
        });
      }
      machine.maxModelDiameterGroups = uniq;
    } else {
      machine.maxModelDiameterGroups = [normalizedGroup];
    }

    // 소재 세팅 업데이트
    const nextMaterial = {
      materialType: String(materialType || "").trim(),
      heatNo: String(heatNo || "").trim(),
      diameter: diameter || parseInt(normalizedGroup, 10),
      diameterGroup: normalizedGroup,
      setAt: new Date(),
      setBy: req.user?._id,
    };
    if (
      typeof remainingLength === "number" &&
      Number.isFinite(remainingLength)
    ) {
      nextMaterial.remainingLength = remainingLength;
    }
    machine.currentMaterial = nextMaterial;
    await machine.save();

    // 브리지 서버 연동은 best-effort로만 수행한다. (syncMachineMaterialToBridge 내부에서 try/catch)
    syncMachineMaterialToBridge(machineId, machine.currentMaterial);

    // 해당 직경 그룹의 unassigned 의뢰를 이 장비에 할당
    const assignedCount = await recalculateQueueOnMaterialChange(
      machineId,
      normalizedGroup,
    );

    // b5(A): 소재 변경 직후 CAM 대기건 재시도 (best-effort)
    try {
      const matDia = toNumberOrNull(machine.currentMaterial?.diameter);
      if (matDia) {
        const machineMeta = await Machine.findOne({
          $or: [{ uid: machineId }, { name: machineId }],
        })
          .lean()
          .catch(() => null);
        if (machineMeta?.allowAutoMachining !== true) {
          throw new Error("allowAutoMachining is false");
        }
        if (machineMeta?.allowJobStart === false) {
          throw new Error("allowJobStart is false");
        }

        const statusMap = await fetchBridgeMachineStatusMap();
        if (statusMap) {
          const st = statusMap.get(machineId);
          if (!st || st.success !== true || !isBridgeOnlineStatus(st.status)) {
            throw new Error("bridge status is not online");
          }
        }

        const pending = await Request.find({
          manufacturerStage: "CAM",
          "caseInfos.reviewByStage.cam.status": "PENDING",
          "productionSchedule.diameter": matDia,
          $or: [
            { "productionSchedule.assignedMachine": { $exists: false } },
            { "productionSchedule.assignedMachine": null },
            { "productionSchedule.assignedMachine": "" },
          ],
        })
          .limit(CAM_RETRY_BATCH_LIMIT)
          .exec();

        let baseQueueLen = await Request.countDocuments({
          status: { $in: ["의뢰", "CAM", "생산"] },
          "productionSchedule.assignedMachine": machineId,
        });

        for (const reqItem of pending) {
          reqItem.productionSchedule = reqItem.productionSchedule || {};
          reqItem.productionSchedule.assignedMachine = machineId;
          baseQueueLen += 1;
          reqItem.productionSchedule.queuePosition = baseQueueLen;
          await reqItem.save();
        }
      }
    } catch (e) {
      console.warn("[updateMachineMaterial] CAM retry skipped", {
        machineId,
        error: String(e?.message || e),
      });
    }

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 세팅이 ${diameterGroup}mm로 변경되었습니다.`,
      data: {
        machine,
        assignedCount,
      },
    });
  } catch (error) {
    console.error("Error in updateMachineMaterial:", error);
    res.status(500).json({
      success: false,
      message: "소재 세팅 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 소재 교체 예약
 */
export async function scheduleMaterialChange(req, res) {
  try {
    const { machineId } = req.params;
    const { targetTime, newDiameter, newDiameterGroup, notes } = req.body;

    if (!targetTime || !newDiameterGroup) {
      return res.status(400).json({
        success: false,
        message: "목표 시각과 직경 그룹은 필수입니다.",
      });
    }

    if (!["6", "8", "10", "10+"].includes(newDiameterGroup)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 직경 그룹입니다.",
      });
    }

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = {
      targetTime: new Date(targetTime),
      newDiameter: newDiameter || parseInt(newDiameterGroup),
      newDiameterGroup,
      scheduledBy: req.user?._id,
      scheduledAt: new Date(),
      notes: notes || "",
    };
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체가 예약되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in scheduleMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 소재 교체 예약 취소
 */
export async function cancelScheduledMaterialChange(req, res) {
  try {
    const { machineId } = req.params;

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    machine.scheduledMaterialChange = undefined;
    await machine.save();

    res.status(200).json({
      success: true,
      message: `${machineId} 소재 교체 예약이 취소되었습니다.`,
      data: machine,
    });
  } catch (error) {
    console.error("Error in cancelScheduledMaterialChange:", error);
    res.status(500).json({
      success: false,
      message: "소재 교체 예약 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 더미 프로그램/스케줄 설정 저장 (장비별)
 */
export async function updateDummySettings(req, res) {
  try {
    const { machineId } = req.params;
    const { enabled, programName, schedules, excludeHolidays } = req.body || {};

    const machine = await CncMachine.findOne({ machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: "장비를 찾을 수 없습니다.",
      });
    }

    const existingDummy = machine.dummySettings || {};

    const enabledProvided = enabled === true || enabled === false;
    const nextEnabled = enabledProvided
      ? enabled === true
      : existingDummy.enabled !== false;

    const nextProgram =
      typeof programName === "string"
        ? (programName || "").trim() || "O0100"
        : (existingDummy.programName || "O0100").trim() || "O0100";

    let nextSchedules =
      Array.isArray(schedules) && schedules.length >= 0
        ? schedules
        : Array.isArray(existingDummy.schedules)
          ? existingDummy.schedules
          : [];
    nextSchedules = nextSchedules
      .map((s) => ({
        time: typeof s?.time === "string" ? s.time : "08:00",
        enabled: s?.enabled !== false,
      }))
      .filter((s) => !!s.time);
    if (nextSchedules.length === 0) {
      nextSchedules = [
        { time: "08:00", enabled: true },
        { time: "16:00", enabled: true },
      ];
    }

    const nextExcludeHolidays =
      typeof excludeHolidays === "boolean"
        ? excludeHolidays
        : Boolean(existingDummy.excludeHolidays);

    machine.dummySettings = {
      enabled: nextEnabled,
      programName: nextProgram,
      schedules: nextSchedules,
      excludeHolidays: nextExcludeHolidays,
      // 워커에서 사용하는 마지막 실행 키는 유지
      lastRunKey: existingDummy.lastRunKey || null,
    };
    await machine.save();

    return res.status(200).json({
      success: true,
      data: machine.dummySettings,
    });
  } catch (error) {
    console.error("Error in updateDummySettings:", error);
    return res.status(500).json({
      success: false,
      message: "더미 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 장비 초기 데이터 생성 (개발용)
 */
export async function initializeMachines(req, res) {
  try {
    // 기존 장비 삭제
    await CncMachine.deleteMany({});

    // M3, M4 장비 생성
    const machines = [
      {
        machineId: "M3",
        name: "CNC Machine M3",
        status: "active",
        currentMaterial: {
          diameter: 6,
          diameterGroup: "6",
          setAt: new Date(),
        },
        specifications: {
          maxDiameter: 12,
          minDiameter: 4,
          manufacturer: "DMG MORI",
          model: "NLX 2500",
        },
        location: "Production Floor A",
      },
      {
        machineId: "M4",
        name: "CNC Machine M4",
        status: "active",
        currentMaterial: {
          diameter: 8,
          diameterGroup: "8",
          setAt: new Date(),
        },
        specifications: {
          maxDiameter: 12,
          minDiameter: 4,
          manufacturer: "DMG MORI",
          model: "NLX 2500",
        },
        location: "Production Floor A",
      },
    ];

    const created = await CncMachine.insertMany(machines);

    res.status(201).json({
      success: true,
      message: "CNC 장비가 초기화되었습니다.",
      data: created,
    });
  } catch (error) {
    console.error("Error in initializeMachines:", error);
    res.status(500).json({
      success: false,
      message: "장비 초기화 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
