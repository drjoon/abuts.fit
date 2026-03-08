import { Router } from "express";
import * as bgController from "../../controllers/bg/bg.controller.js";
import { handlePackingCapture } from "../../controllers/ai/lotCapture.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  requireBgWorkerSecret,
  requireBridgeSecret,
} from "../../middlewares/bridgeSecret.middleware.js";
import { requireBridgeIpAllowlist } from "../../middlewares/bridgeIpAllowlist.middleware.js";

const router = Router();

// 브리지 전용 엔드포인트: 시크릿 + IP 허용목록
router.post(
  "/register-file",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.registerProcessedFile,
);

router.post(
  "/register-finish-line",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.registerFinishLine,
);
router.post(
  "/presign-upload",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.getPresignedUploadUrl,
);
router.post(
  "/runtime-status",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.registerRuntimeStatus,
);
router.post(
  "/lot-capture/packing",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  handlePackingCapture,
);
router.get(
  "/file-status",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.getFileProcessingStatus,
);
router.get(
  "/status",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.getBgStatus,
);
router.get(
  "/pending-stl",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.listPendingStl,
);
router.get(
  "/pending-nc",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.listPendingNc,
);
router.get(
  "/original-file",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.downloadOriginalFile,
);
router.get(
  "/source-file",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.downloadSourceFile,
);
router.get(
  "/request-meta",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.getRequestMeta,
);

// 브리지 설정 등록(bridge -> backend) 및 조회(frontend)
router.post(
  "/bridge-settings",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.registerBridgeSettings,
);
router.get(
  "/bridge-settings",
  authenticate,
  authorize("manufacturer", "admin"),
  bgController.getBridgeSettings,
);

export default router;
