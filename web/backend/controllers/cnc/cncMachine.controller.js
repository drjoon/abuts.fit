// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/cnc/machiningBridge.js
// - web/backend/controllers/cnc/production.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/MachiningQueueBoard.tsx
import {
  applyBridgeQueueBatchForMachine,
  clearBridgeQueueForMachine,
  consumeBridgeQueueJobForBridge,
  deleteBridgeQueueJob,
  getBridgeQueueForMachine,
  getDbBridgeQueueSnapshotForBridge,
  reorderBridgeQueueForMachine,
  updateBridgeQueueJobPause,
  updateBridgeQueueJobQty,
  reconcileBridgeQueueSnapshot,
} from "../../controllers/cnc/bridgeQueue.js";
import {
  getBridgeActiveProgram,
  getMachineFlagsForBridge,
  getMachines,
} from "../../controllers/cnc/machines.js";
import {
  createCncLabDownloadPresign,
  createCncLabDownloadPresignForBridge,
  createCncLabUploadPresign,
  enqueueCncLabToDb,
} from "../../controllers/cnc/direct.js";
import {
  enqueueBridgeContinuousJob,
  enqueueBridgeContinuousJobFromDb,
  getBridgeContinuousState,
  getJobResult,
  saveJobProgramCode,
  manUpload,
  smartUpload,
} from "../../controllers/cnc/continuous.js";
import {
  applyProductionQueueBatchForMachine,
  getProductionQueues,
  reassignProductionQueues,
  moveProductionQueueRequest,
  getExpressDeadlineRebalanceAlert,
  getMachiningPriorityRulesHandler,
} from "../../controllers/cnc/production.js";
import {
  cancelScheduledMaterialChange,
  scheduleMaterialChange,
  updateMachineMaterial,
  updateMaterialRemaining,
} from "../../controllers/cnc/material.js";
import {
  updateDummySettings,
  updateDummyEnabledBulk,
} from "../../controllers/cnc/dummy.js";
import { initializeMachines } from "../../controllers/cnc/dev.js";
import {
  recordMachiningCompleteForBridge,
  recordMachiningStartForBridge,
  cancelMachiningForMachine,
  recordMachiningFailForBridge,
  recordMachiningTickForBridge,
  getLastCompletedMachiningMap,
  getCompletedMachiningRecords,
  getPendingSelfInspections,
  triggerNextAutoMachiningManually,
} from "../../controllers/cnc/machiningBridge.js";

export {
  getMachineFlagsForBridge,
  getDbBridgeQueueSnapshotForBridge,
  consumeBridgeQueueJobForBridge,
  createCncLabDownloadPresignForBridge,
  recordMachiningTickForBridge,
  triggerNextAutoMachiningManually,
  recordMachiningStartForBridge,
  recordMachiningCompleteForBridge,
  recordMachiningFailForBridge,
  cancelMachiningForMachine,
  getMachines,
  getBridgeQueueForMachine,
  getBridgeActiveProgram,
  enqueueBridgeContinuousJob,
  enqueueBridgeContinuousJobFromDb,
  manUpload,
  saveJobProgramCode,
  createCncLabUploadPresign,
  enqueueCncLabToDb,
  createCncLabDownloadPresign,
  getBridgeContinuousState,
  smartUpload,
  getJobResult,
  deleteBridgeQueueJob,
  reorderBridgeQueueForMachine,
  updateBridgeQueueJobQty,
  updateBridgeQueueJobPause,
  applyBridgeQueueBatchForMachine,
  clearBridgeQueueForMachine,
  reconcileBridgeQueueSnapshot,
  getProductionQueues,
  applyProductionQueueBatchForMachine,
  reassignProductionQueues,
  moveProductionQueueRequest,
  getExpressDeadlineRebalanceAlert,
  getMachiningPriorityRulesHandler,
  updateMachineMaterial,
  updateMaterialRemaining,
  scheduleMaterialChange,
  cancelScheduledMaterialChange,
  updateDummySettings,
  updateDummyEnabledBulk,
  initializeMachines,
  getLastCompletedMachiningMap,
  getCompletedMachiningRecords,
  getPendingSelfInspections,
};
