/**
 * reviewApprovalQueue.service.js
 *
 * 제조사 워크시트 승인 직렬 큐 서비스.
 *
 * 배경:
 *   작업자가 의뢰 카드를 빠르게 연속 승인할 때 BG 앱(rhino, esprit, bridge,
 *   lot, pack, wbls)이 동시 요청을 받아 충돌/과부하가 발생하는 문제를 방지한다.
 *   승인 요청은 즉시 큐에 등록되고, 워커가 한 번에 하나씩 순서대로 처리한다.
 *
 * 아키텍처:
 *   - enqueueApproval():   HTTP 핸들러에서 호출 → 큐 등록 후 즉시 반환
 *   - startWorker():       앱 시작 시 1회 호출 → setInterval로 폴링 루프 시작
 *   - processNextItem():   PENDING 항목을 하나씩 꺼내 실행 (직렬)
 *   - BG 앱 트리거:         Esprit(request 단계), CAM 후처리(cam 단계) 등
 *
 * 주의:
 *   - 큐 워커는 단일 프로세스 내에서 직렬로 실행된다.
 *   - 다중 인스턴스 환경을 대비해 MongoDB 원자적 findOneAndUpdate로 잠금(lock)한다.
 */

import Request from "../models/request.model.js";
import CncMachine from "../models/cncMachine.model.js";
import ReviewApprovalQueue from "../models/reviewApprovalQueue.model.js";
import mongoose from "mongoose";
import { emitAppEventToRoles } from "../socket.js";
import { triggerEspritForNc } from "../controllers/requests/common.review.esprit.js";
import { chooseMachineForCamMachining } from "../controllers/requests/common.review.machine.js";
import { triggerNextAutoMachiningAfterComplete } from "../controllers/cnc/machiningBridge.js";

// 워커 폴링 간격 (ms). 환경변수로 조정 가능.
const WORKER_POLL_INTERVAL_MS = Number(
  process.env.REVIEW_APPROVAL_QUEUE_POLL_MS || 1500,
);

// 처리 시간 초과 시 잠금 해제 기준 (ms). 네트워크 타임아웃보다 넉넉히 설정.
const LOCK_TIMEOUT_MS = Number(
  process.env.REVIEW_APPROVAL_QUEUE_LOCK_TIMEOUT_MS || 30000,
);

// 워커 인스턴스 고유 ID (다중 인스턴스 잠금 식별용)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// 워커가 이미 실행 중인지 여부 (중복 실행 방지)
let _workerRunning = false;
let _workerInterval = null;
let _workerTickRunning = false;
let _dbDisconnectedLogged = false;
let _lastTransientMongoLogAt = 0;

const TRANSIENT_MONGO_LOG_THROTTLE_MS = Number(
  process.env.REVIEW_APPROVAL_QUEUE_TRANSIENT_LOG_THROTTLE_MS || 30000,
);

function isTransientMongoConnectivityError(err) {
  if (!err) return false;

  const name = String(err?.name || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  const labels = Array.isArray(err?.errorLabels)
    ? err.errorLabels
    : err?.errorLabelSet instanceof Set
      ? Array.from(err.errorLabelSet)
      : [];

  const hint = `${name} ${message} ${labels.join(" ").toLowerCase()}`;
  const transientKeywords = [
    "poolclearedonnetworkerror",
    "mongonetworktimeouterror",
    "mongoserverselectionerror",
    "server monitor timeout",
    "timed out",
    "econnreset",
    "econnrefused",
    "resetpool",
    "interruptinuseconnections",
    "connection",
  ];

  if (transientKeywords.some((keyword) => hint.includes(keyword))) {
    return true;
  }

  return isTransientMongoConnectivityError(err?.cause);
}

function shouldLogTransientMongoNow() {
  const now = Date.now();
  if (now - _lastTransientMongoLogAt >= TRANSIENT_MONGO_LOG_THROTTLE_MS) {
    _lastTransientMongoLogAt = now;
    return true;
  }
  return false;
}

/**
 * 의뢰 승인을 큐에 등록한다.
 *
 * 이미 PENDING/PROCESSING 상태의 동일 의뢰가 있으면 중복 등록하지 않는다.
 * (uniqueKey로 unique index 보장)
 *
 * @param {object} params
 * @param {string} params.taskType      - "REQUEST_STAGE_APPROVED" | "CAM_STAGE_APPROVED"
 * @param {object} params.request       - Mongoose Request 도큐먼트 (toObject 후)
 * @param {string|null} params.actorUserId - 승인 요청자 ID
 * @returns {{ alreadyQueued: boolean, queueId: string }}
 */
export async function enqueueApproval({
  taskType,
  request,
  actorUserId,
  forceReprocess = false,
}) {
  const requestMongoId = String(request?._id || "");
  const requestId = String(request?.requestId || "");

  if (!requestMongoId || !requestId) {
    throw new Error(
      "[ReviewApprovalQueue] requestMongoId/requestId is required",
    );
  }

  // uniqueKey: 동일 의뢰에 대해 동일 taskType이 중복 등록되지 않도록 보장
  const uniqueKey = `${taskType}:${requestMongoId}`;

  // 기존에 PENDING/PROCESSING 상태인 항목이 있으면 그대로 반환
  const existing = await ReviewApprovalQueue.findOne({
    uniqueKey,
    status: { $in: ["PENDING", "PROCESSING"] },
  }).lean();

  if (existing) {
    console.log("[ReviewApprovalQueue] already queued, skip duplicate", {
      requestId,
      taskType,
      existingId: String(existing._id),
      existingStatus: existing.status,
    });
    return { alreadyQueued: true, queueId: String(existing._id) };
  }

  // 기존 FAILED/COMPLETED/CANCELLED 항목이 있으면 재시도를 위해 PENDING으로 초기화
  // COMPLETED: 롤백 후 재승인 시 동일 uniqueKey로 재등록 필요
  // CANCELLED: 취소 후 재승인 시 동일 uniqueKey로 재등록 필요
  const resetDoc = await ReviewApprovalQueue.findOneAndUpdate(
    { uniqueKey, status: { $in: ["FAILED", "COMPLETED", "CANCELLED"] } },
    {
      $set: {
        status: "PENDING",
        attemptCount: 0,
        error: null,
        failedAt: null,
        lockedBy: null,
        lockedUntil: null,
        processingStartedAt: null,
        completedAt: null,
        // 최신 request 스냅샷으로 payload 갱신
        payload: buildPayload(taskType, request, { forceReprocess }),
        actorUserId: actorUserId || null,
      },
    },
    { new: true },
  );
  if (resetDoc) {
    console.log("[ReviewApprovalQueue] re-queued item", {
      requestId,
      taskType,
      prevStatus: resetDoc.status,
      queueId: String(resetDoc._id),
    });
    return { alreadyQueued: false, queueId: String(resetDoc._id) };
  }

  // 신규 등록
  try {
    const doc = await ReviewApprovalQueue.create({
      taskType,
      status: "PENDING",
      requestMongoId,
      requestId,
      uniqueKey,
      payload: buildPayload(taskType, request, { forceReprocess }),
      actorUserId: actorUserId || null,
    });

    console.log("[ReviewApprovalQueue] enqueued", {
      requestId,
      taskType,
      queueId: String(doc._id),
    });

    // 워커가 대기 중이라면 즉시 폴링 한 번 트리거
    void processNextItem().catch((err) =>
      console.error(
        "[ReviewApprovalQueue] immediate processNextItem error",
        err,
      ),
    );

    return { alreadyQueued: false, queueId: String(doc._id) };
  } catch (error) {
    // 중복 키 에러 (경쟁 상태): findOne과 create 사이에 다른 요청이 먼저 생성한 경우
    if (error?.code === 11000 || error?.message?.includes("duplicate")) {
      console.log(
        "[ReviewApprovalQueue] duplicate key caught (race condition), fetching existing",
        {
          requestId,
          taskType,
        },
      );
      const raceExisting = await ReviewApprovalQueue.findOne({
        uniqueKey,
        status: { $in: ["PENDING", "PROCESSING"] },
      }).lean();
      if (raceExisting) {
        return { alreadyQueued: true, queueId: String(raceExisting._id) };
      }
    }
    throw error;
  }
}

/**
 * 큐에서 다음 PENDING 항목을 하나 꺼내 처리한다.
 *
 * 원자적 findOneAndUpdate로 잠금(PROCESSING)을 획득하여 중복 처리를 방지한다.
 * 처리 중 오류 시 FAILED로 기록하고 워크시트에 app-event를 발행한다.
 */
export async function processNextItem() {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  // 만료된 잠금 해제 (이전 워커 크래시 대비)
  await ReviewApprovalQueue.updateMany(
    {
      status: "PROCESSING",
      lockedUntil: { $lt: now },
    },
    {
      $set: {
        status: "PENDING",
        lockedBy: null,
        lockedUntil: null,
        processingStartedAt: null,
      },
    },
  );

  // 원자적으로 PENDING 항목 하나를 PROCESSING으로 전환하여 잠금 획득
  const item = await ReviewApprovalQueue.findOneAndUpdate(
    {
      status: "PENDING",
      $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
    },
    {
      $set: {
        status: "PROCESSING",
        lockedBy: WORKER_ID,
        lockedUntil: lockExpiry,
        processingStartedAt: now,
        lastAttemptAt: now,
      },
      $inc: { attemptCount: 1 },
    },
    {
      sort: { createdAt: 1 }, // 먼저 들어온 것부터 처리 (FIFO)
      new: true,
    },
  );

  if (!item) {
    // 처리할 항목 없음
    return null;
  }

  console.log("[ReviewApprovalQueue] processing", {
    queueId: String(item._id),
    requestId: item.requestId,
    taskType: item.taskType,
    attemptCount: item.attemptCount,
  });

  try {
    await executeTask(item);

    // 처리 완료
    await ReviewApprovalQueue.findByIdAndUpdate(item._id, {
      $set: {
        status: "COMPLETED",
        completedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        error: null,
      },
    });

    console.log("[ReviewApprovalQueue] completed", {
      queueId: String(item._id),
      requestId: item.requestId,
      taskType: item.taskType,
    });

    return item;
  } catch (err) {
    const message = err?.message || String(err || "");
    console.error("[ReviewApprovalQueue] task failed", {
      queueId: String(item._id),
      requestId: item.requestId,
      taskType: item.taskType,
      error: message,
    });

    const isRetryable = item.attemptCount < item.maxAttempts;

    await ReviewApprovalQueue.findByIdAndUpdate(item._id, {
      $set: {
        status: isRetryable ? "PENDING" : "FAILED",
        failedAt: isRetryable ? null : new Date(),
        lockedBy: null,
        lockedUntil: null,
        error: {
          message: message.slice(0, 500),
          code: String(err?.statusCode || err?.code || ""),
        },
      },
    });

    // 프론트엔드에 비동기 실패 이벤트 발행
    emitApprovalQueueFailure({
      requestId: item.requestId,
      requestMongoId: String(item.requestMongoId || ""),
      taskType: item.taskType,
      message,
      isRetryable,
    });

    return null;
  }
}

/**
 * 각 taskType에 맞는 BG 트리거 실행
 */
async function executeTask(item) {
  const { taskType, payload, requestMongoId, requestId } = item;

  if (taskType === "REQUEST_STAGE_APPROVED") {
    // 의뢰 단계 승인 → Esprit에 NC 생성 트리거
    // payload에 저장된 request 스냅샷을 사용. 단, 최신 NC 파일 존재 여부 확인을 위해 DB 재조회.
    const request = await Request.findById(requestMongoId).lean();
    if (!request) {
      throw new Error(`Request not found: ${requestId}`);
    }
    const forceReprocess = payload?.forceReprocess === true;

    // 이미 다른 경로(재업로드 등)로 NC가 생성된 경우 트리거 스킵
    // 단, 강제 재실행 요청(forceReprocess=true)이면 스킵하지 않고 재생성을 진행한다.
    if (request?.caseInfos?.ncFile?.s3Key && !forceReprocess) {
      console.log(
        "[ReviewApprovalQueue] NC already exists, skip esprit trigger",
        {
          requestId,
        },
      );
      return;
    }
    if (request?.caseInfos?.ncFile?.s3Key && forceReprocess) {
      console.log("[ReviewApprovalQueue] force reprocess: run esprit trigger", {
        requestId,
      });
    }
    await triggerEspritForNc({ request });
  } else if (taskType === "CAM_STAGE_APPROVED") {
    // CAM 단계 승인 → 장비 배정 + CNC 자동 가공 트리거
    await runCamApproveTask({ requestMongoId, requestId, payload });
  } else {
    throw new Error(`Unknown taskType: ${taskType}`);
  }
}

/**
 * CAM 단계 승인 후처리:
 *   - 장비 배정이 안 된 경우 배정
 *   - 자동 가공 트리거
 */
async function runCamApproveTask({ requestMongoId, requestId }) {
  const request = await Request.findById(requestMongoId);
  if (!request) {
    throw new Error(`Request not found: ${requestId}`);
  }
  if (String(request?.manufacturerStage || "").trim() !== "가공") {
    console.log("[ReviewApprovalQueue] CAM task: not in 가공 stage, skip", {
      requestId,
      stage: request?.manufacturerStage,
    });
    return;
  }

  const existingMachineId = String(
    request?.productionSchedule?.assignedMachine ||
      request?.assignedMachine ||
      "",
  ).trim();

  let selectedMachineId = existingMachineId;

  if (!selectedMachineId) {
    const selected = await chooseMachineForCamMachining({
      request,
      requireCeil: true,
      reserveAssignment: true,
    });

    request.productionSchedule = request.productionSchedule || {};
    request.productionSchedule.assignedMachine = selected.machineId;
    request.productionSchedule.queuePosition = selected.queuePosition;
    request.assignedMachine = selected.machineId;
    if (selected.diameterGroup) {
      request.productionSchedule.diameterGroup = selected.diameterGroup;
    }
    if (Number.isFinite(selected.diameter) && selected.diameter > 0) {
      request.productionSchedule.diameter = selected.diameter;
    }
    await request.save();
    selectedMachineId = selected.machineId;

    console.log("[ReviewApprovalQueue] CAM task: assigned machine", {
      requestId,
      machineId: selected.machineId,
      queuePosition: selected.queuePosition,
      diameterGroup: selected.diameterGroup || null,
    });
  }

  if (!selectedMachineId) return;

  // 소재 번호 보완
  request.lotNumber = request.lotNumber || {};
  if (!request.lotNumber.material) {
    const cncMachine = await CncMachine.findOne({
      machineId: selectedMachineId,
    })
      .select({ currentMaterial: 1 })
      .lean()
      .catch(() => null);
    const heatNo = String(cncMachine?.currentMaterial?.heatNo || "").trim();
    if (heatNo) {
      request.lotNumber.material = heatNo;
      await request.save();
      console.log("[ReviewApprovalQueue] CAM task: set lot material", {
        requestId,
        heatNo,
      });
    }
  }

  // 자동 가공 큐에 추가 시도
  try {
    await triggerNextAutoMachiningAfterComplete(selectedMachineId);
    console.log("[ReviewApprovalQueue] CAM task: auto machining triggered", {
      requestId,
      machineId: selectedMachineId,
    });
  } catch (err) {
    // 자동 가공 트리거 실패는 치명적이지 않으므로 경고만 남김
    console.warn(
      "[ReviewApprovalQueue] CAM task: auto machining trigger failed",
      {
        requestId,
        machineId: selectedMachineId,
        error: err?.message || String(err),
      },
    );
  }
}

/**
 * 승인 큐 실패 시 프론트에 이벤트 발행
 */
function emitApprovalQueueFailure({
  requestId,
  requestMongoId,
  taskType,
  message,
  isRetryable,
}) {
  const stageMap = {
    REQUEST_STAGE_APPROVED: "request",
    CAM_STAGE_APPROVED: "cam",
  };
  emitAppEventToRoles(
    ["manufacturer", "admin"],
    "request:async-action-failed",
    {
      requestId: requestId ? String(requestId) : null,
      requestMongoId: requestMongoId || null,
      action:
        taskType === "REQUEST_STAGE_APPROVED"
          ? "esprit-trigger"
          : "cam-approve-post",
      stage: stageMap[taskType] || null,
      message: isRetryable
        ? `${message} (재시도 예정)`
        : `${message} (최대 재시도 초과)`,
    },
  );
}

/**
 * payload 빌더: taskType별 필요한 필드만 저장
 */
function buildPayload(taskType, request, options = {}) {
  if (taskType === "REQUEST_STAGE_APPROVED") {
    return {
      requestId: request?.requestId,
      forceReprocess: options?.forceReprocess === true,
      caseInfos: {
        camFile: request?.caseInfos?.camFile || null,
        ncFile: request?.caseInfos?.ncFile || null,
        implantManufacturer: request?.caseInfos?.implantManufacturer || null,
        implantBrand: request?.caseInfos?.implantBrand || null,
        implantFamily: request?.caseInfos?.implantFamily || null,
        implantType: request?.caseInfos?.implantType || null,
        maxDiameter: request?.caseInfos?.maxDiameter || null,
        connectionDiameter: request?.caseInfos?.connectionDiameter || null,
        totalLength: request?.caseInfos?.totalLength || null,
        taperAngle: request?.caseInfos?.taperAngle || null,
        faceHolePrcFileName: request?.caseInfos?.faceHolePrcFileName || null,
        connectionPrcFileName:
          request?.caseInfos?.connectionPrcFileName || null,
        clinicName: request?.caseInfos?.clinicName || null,
        patientName: request?.caseInfos?.patientName || null,
        tooth: request?.caseInfos?.tooth || null,
        workType: request?.caseInfos?.workType || null,
      },
      productionSchedule: request?.productionSchedule || null,
      lotNumber: request?.lotNumber || null,
      manufacturerStage: request?.manufacturerStage || null,
    };
  }
  if (taskType === "CAM_STAGE_APPROVED") {
    return {
      requestId: request?.requestId,
      manufacturerStage: request?.manufacturerStage || null,
      assignedMachine: request?.assignedMachine || null,
      productionSchedule: request?.productionSchedule || null,
      lotNumber: request?.lotNumber || null,
      caseInfos: {
        maxDiameter: request?.caseInfos?.maxDiameter || null,
      },
    };
  }
  return {};
}

/**
 * 백그라운드 워커 시작 (앱 초기화 시 1회 호출)
 *
 * 일정 간격으로 processNextItem()을 호출하여 큐를 소진한다.
 * 처리 중인 항목이 없으면 다음 폴링까지 대기한다.
 */
export function startReviewApprovalWorker() {
  if (_workerRunning) {
    console.warn("[ReviewApprovalQueue] worker already running, skip");
    return;
  }
  _workerRunning = true;

  console.log(
    `[ReviewApprovalQueue] worker started (poll=${WORKER_POLL_INTERVAL_MS}ms, lock=${LOCK_TIMEOUT_MS}ms)`,
  );

  const tick = async () => {
    if (_workerTickRunning) return;

    if (mongoose.connection.readyState !== 1) {
      if (!_dbDisconnectedLogged || shouldLogTransientMongoNow()) {
        console.warn(
          "[ReviewApprovalQueue] worker tick skipped: MongoDB not connected",
          {
            readyState: mongoose.connection.readyState,
          },
        );
      }
      _dbDisconnectedLogged = true;
      return;
    }

    if (_dbDisconnectedLogged) {
      console.log("[ReviewApprovalQueue] MongoDB connection restored");
      _dbDisconnectedLogged = false;
      _lastTransientMongoLogAt = 0;
    }

    _workerTickRunning = true;
    try {
      // 큐가 빌 때까지 연속 처리
      let processed = await processNextItem();
      while (processed) {
        processed = await processNextItem();
      }
    } catch (err) {
      if (isTransientMongoConnectivityError(err)) {
        if (shouldLogTransientMongoNow()) {
          console.warn(
            "[ReviewApprovalQueue] worker tick transient Mongo error",
            {
              error: err?.message || String(err),
            },
          );
        }
      } else {
        console.error("[ReviewApprovalQueue] worker tick error", err);
      }
    } finally {
      _workerTickRunning = false;
    }
  };

  _workerInterval = setInterval(() => {
    void tick();
  }, WORKER_POLL_INTERVAL_MS);

  // 앱 종료 시 워커 정리
  process.once("SIGTERM", stopReviewApprovalWorker);
  process.once("SIGINT", stopReviewApprovalWorker);
}

/**
 * 워커 중지 (graceful shutdown 시 호출)
 */
export function stopReviewApprovalWorker() {
  if (_workerInterval) {
    clearInterval(_workerInterval);
    _workerInterval = null;
  }
  _workerRunning = false;
  console.log("[ReviewApprovalQueue] worker stopped");
}

/**
 * 큐 상태 조회 (관리자 모니터링용)
 */
export async function getQueueStatus() {
  const [pending, processing, failed, completed24h] = await Promise.all([
    ReviewApprovalQueue.countDocuments({ status: "PENDING" }),
    ReviewApprovalQueue.countDocuments({ status: "PROCESSING" }),
    ReviewApprovalQueue.countDocuments({ status: "FAILED" }),
    ReviewApprovalQueue.countDocuments({
      status: "COMPLETED",
      completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);
  return { pending, processing, failed, completed24h };
}
