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
} from "../../controllers/cnc/bridgeQueue.js";
import {
  getBridgeActiveProgram,
  getMachineFlagsForBridge,
  getMachines,
} from "../../controllers/cnc/machines.js";
import {
  createCncDirectDownloadPresign,
  createCncDirectDownloadPresignForBridge,
  createCncDirectUploadPresign,
  enqueueCncDirectToDb,
} from "../../controllers/cnc/direct.js";
import {
  enqueueBridgeContinuousJob,
  enqueueBridgeContinuousJobFromDb,
  getBridgeContinuousState,
  getJobResult,
  uploadAndEnqueueContinuousForMachine,
  smartUpload,
} from "../../controllers/cnc/continuous.js";
import {
  applyProductionQueueBatchForMachine,
  getProductionQueues,
  reassignProductionQueues,
} from "../../controllers/cnc/production.js";
import {
  cancelScheduledMaterialChange,
  scheduleMaterialChange,
  updateMachineMaterial,
  updateMaterialRemaining,
} from "../../controllers/cnc/material.js";
import {
  getDummySettingsForBridge,
  updateDummyLastRunKeyForBridge,
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
  triggerNextAutoMachiningManually,
} from "../../controllers/cnc/machiningBridge.js";

export {
  getDummySettingsForBridge,
  getMachineFlagsForBridge,
  getDbBridgeQueueSnapshotForBridge,
  consumeBridgeQueueJobForBridge,
  createCncDirectDownloadPresignForBridge,
  updateDummyLastRunKeyForBridge,
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
  uploadAndEnqueueContinuousForMachine,
  createCncDirectUploadPresign,
  enqueueCncDirectToDb,
  createCncDirectDownloadPresign,
  getBridgeContinuousState,
  smartUpload,
  getJobResult,
  deleteBridgeQueueJob,
  reorderBridgeQueueForMachine,
  updateBridgeQueueJobQty,
  updateBridgeQueueJobPause,
  applyBridgeQueueBatchForMachine,
  clearBridgeQueueForMachine,
  getProductionQueues,
  applyProductionQueueBatchForMachine,
  reassignProductionQueues,
  updateMachineMaterial,
  updateMaterialRemaining,
  scheduleMaterialChange,
  cancelScheduledMaterialChange,
  updateDummySettings,
  updateDummyEnabledBulk,
  initializeMachines,
  getLastCompletedMachiningMap,
  getCompletedMachiningRecords,
};
