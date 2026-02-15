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
import { getBridgeActiveProgram, getMachines } from "./cncMachine/machines.js";
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
  uploadAndEnqueueContinuousForMachine,
  smartUpload,
  getJobResult,
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

export {
  getDummySettingsForBridge,
  getDbBridgeQueueSnapshotForBridge,
  createCncDirectDownloadPresignForBridge,
  updateDummyLastRunKeyForBridge,
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
  initializeMachines,
};
