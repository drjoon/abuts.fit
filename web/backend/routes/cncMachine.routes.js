import express from "express";
import * as cncMachineController from "../controllers/cncMachine.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = express.Router();

// 모든 라우트에 인증 필요
router.use(authenticate);

// 장비 목록 조회 (제조사, 관리자)
router.get(
  "/",
  authorizeRoles("manufacturer", "admin"),
  cncMachineController.getMachines
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

// 장비 초기화 (개발용, 관리자만)
router.post(
  "/initialize",
  authorizeRoles("admin"),
  cncMachineController.initializeMachines
);

export default router;
