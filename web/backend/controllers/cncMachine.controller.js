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
} from "./cncMachine/bridgeQueue.js";
import {
  getBridgeActiveProgram,
  getMachineFlagsForBridge,
  getMachines,
} from "./cncMachine/machines.js";
import {
  createCncDirectDownloadPresign,
  createCncDirectDownloadPresignForBridge,
  createCncDirectUploadPresign,
  enqueueCncDirectToDb,
} from "./cncMachine/direct.js";
import {
  enqueueBridgeContinuousJob,
  enqueueBridgeContinuousJobFromDb,
  getBridgeContinuousState,
  getJobResult,
  uploadAndEnqueueContinuousForMachine,
  smartUpload,
} from "./cncMachine/continuous.js";
import {
  applyProductionQueueBatchForMachine,
  getProductionQueues,
} from "./cncMachine/production.js";
import {
  cancelScheduledMaterialChange,
  scheduleMaterialChange,
  updateMachineMaterial,
  updateMaterialRemaining,
} from "./cncMachine/material.js";
import {
  getDummySettingsForBridge,
  updateDummyLastRunKeyForBridge,
  updateDummySettings,
  updateDummyEnabledBulk,
} from "./cncMachine/dummy.js";
import { initializeMachines } from "./cncMachine/dev.js";
import {
  recordMachiningCompleteForBridge,
  recordMachiningStartForBridge,
  cancelMachiningForMachine,
  recordMachiningFailForBridge,
  recordMachiningTickForBridge,
  getLastCompletedMachiningMap,
} from "./cncMachine/machiningBridge.js";

export {
  getDummySettingsForBridge,
  getMachineFlagsForBridge,
  getDbBridgeQueueSnapshotForBridge,
  consumeBridgeQueueJobForBridge,
  createCncDirectDownloadPresignForBridge,
  updateDummyLastRunKeyForBridge,
  recordMachiningTickForBridge,
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
  updateMachineMaterial,
  updateMaterialRemaining,
  scheduleMaterialChange,
  cancelScheduledMaterialChange,
  updateDummySettings,
  updateDummyEnabledBulk,
  initializeMachines,
  getLastCompletedMachiningMap,
};
