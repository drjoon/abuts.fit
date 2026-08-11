// related files:
// - web/backend/utils/designClaim.js
// - web/backend/controllers/requests/designClaim.controller.js
// - web/backend/controllers/requests/creation.from-draft.controller.js
// - web/backend/socket.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/hooks/useWorksheetRealtimeStatus.ts
import Request from "../models/request.model.js";
import { emitAppEventToRoles } from "../socket.js";
import {
  DESIGN_CLAIM_ANNOUNCE_MS,
  isDesignClaimActive,
} from "./designClaim.js";

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimers = new Map();

const MAX_SCHEDULE_MS = 48 * 60 * 60 * 1000;

function timerKey(mongoId, reason) {
  return `${mongoId}:${reason}`;
}

export function clearDesignClaimTimers(mongoId) {
  const id = String(mongoId || "").trim();
  if (!id) return;
  const prefix = `${id}:`;
  for (const [key, handle] of pendingTimers.entries()) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(handle);
    pendingTimers.delete(key);
  }
}

export function emitDesignClaimChanged(payload = {}) {
  emitAppEventToRoles(["requestor", "admin"], "request:design-claim-changed", {
    ...payload,
    productMode: "design_custom_abutment",
    timestamp: new Date().toISOString(),
  });
}

function scheduleDesignClaimEmit(mongoId, reason, delayMs) {
  const id = String(mongoId || "").trim();
  if (!id) return;

  const key = timerKey(id, reason);
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);

  if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > MAX_SCHEDULE_MS) {
    pendingTimers.delete(key);
    return;
  }

  const handle = setTimeout(async () => {
    pendingTimers.delete(key);
    try {
      const doc = await Request.findById(id)
        .select({
          _id: 1,
          requestId: 1,
          manufacturerStage: 1,
          "caseInfos.productMode": 1,
          designClaim: 1,
        })
        .lean();
      if (!doc) return;
      if (String(doc?.caseInfos?.productMode || "").trim() !== "design_custom_abutment") {
        return;
      }
      if (String(doc.manufacturerStage || "").trim() !== "준비") return;

      if (reason === "announce-ended" && !isDesignClaimActive(doc.designClaim)) {
        return;
      }
      if (reason === "deadline-expired" && isDesignClaimActive(doc.designClaim)) {
        return;
      }

      emitDesignClaimChanged({
        requestId: doc.requestId,
        requestMongoId: String(doc._id),
        reason,
        designClaim: doc.designClaim || null,
      });
    } catch (error) {
      console.warn("[designClaimRealtime] scheduled emit failed", {
        mongoId: id,
        reason,
        error: error?.message,
      });
    }
  }, delayMs);

  pendingTimers.set(key, handle);
}

export function scheduleDesignClaimTransitions(request) {
  const mongoId = String(request?._id || "").trim();
  if (!mongoId) return;

  clearDesignClaimTimers(mongoId);

  const now = Date.now();
  const claimedAtMs = request?.designClaim?.claimedAt
    ? new Date(request.designClaim.claimedAt).getTime()
    : NaN;
  const deadlineMs = request?.designClaim?.deadlineAt
    ? new Date(request.designClaim.deadlineAt).getTime()
    : NaN;

  if (Number.isFinite(claimedAtMs)) {
    scheduleDesignClaimEmit(
      mongoId,
      "announce-ended",
      claimedAtMs + DESIGN_CLAIM_ANNOUNCE_MS - now,
    );
  }
  if (Number.isFinite(deadlineMs)) {
    scheduleDesignClaimEmit(mongoId, "deadline-expired", deadlineMs - now);
  }
}

export function notifyDesignClaimChanged(request, reason = "claimed") {
  if (!request?._id) return;

  emitDesignClaimChanged({
    requestId: request.requestId,
    requestMongoId: String(request._id),
    reason,
    designClaim: request.designClaim || null,
  });

  if (reason === "claimed") {
    scheduleDesignClaimTransitions(request);
  }
}
