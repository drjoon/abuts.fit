import express from "express";
import * as cncMachineController from "../controllers/cncMachine.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { requireBridgeSecret } from "../middlewares/bridgeSecret.middleware.js";
import { requireBridgeIpAllowlist } from "../middlewares/bridgeIpAllowlist.middleware.js";

const router = express.Router();

// 브리지 서버 전용(시크릿 기반)
router.get(
  "/bridge/dummy-settings",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.getDummySettingsForBridge
);
router.patch(
  "/bridge/dummy-settings/:machineId/last-run-key",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  cncMachineController.updateDummyLastRunKeyForBridge
);

// 모든 라우트에 인증 필요
router.use(authenticate);

// 장비 목록 조회 (제조사, 관리자)
router.get(
  "/",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getMachines
);

// 브리지 예약 큐 조회 (머신별)
router.get(
  "/:machineId/bridge-queue",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getBridgeQueueForMachine
);

// 브리지 예약 큐에서 단일 작업 삭제
router.delete(
  "/:machineId/bridge-queue/:jobId",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.deleteBridgeQueueJob
);

// 브리지 예약 큐 전체 삭제
router.post(
  "/:machineId/bridge-queue/clear",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.clearBridgeQueueForMachine
);

// 생산 큐 조회 (제조사, 관리자)
router.get(
  "/queues",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getProductionQueues
);

// 소재 세팅 변경 (제조사, 관리자)
router.patch(
  "/:machineId/material",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateMachineMaterial
);

router.patch(
  "/:machineId/material-remaining",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateMaterialRemaining
);

// 소재 교체 예약 (제조사, 관리자)
router.post(
  "/:machineId/schedule-material-change",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.scheduleMaterialChange
);

// 소재 교체 예약 취소 (제조사, 관리자)
router.delete(
  "/:machineId/schedule-material-change",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.cancelScheduledMaterialChange
);

// 더미 프로그램/스케줄 설정 저장 (제조사, 관리자)
router.patch(
  "/:machineId/dummy-settings",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.updateDummySettings
);

// 장비 초기화 (개발용, 관리자만)
router.post(
  "/initialize",
  authorizeRoles("admin"),
  cncMachineController.initializeMachines
);

export default router;
