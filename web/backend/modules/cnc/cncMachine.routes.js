import express from "express";
import * as cncMachineController from "../../controllers/cnc/cncMachine.controller.js";
import * as cncEventController from "../../controllers/cnc/cncEvent.controller.js";
import * as machiningCallbackController from "../../controllers/cnc/machiningCallback.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/role.middleware.js";
import { requireBridgeSecret } from "../../middlewares/bridgeSecret.middleware.js";
import { requireBridgeIpAllowlist } from "../../middlewares/bridgeIpAllowlist.middleware.js";

const router = express.Router();

// 브리지 서버 전용(시크릿 기반)
// 가공 완료 콜백 (브리지 서버에서 호출)
router.post(
  "/:machineId/smart/machining-completed",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  machiningCallbackController.machiningCompleted,
);

router.get(
  "/bridge/dummy-settings",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.getDummySettingsForBridge,
);
router.get(
  "/bridge/queue-snapshot/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.getDbBridgeQueueSnapshotForBridge,
);

router.post(
  "/bridge/queue-consume/:machineId/:jobId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.consumeBridgeQueueJobForBridge,
);

router.get(
  "/bridge/cnc-direct/presign-download/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.createCncDirectDownloadPresignForBridge,
);
router.get(
  "/bridge/machine-flags/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.getMachineFlagsForBridge,
);
router.post(
  "/bridge/machining/tick/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.recordMachiningTickForBridge,
);
router.post(
  "/bridge/machining/start/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.recordMachiningStartForBridge,
);
router.post(
  "/bridge/machining/complete/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.recordMachiningCompleteForBridge,
);
router.post(
  "/bridge/machining/fail/:machineId",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.recordMachiningFailForBridge,
);

// 수동 자동 가공 트리거: 프론트에서 호출해 다음 대기 의뢰 가공을 시작
router.post(
  "/machining/auto-trigger/:machineId",
  authenticate,
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.triggerNextAutoMachiningManually,
);
router.patch(
  "/bridge/dummy-settings/:machineId/last-run-key",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.updateDummyLastRunKeyForBridge,
);

// 모든 라우트에 인증 필요
router.use(authenticate);

// 장비별 마지막 가공 완료 조회 (제조사, 관리자)
router.get(
  "/machining/last-completed",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getLastCompletedMachiningMap,
);

// 가공 완료 목록 조회 (제조사, 관리자)
router.get(
  "/machining/completed",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getCompletedMachiningRecords,
);

// 장비 목록 조회 (제조사, 관리자)
router.get(
  "/",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getMachines,
);

// 더미 가공 전체 on/off (제조사, 관리자)
router.patch(
  "/dummy/enabled",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateDummyEnabledBulk,
);

// 더미 가공 on/off (단일 장비)
router.patch(
  "/:machineId/dummy/enabled",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateDummySettings,
);

// 브리지 예약 큐 조회 (머신별)
router.get(
  "/:machineId/bridge-queue",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getBridgeQueueForMachine,
);

// 브리지 예약 큐 단건 삭제
router.delete(
  "/:machineId/bridge-queue/:jobId",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.deleteBridgeQueueJob,
);

// 브리지 예약 큐 전체 삭제
router.post(
  "/:machineId/bridge-queue/clear",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.clearBridgeQueueForMachine,
);

// 활성 프로그램 조회 (브리지 경유)
router.get(
  "/:machineId/programs/active",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getBridgeActiveProgram,
);

// 제조사 UI에서 stop(정지) 후 가공 기록을 취소로 마감
router.post(
  "/:machineId/machining/cancel",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.cancelMachiningForMachine,
);

router.post(
  "/:machineId/smart/upload",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.smartUpload,
);

// 작업 결과 조회 (이중 응답 방식)
router.get(
  "/:machineId/jobs/:jobId",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getJobResult,
);

// 브리지 연속 가공 enqueue
router.post(
  "/:machineId/continuous/enqueue",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.enqueueBridgeContinuousJob,
);

// DB 큐(requestId) 기반 브리지 연속 가공 enqueue
router.post(
  "/:machineId/continuous/enqueue-from-db",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.enqueueBridgeContinuousJobFromDb,
);

// CNC(3-direct) 업로드: presign 발급 + DB 예약목록 enqueue (브리지 서버 다운 시에도 동작)
router.post(
  "/:machineId/direct/presign",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.createCncDirectUploadPresign,
);
router.post(
  "/:machineId/direct/enqueue",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.enqueueCncDirectToDb,
);

router.post(
  "/:machineId/continuous/upload",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.uploadAndEnqueueContinuousForMachine,
);

router.get(
  "/:machineId/direct/presign-download",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.createCncDirectDownloadPresign,
);

// 브리지 연속 가공 상태 조회
router.get(
  "/:machineId/continuous/state",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getBridgeContinuousState,
);

// 장비별 CNC 이벤트 조회
router.get(
  "/:machineId/events",
  authorizeRoles("manufacturer", "admin"),
  cncEventController.getCncEventsByMachineId,
);

// 브리지 예약 큐에서 단일 작업 삭제
router.delete(
  "/:machineId/bridge-queue/:jobId",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.deleteBridgeQueueJob,
);

// 브리지 예약 큐 재정렬
router.post(
  "/:machineId/bridge-queue/reorder",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.reorderBridgeQueueForMachine,
);

// 브리지 예약 큐 작업 수량(qty) 변경
router.patch(
  "/:machineId/bridge-queue/:jobId/qty",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateBridgeQueueJobQty,
);

// 브리지 예약 큐 일시정지(pause) 변경
router.patch(
  "/:machineId/bridge-queue/:jobId/pause",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateBridgeQueueJobPause,
);

// 브리지 예약 큐 배치 변경 (qty/order/delete/clear)
router.post(
  "/:machineId/bridge-queue/batch",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.applyBridgeQueueBatchForMachine,
);

// 브리지 예약 큐 전체 삭제
router.post(
  "/:machineId/bridge-queue/clear",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.clearBridgeQueueForMachine,
);

// 생산 큐 조회 (제조사, 관리자)
router.get(
  "/queues",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getProductionQueues,
);

// 생산 큐 배치 변경 (순서/수량/삭제)
router.post(
  "/:machineId/production-queue/batch",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.applyProductionQueueBatchForMachine,
);

// 소재 세팅 변경 (제조사, 관리자)
router.patch(
  "/:machineId/material",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateMachineMaterial,
);

router.patch(
  "/:machineId/material-remaining",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateMaterialRemaining,
);

// 소재 교체 예약 (제조사, 관리자)
router.post(
  "/:machineId/schedule-material-change",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.scheduleMaterialChange,
);

// 소재 교체 예약 취소 (제조사, 관리자)
router.delete(
  "/:machineId/schedule-material-change",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.cancelScheduledMaterialChange,
);

// 더미 프로그램/스케줄 설정 저장 (제조사, 관리자)
router.patch(
  "/:machineId/dummy-settings",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateDummySettings,
);

// 장비 초기화 (개발용, 관리자만)
router.post(
  "/initialize",
  authorizeRoles("admin"),
  cncMachineController.initializeMachines,
);

export default router;
