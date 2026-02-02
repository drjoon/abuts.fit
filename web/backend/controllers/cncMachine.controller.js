import {
  completeManualFileJobForBridge,
  startManualFileJobForBridge,
  manualFilePlay,
  manualFileUploadAndPreload,
} from "./cncMachine/manualFile.js";
import {
  applyBridgeQueueBatchForMachine,
  clearBridgeQueueForMachine,
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
  enqueueBridgeManualInsertJob,
  getBridgeContinuousState,
  smartUpload,
  smartEnqueue,
  smartDequeue,
  smartStart,
  smartStatus,
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
} from "./cncMachine/dummy.js";
import { initializeMachines } from "./cncMachine/dev.js";
import {
  recordMachiningCompleteForBridge,
  recordMachiningFailForBridge,
  recordMachiningTickForBridge,
} from "./cncMachine/machiningBridge.js";

export {
  completeManualFileJobForBridge,
  startManualFileJobForBridge,
  manualFileUploadAndPreload,
  manualFilePlay,
  getDummySettingsForBridge,
  getMachineFlagsForBridge,
  getDbBridgeQueueSnapshotForBridge,
  createCncDirectDownloadPresignForBridge,
  updateDummyLastRunKeyForBridge,
  recordMachiningTickForBridge,
  recordMachiningCompleteForBridge,
  recordMachiningFailForBridge,
  getMachines,
  getBridgeQueueForMachine,
  getBridgeActiveProgram,
  enqueueBridgeContinuousJob,
  enqueueBridgeContinuousJobFromDb,
  enqueueBridgeManualInsertJob,
  createCncDirectUploadPresign,
  enqueueCncDirectToDb,
  createCncDirectDownloadPresign,
  getBridgeContinuousState,
  smartUpload,
  smartEnqueue,
  smartDequeue,
  smartStart,
  smartStatus,
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
  initializeMachines,
};
