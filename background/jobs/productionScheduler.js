import "../bootstrap/env.js";
import { dbReady } from "../db.js";
import Request from "../models/request.model.js";
import CncMachine from "../models/cncMachine.model.js";
import Machine from "../models/machine.model.js";

const BRIDGE_BASE = process.env.BRIDGE_BASE;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
const CNC_MAX_PROGRAMS = Number(process.env.CNC_MAX_PROGRAMS || 3);
const CNC_PRELOAD_BACKOFF_MS = Number(
  process.env.CNC_PRELOAD_BACKOFF_MS || 2 * 60 * 1000,
);

function withBridgeHeaders(extra = {}) {
  const base = {};
  if (BRIDGE_SHARED_SECRET) {
    base["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
  }
  return { ...base, ...extra };
}

/**
 * 생산 스케줄러 워커
 *
 * 역할:
 * 1. 생산 스케줄에 따라 공정 단계 자동 진행
 * 2. 소재 교체 예약 처리
 *
 * 공정 단계 자동 진행 규칙:
 * - 의뢰 → CAM: 수동 처리 (제조사가 직접 CAM 작업 시작)
 * - CAM → 생산: 수동 처리 (제조사가 CAM 승인 후 가공 큐에 추가)
 * - 생산 → 발송: productionSchedule.scheduledBatchProcessing <= 현재 (배치 처리 완료)
 * - 발송 → 완료: deliveryInfoRef.deliveredAt 존재 (배송 완료 API에서 처리)
 */

let lastRunAt = null;
let isRunning = false;

/**
 * 공정 단계 자동 진행 (시각 기반)
 *
 * 프로세스:
 * 1. 의뢰 → CAM: 수동 처리 (제조사가 직접 CAM 작업 시작)
 * 2. CAM → 생산: 수동 처리 (제조사가 CAM 승인 후 가공 큐에 추가)
 * 3. 생산 → 발송: scheduledBatchProcessing <= 현재 (배치 처리 완료)
 * 4. 발송 → 완료: deliveryInfoRef.deliveredAt 존재 (배송 완료 API에서 처리)
 * 5. 소재 교체 예약 처리
 */
async function progressProductionStages() {
  if (isRunning) {
    console.log("[productionScheduler] Already running, skipping...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  const now = new Date();

  try {
    console.log(`[${now.toISOString()}] Production scheduler started`);

    let updatedCount = 0;

    // 1. 생산 → 발송: 배치 처리 완료 (세척/검사/포장)
    const productionToShipping = await Request.find({
      status: "생산",
      "productionSchedule.scheduledBatchProcessing": {
        $exists: true,
        $lte: now,
      },
    });

    for (const req of productionToShipping) {
      updateStage(req, "발송");
      if (!req.productionSchedule.actualBatchProcessing) {
        req.productionSchedule.actualBatchProcessing = now;
      }
      await req.save();
      updatedCount++;
      console.log(`  [생산→발송] ${req.requestId} (batch processing complete)`);
    }

    // 2. 발송 → 완료: 배송 완료 (배송 완료 API에서 처리)

    // 2.5. CNC 가공 자동 개시: CAM 완료 + NC 준비 + 장비 ready + 소재 직경 매칭
    const cncStartCount = await processCncAutoStart(now);
    updatedCount += cncStartCount;

    // 3. 소재 교체 예약 처리
    const materialChangeCount = await processScheduledMaterialChanges(now);
    updatedCount += materialChangeCount;

    const elapsed = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] Production scheduler completed. Updated ${updatedCount} requests in ${elapsed}ms.`,
    );

    lastRunAt = new Date();
  } catch (error) {
    console.error("[productionScheduler] Error:", error);
  } finally {
    isRunning = false;
  }
}

async function callBridgeRaw(
  uid,
  dataType,
  payload = null,
  timeoutMilliseconds,
) {
  if (!BRIDGE_BASE) {
    return {
      ok: false,
      body: { success: false, message: "BRIDGE_BASE is not configured" },
    };
  }
  const response = await fetch(`${BRIDGE_BASE}/api/cnc/raw`, {
    method: "POST",
    headers: withBridgeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      uid,
      dataType,
      payload,
      ...(typeof timeoutMilliseconds === "number" && timeoutMilliseconds > 0
        ? { timeoutMilliseconds }
        : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body?.success !== false, body };
}

async function isMachineReady(uid) {
  try {
    const { ok, body } = await callBridgeRaw(uid, "GetOPStatus", null, 3000);
    if (!ok) return false;
    const result =
      typeof body?.result === "number"
        ? body.result
        : typeof body?.data?.result === "number"
          ? body.data.result
          : null;
    return result === 0;
  } catch {
    return false;
  }
}

function pickContinueIoUidFromOpStatus(body) {
  const ioInfo = body?.data?.ioInfo;
  if (!Array.isArray(ioInfo)) return null;
  const candidates = ioInfo
    .map((io) => String(io?.IOUID ?? io?.ioUid ?? "").trim())
    .filter(Boolean);
  const found =
    candidates.find((v) => v.toUpperCase().includes("C_CONT")) ||
    candidates.find((v) => v.toUpperCase().includes("CONT")) ||
    null;
  return found;
}

async function startMachiningOnMachine(uid) {
  if (!BRIDGE_BASE) {
    return { ok: false, data: { message: "BRIDGE_BASE is not configured" } };
  }
  // 1) /start 엔드포인트 시도 (환경에 따라 브리지에서 차단될 수 있음)
  try {
    const response = await fetch(
      `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(uid)}/start`,
      { method: "POST", headers: withBridgeHeaders() },
    );
    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.success !== false) {
      return { ok: true, data };
    }
    // 403 등 차단된 경우 RAW로 폴백
  } catch {
    // ignore
  }

  // 2) RAW UpdateOPStatus로 폴백 (패널 IO의 C_CONT 토글)
  const op = await callBridgeRaw(uid, "GetOPStatus", null, 3000);
  const detected = op.ok ? pickContinueIoUidFromOpStatus(op.body) : null;
  const fallbackCandidates = [
    detected,
    "C_CONT",
    "MACHINE_IO_C_CONT",
    "CONT",
  ].filter(Boolean);

  for (const ioUid of fallbackCandidates) {
    const payload = { IOUID: ioUid, Status: 1 };
    const res = await callBridgeRaw(uid, "UpdateOPStatus", payload, 5000);
    if (!res.ok) continue;
    const result =
      typeof res.body?.result === "number"
        ? res.body.result
        : typeof res.body?.data?.result === "number"
          ? res.body.data.result
          : null;
    if (result === 0) {
      return { ok: true, data: res.body };
    }
  }

  return { ok: false, data: op.body };
}

function parseProgramNoFromName(name) {
  const s = String(name || "").trim();
  const m = s.toUpperCase().match(/O(\d{1,6})/);
  if (m && m[1]) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  const m2 = s.match(/(\d{1,6})/);
  if (m2 && m2[1]) {
    const n = Number(m2[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchProgramSummary(uid) {
  const [listRes, actRes] = await Promise.all([
    callBridgeRaw(uid, "GetProgListInfo", 0, 5000),
    callBridgeRaw(uid, "GetActivateProgInfo", null, 5000),
  ]);
  const progList =
    listRes.ok &&
    Array.isArray(listRes.body?.data?.machineProgramListInfo?.programArray)
      ? listRes.body.data.machineProgramListInfo.programArray
      : [];
  const current = actRes.ok
    ? (actRes.body?.data?.machineCurrentProgInfo ?? null)
    : null;

  const list = Array.isArray(progList) ? progList : [];
  const activeNo =
    current && (current.programNo ?? current.no) != null
      ? Number(current.programNo ?? current.no)
      : null;
  return { list, activeNo };
}

async function deleteProgramIfNeeded(uid, programNo) {
  if (programNo == null) return false;
  const res = await callBridgeRaw(
    uid,
    "DeleteProgram",
    { headType: 0, programNo },
    30_000,
  );
  const rc =
    typeof res.body?.result === "number"
      ? res.body.result
      : typeof res.body?.data?.result === "number"
        ? res.body.data.result
        : null;
  return res.ok && rc === 0;
}

async function ensureProgramCapacity(uid, targetProgramNo) {
  if (!Number.isFinite(CNC_MAX_PROGRAMS) || CNC_MAX_PROGRAMS <= 0) return;
  const { list, activeNo } = await fetchProgramSummary(uid);
  const normalized = list
    .map((p) => Number(p?.programNo ?? p?.no))
    .filter((n) => Number.isFinite(n));

  if (normalized.includes(Number(targetProgramNo))) return;
  if (normalized.length < CNC_MAX_PROGRAMS) return;

  const candidates = normalized.filter(
    (n) => n !== Number(activeNo) && n !== Number(targetProgramNo),
  );
  if (candidates.length === 0) return;
  candidates.sort((a, b) => a - b);
  await deleteProgramIfNeeded(uid, candidates[0]);
}

async function uploadProgramFromStore(uid, path, programNo) {
  if (!BRIDGE_BASE) {
    return { ok: false, data: { message: "BRIDGE_BASE is not configured" } };
  }
  const response = await fetch(
    `${BRIDGE_BASE}/api/cnc/machines/${encodeURIComponent(
      uid,
    )}/programs/upload-from-store`,
    {
      method: "POST",
      headers: withBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path, programNo, headType: 0, isNew: true }),
    },
  );
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.success !== false, data };
}

async function activateProgram(uid, programNo) {
  const res = await callBridgeRaw(
    uid,
    "UpdateActivateProg",
    { headType: 0, programNo },
    10_000,
  );
  const rc =
    typeof res.body?.result === "number"
      ? res.body.result
      : typeof res.body?.data?.result === "number"
        ? res.body.data.result
        : null;
  return res.ok && rc === 0;
}

async function ensurePreloadedForRequest({ request, hiLinkUid, machineId }) {
  const filePath = String(request?.caseInfos?.ncFile?.filePath || "").trim();
  const fileName = String(request?.caseInfos?.ncFile?.fileName || "").trim();
  const candidatePath = filePath;
  if (!candidatePath) {
    return { ok: false, reason: "missing ncFile.filePath" };
  }

  const prev = request.productionSchedule?.ncPreload || null;
  if (prev && prev.status && prev.updatedAt) {
    const status = String(prev.status || "").toUpperCase();
    if (status === "UPLOADING" || status === "FAILED") {
      const last = new Date(prev.updatedAt);
      if (!Number.isNaN(last.getTime())) {
        const elapsed = Date.now() - last.getTime();
        if (elapsed < CNC_PRELOAD_BACKOFF_MS) {
          return { ok: false, reason: "preload backoff" };
        }
      }
    }
  }

  const existingProgramNo = request.productionSchedule?.ncPreload?.programNo;
  let programNo =
    typeof existingProgramNo === "number" && Number.isFinite(existingProgramNo)
      ? existingProgramNo
      : parseProgramNoFromName(fileName || candidatePath);

  if (programNo == null) {
    return { ok: false, reason: "missing programNo" };
  }

  const { list } = await fetchProgramSummary(hiLinkUid);
  const hasProgram = list.some((p) => {
    const n = Number(p?.programNo ?? p?.no);
    return Number.isFinite(n) && n === Number(programNo);
  });

  if (hasProgram) {
    request.productionSchedule = request.productionSchedule || {};
    request.productionSchedule.ncPreload = {
      status: "READY",
      programNo,
      machineId,
      bridgePath: candidatePath,
      updatedAt: new Date(),
    };
    await request.save();
    return { ok: true, programNo };
  }

  request.productionSchedule = request.productionSchedule || {};
  request.productionSchedule.ncPreload = {
    status: "UPLOADING",
    programNo,
    machineId,
    bridgePath: candidatePath,
    updatedAt: new Date(),
  };
  await request.save();

  await ensureProgramCapacity(hiLinkUid, programNo);
  const uploaded = await uploadProgramFromStore(
    hiLinkUid,
    candidatePath,
    programNo,
  );
  if (!uploaded.ok) {
    request.productionSchedule.ncPreload = {
      status: "FAILED",
      programNo,
      machineId,
      bridgePath: candidatePath,
      updatedAt: new Date(),
      error: String(
        uploaded.data?.message || uploaded.data?.error || "upload failed",
      ),
    };
    await request.save();
    return { ok: false, reason: "upload failed" };
  }

  request.productionSchedule.ncPreload = {
    status: "READY",
    programNo,
    machineId,
    bridgePath: candidatePath,
    updatedAt: new Date(),
  };
  await request.save();
  return { ok: true, programNo };
}

async function processCncAutoStart(now) {
  let startedCount = 0;

  if (!BRIDGE_BASE) {
    return 0;
  }

  const machines = await CncMachine.find({ status: "active" }).sort({
    machineId: 1,
  });

  for (const cnc of machines) {
    const machineId = String(cnc.machineId || "").trim();
    if (!machineId) continue;

    const materialGroup = String(
      cnc.currentMaterial?.diameterGroup || "",
    ).trim();
    if (!materialGroup) continue;

    const control = await Machine.findOne({ uid: machineId }).lean();
    if (!control || control.allowAutoMachining !== true) {
      continue;
    }
    if (control && control.allowJobStart === false) {
      continue;
    }

    const hiLinkUid = String(
      control?.hiLinkUid || control?.uid || machineId,
    ).trim();
    if (!hiLinkUid) continue;

    const ready = await isMachineReady(hiLinkUid);
    if (!ready) continue;

    const busy = await Request.exists({
      status: "생산",
      "productionSchedule.assignedMachine": machineId,
      "productionSchedule.actualMachiningStart": { $exists: true },
      "productionSchedule.actualMachiningComplete": { $exists: false },
    });
    if (busy) continue;

    const candidate = await Request.findOne({
      status: "CAM",
      "productionSchedule.assignedMachine": machineId,
      "productionSchedule.diameterGroup": materialGroup,
      "productionSchedule.actualMachiningStart": { $exists: false },
      $or: [
        { "caseInfos.ncFile.s3Key": { $exists: true, $ne: "" } },
        { "caseInfos.ncFile.filePath": { $exists: true, $ne: "" } },
      ],
    }).sort({ "productionSchedule.estimatedDelivery": 1 });

    if (!candidate) continue;

    const camReview = String(
      candidate.caseInfos?.reviewByStage?.cam?.status || "",
    ).trim();
    if (camReview && camReview !== "APPROVED") {
      continue;
    }

    const preload = await ensurePreloadedForRequest({
      request: candidate,
      hiLinkUid,
      machineId,
    });
    if (!preload.ok || preload.programNo == null) {
      continue;
    }

    const activated = await activateProgram(hiLinkUid, preload.programNo);
    if (!activated) {
      console.warn(
        `[productionScheduler] CNC activate program failed: machine=${machineId} uid=${hiLinkUid} request=${candidate.requestId} programNo=${preload.programNo}`,
      );
      continue;
    }

    const started = await startMachiningOnMachine(hiLinkUid);
    if (!started.ok) {
      const msg =
        started.data?.message || started.data?.error || "start command failed";
      console.warn(
        `[productionScheduler] CNC start failed: machine=${machineId} uid=${hiLinkUid} request=${candidate.requestId} msg=${msg}`,
      );
      continue;
    }

    updateStage(candidate, "생산");
    if (!candidate.productionSchedule) {
      candidate.productionSchedule = {};
    }
    if (!candidate.productionSchedule.actualMachiningStart) {
      candidate.productionSchedule.actualMachiningStart = now;
    }
    await candidate.save();

    startedCount++;
    console.log(
      `  [CNC start] ${candidate.requestId} -> ${machineId} (diameterGroup=${materialGroup})`,
    );
  }

  return startedCount;
}

/**
 * 소재 교체 예약 처리
 *
 * 로직:
 * 1. 예약된 소재 교체 시각이 도래한 장비 조회
 * 2. 해당 장비의 현재 큐에서 교체 시각 이전에 완료 가능한 의뢰만 유지
 * 3. 교체 시각 이후에 완료될 의뢰는 unassigned로 변경
 * 4. 소재 교체 실행 및 새 직경 그룹의 unassigned 의뢰를 재할당
 */
async function processScheduledMaterialChanges(now) {
  let changeCount = 0;

  try {
    // 소재 교체 예약이 도래한 장비 조회
    const machines = await CncMachine.find({
      "scheduledMaterialChange.targetTime": { $exists: true, $lte: now },
    });

    for (const machine of machines) {
      const { targetTime, newDiameter, newDiameterGroup } =
        machine.scheduledMaterialChange;

      console.log(
        `  [소재교체] ${machine.machineId}: ${
          machine.currentMaterial.diameterGroup
        }mm → ${newDiameterGroup}mm (target: ${targetTime.toISOString()})`,
      );

      // 현재 장비에 할당된 의뢰 조회
      const assignedRequests = await Request.find({
        status: { $in: ["CAM", "생산"] },
        "productionSchedule.assignedMachine": machine.machineId,
      }).sort({ "productionSchedule.estimatedDelivery": 1 });

      // 교체 시각 이전에 완료 불가능한 의뢰는 unassigned로 변경
      let unassignedCount = 0;
      for (const req of assignedRequests) {
        const estimatedCompletion =
          req.productionSchedule.scheduledMachiningComplete;
        if (estimatedCompletion && estimatedCompletion > targetTime) {
          req.productionSchedule.assignedMachine = null;
          req.productionSchedule.queuePosition = null;
          await req.save();
          unassignedCount++;
          console.log(
            `    [unassign] ${
              req.requestId
            } (완료예정: ${estimatedCompletion.toISOString()} > 교체시각)`,
          );
        }
      }

      // 소재 교체 실행
      machine.currentMaterial = {
        diameter: newDiameter,
        diameterGroup: newDiameterGroup,
        setAt: now,
        setBy: machine.scheduledMaterialChange.scheduledBy,
      };
      machine.scheduledMaterialChange = undefined;
      await machine.save();

      // 새 직경 그룹의 unassigned 의뢰를 이 장비에 재할당
      const newRequests = await Request.find({
        status: { $in: ["CAM", "생산"] },
        "productionSchedule.assignedMachine": null,
        "productionSchedule.diameterGroup": newDiameterGroup,
      }).sort({ "productionSchedule.estimatedDelivery": 1 });

      let assignedCount = 0;
      for (const req of newRequests) {
        req.productionSchedule.assignedMachine = machine.machineId;
        await req.save();
        assignedCount++;
      }

      console.log(
        `    [완료] unassigned: ${unassignedCount}, 신규할당: ${assignedCount}`,
      );
      changeCount++;
    }
  } catch (error) {
    console.error("[processScheduledMaterialChanges] Error:", error);
  }

  return changeCount;
}

/**
 * 공정 단계 업데이트 (applyStatusMapping 대체)
 */
function updateStage(request, newStage) {
  request.status = newStage;
  request.manufacturerStage = newStage;

  // statusHistory 기록
  if (!request.statusHistory) {
    request.statusHistory = [];
  }
  request.statusHistory.push({
    status: newStage,
    note: "자동 진행",
    updatedAt: new Date(),
  });
}

/**
 * 오늘 날짜 (KST 기준 YYYY-MM-DD)
 */
function getTodayYmdInKst() {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  return kstTime.toISOString().slice(0, 10);
}

/**
 * 워커 상태 조회
 */
export function getProductionSchedulerStatus() {
  return {
    name: "productionScheduler",
    lastRunAt: lastRunAt?.toISOString() || null,
    isRunning,
  };
}

/**
 * 워커 시작
 */
export function startProductionScheduler() {
  const INTERVAL_MS = 10 * 1000; // 10초

  // 즉시 실행
  progressProductionStages();

  // 주기적 실행
  setInterval(progressProductionStages, INTERVAL_MS);

  console.log("[productionScheduler] Started (interval: 10s)");
}

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    await dbReady;
    console.log("[productionScheduler] DB ready");
    await progressProductionStages();
    process.exit(0);
  })();
}
