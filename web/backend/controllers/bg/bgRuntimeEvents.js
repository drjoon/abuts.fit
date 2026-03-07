import { emitAppEventToRoles } from "../../socket.js";

const BG_RUNTIME_EVENT_TYPE = "bg:runtime-status";

const DEFAULT_ROLES = ["manufacturer", "admin"];

export function emitBgRuntimeStatus(payload = {}, roles = DEFAULT_ROLES) {
  const requestId = String(payload?.requestId || "").trim();
  const source = String(payload?.source || "").trim();
  const status = String(payload?.status || "").trim();
  const label = String(payload?.label || "").trim();
  if (!requestId && !source && !label && !status) return;

  emitAppEventToRoles(roles, BG_RUNTIME_EVENT_TYPE, {
    requestId: requestId || null,
    requestMongoId: payload?.requestMongoId
      ? String(payload.requestMongoId).trim()
      : null,
    source: source || null,
    stage: payload?.stage ? String(payload.stage).trim() : null,
    status: status || null,
    label: label || null,
    tone: payload?.tone ? String(payload.tone).trim() : null,
    startedAt: payload?.startedAt || null,
    elapsedSeconds:
      Number.isFinite(Number(payload?.elapsedSeconds)) &&
      Number(payload?.elapsedSeconds) >= 0
        ? Math.floor(Number(payload.elapsedSeconds))
        : null,
    clear: payload?.clear === true,
    metadata:
      payload?.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : null,
  });
}

export { BG_RUNTIME_EVENT_TYPE };
