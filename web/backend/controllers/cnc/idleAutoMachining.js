// related files:
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/dummyProduct.js
// - web/backend/services/reviewApprovalQueue.service.js
// - web/backend/controllers/bg/bg.controller.js
// change-log:
// - 2026-10-31: 자동가공 ON + Now Playing 비어 있으면 Next Up 가능 건을 즉시 시작한다.
import Request from "../../models/request.model.js";

export async function kickIdleAutoMachiningIfNeeded({
  machineId,
  completedRequestId = "",
  allowAnodizingOff,
  onlyAnodizingOff,
  ignoreGrace,
} = {}) {
  const mid = String(machineId || "").trim();
  if (!mid) return;

  const running = await Request.exists({
    manufacturerStage: "가공",
    "productionSchedule.assignedMachine": mid,
    "productionSchedule.machiningProgress.phase": "STARTED",
  });
  if (running) return;

  const { triggerNextAutoMachiningAfterComplete } = await import(
    "./machiningBridge.js"
  );
  return triggerNextAutoMachiningAfterComplete({
    machineId: mid,
    completedRequestId,
    ...(typeof allowAnodizingOff === "boolean" ? { allowAnodizingOff } : {}),
    ...(typeof onlyAnodizingOff === "boolean" ? { onlyAnodizingOff } : {}),
    ...(typeof ignoreGrace === "boolean" ? { ignoreGrace } : {}),
  });
}
