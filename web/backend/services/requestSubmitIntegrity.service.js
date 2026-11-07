// related files:
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/jobs/requestSubmitReconcileWorker.js
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// change-log:
// - 2026-11-08: 신설. 신규의뢰가 STL 없이 접수되거나 접수 후 후처리가 끊겨 제조사-준비에서 안 보이는 일을 막는다.
//
// 접수 전: S3 임시 업로드가 실제로 있는지 확인(사전 업로드 캐시가 오래돼 키만 남은 경우).
// 접수 후: 응답 뒤 후처리(출고일·크레딧 보류·STL 처리 트리거)가 서버 재시작 등으로 끊긴 건을 다시 이어 준다.
import { headObjectSizeInS3 } from "../utils/s3.utils.js";

const HEAD_CONCURRENCY = 8;

/** Jest는 가짜 s3Key를 쓴다. 실제 S3를 치지 않는다. */
export function isUploadVerifyEnabled() {
  if (process.env.JEST_WORKER_ID) return false;
  return (
    String(process.env.REQUEST_UPLOAD_VERIFY || "").trim().toLowerCase() !==
    "false"
  );
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const cur = next;
        next += 1;
        results[cur] = await worker(items[cur], cur);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/**
 * 케이스의 대표·추가 파일 s3Key가 S3에 있는지 확인한다.
 * 없거나 0바이트면 누락. S3 조회 자체가 실패하면(네트워크 등) 접수를 막지 않는다.
 * @param {Array<{ file?: object, files?: object[] }>} cases
 * @returns {Promise<Array<{ fileName: string, s3Key: string }>>}
 */
export async function findMissingUploadedFiles(cases) {
  if (!isUploadVerifyEnabled()) return [];
  const targets = [];
  const seen = new Set();
  for (const ci of Array.isArray(cases) ? cases : []) {
    const rows = [ci?.file, ...(Array.isArray(ci?.files) ? ci.files : [])];
    for (const f of rows) {
      const key = String(f?.s3Key || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      targets.push({
        s3Key: key,
        fileName: String(f?.originalName || f?.fileName || key).trim(),
      });
    }
  }
  if (!targets.length) return [];
  const missing = [];
  await runWithConcurrency(targets, HEAD_CONCURRENCY, async (target) => {
    try {
      const size = await headObjectSizeInS3(target.s3Key);
      if (size === null || !(size > 0)) missing.push(target);
    } catch (err) {
      console.warn(
        "[requestSubmitIntegrity] S3 head failed (접수는 계속)",
        target.s3Key,
        err?.message || err,
      );
    }
  });
  return missing;
}

const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
const RECONCILE_STL_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECONCILE_HOLD_WINDOW_MS = 30 * 60 * 1000;
const STALE_GENERATING_MS = 10 * 60 * 1000;

/**
 * 접수(201) 뒤 후처리가 끊긴 준비 의뢰를 이어 준다. 모두 멱등이다.
 * - 출고일·생산 스케줄 미계산 → 계산
 * - STL 처리(JS/Rhino) 트리거 유실 또는 GENERATING 정체 → 다시 트리거
 * - 크레딧 보류 미기록(최근 30분) → 보류(idempotencyKey)
 */
export async function runRequestSubmitReconcilePass({ limit = 50 } = {}) {
  const [
    { default: Request },
    { buildNonSampleRequestGuard, buildWorksheetReadyQueueGuard },
    { mongoMissingFilledStlFileClause },
  ] = await Promise.all([
    import("../models/request.model.js"),
    import("./worksheetReadyQueue.guard.js"),
    import("../utils/filledStlFile.js"),
  ]);

  const now = Date.now();
  const rows = await Request.find({
    manufacturerStage: "준비",
    createdAt: {
      $gte: new Date(now - RECONCILE_STL_WINDOW_MS),
      $lte: new Date(now - RECONCILE_MIN_AGE_MS),
    },
    "caseInfos.file.s3Key": { $exists: true, $ne: "" },
    $and: [
      buildNonSampleRequestGuard(),
      buildWorksheetReadyQueueGuard(),
      {
        $or: [
          { "productionSchedule.scheduledShipPickup": { $exists: false } },
          { "productionSchedule.scheduledShipPickup": null },
          {
            $and: [
              mongoMissingFilledStlFileClause(),
              {
                "productionSchedule.stlPreload.status": {
                  $nin: ["CANCELLED", "FAILED"],
                },
              },
            ],
          },
          { createdAt: { $gte: new Date(now - RECONCILE_HOLD_WINDOW_MS) } },
        ],
      },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.floor(limit)))
    .lean();

  const summary = { scanned: rows.length, schedule: 0, stl: 0, hold: 0 };
  if (!rows.length) return summary;

  // 스케줄 계산이 메모리 행의 productionSchedule을 덮어쓰므로 STL 대상은 먼저 정한다.
  const staleBefore = now - STALE_GENERATING_MS;
  const needStl = rows.filter((r) => {
    const preload = r?.productionSchedule?.stlPreload || null;
    const status = String(preload?.status || "").trim();
    if (status === "CANCELLED" || status === "FAILED") return false;
    const hasFilled = Boolean(
      String(r?.caseInfos?.stlFile?.s3Key || "").trim() ||
        String(r?.caseInfos?.camFile?.s3Key || "").trim(),
    );
    if (hasFilled) return false;
    if (!status || status === "NONE") return true;
    const updatedMs = new Date(preload?.updatedAt || 0).getTime();
    return status === "GENERATING" && updatedMs > 0 && updatedMs < staleBefore;
  });
  // 1) 스케줄
  const needSchedule = rows.filter((r) => !r?.productionSchedule?.scheduledShipPickup);
  if (needSchedule.length) {
    const [{ backfillCreatedRequestSchedule }, { default: BusinessAnchor }] =
      await Promise.all([
        import("../controllers/requests/creation.from-draft.controller.js"),
        import("../models/businessAnchor.model.js"),
      ]);
    const anchorIds = [
      ...new Set(needSchedule.map((r) => String(r.businessAnchorId || "")).filter(Boolean)),
    ];
    const anchors = anchorIds.length
      ? await BusinessAnchor.find({ _id: { $in: anchorIds } })
          .select({ "shippingPolicy.weeklyBatchDays": 1 })
          .lean()
      : [];
    const daysByAnchor = new Map(
      anchors.map((a) => [String(a._id), a?.shippingPolicy?.weeklyBatchDays || []]),
    );
    const byDays = new Map();
    for (const r of needSchedule) {
      const days = daysByAnchor.get(String(r.businessAnchorId || "")) || [];
      const k = JSON.stringify(days);
      if (!byDays.has(k)) byDays.set(k, { days, list: [] });
      byDays.get(k).list.push(r);
    }
    for (const { days, list } of byDays.values()) {
      try {
        await backfillCreatedRequestSchedule(list, { weeklyBatchDays: days });
        summary.schedule += list.length;
      } catch (err) {
        console.warn("[requestSubmitReconcile] schedule failed", err?.message || err);
      }
    }
  }

  // 2) 크레딧 보류 (최근 건만)
  const holdTargets = rows.filter(
    (r) => new Date(r.createdAt).getTime() >= now - RECONCILE_HOLD_WINDOW_MS,
  );
  if (holdTargets.length) {
    try {
      const [holdSvc, ledgerSvc] = await Promise.all([
        import("./requestCreditHold.service.js"),
        import("./generalLedger.service.js"),
      ]);
      const keys = holdTargets.map((r) => holdSvc.requestMachiningHoldKey(r._id));
      const existing = await ledgerSvc.getJournalsByIdempotencyKeys({
        idempotencyKeys: keys,
      });
      const pending = holdTargets.filter(
        (r) =>
          !holdSvc.shouldSkipMachiningHold(r) &&
          holdSvc.resolveMachiningHoldAmount(r) > 0 &&
          !existing.get(holdSvc.requestMachiningHoldKey(r._id))?.journalId,
      );
      if (pending.length) {
        await holdSvc.holdRequestCreditsOnSubmit({
          requests: pending,
          actorUserId: null,
          session: null,
          assumeNoExistingHolds: false,
        });
        summary.hold += pending.length;
      }
    } catch (err) {
      console.warn("[requestSubmitReconcile] hold failed", err?.message || err);
    }
  }

  // 3) STL 처리 트리거 유실/정체 (대상은 스케줄 단계 전에 정해 둔다)
  if (needStl.length) {
    try {
      const { triggerRhinoProcessFileForRequest } = await import(
        "../controllers/rhino/rhino.controller.js"
      );
      for (const r of needStl) {
        const filePath = String(r?.caseInfos?.file?.filePath || "").trim();
        if (!filePath) continue;
        triggerRhinoProcessFileForRequest({
          requestId: r.requestId,
          filePath,
          fileName: filePath,
        });
        summary.stl += 1;
      }
    } catch (err) {
      console.warn("[requestSubmitReconcile] stl trigger failed", err?.message || err);
    }
  }

  return summary;
}
