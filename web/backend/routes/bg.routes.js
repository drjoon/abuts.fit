import { Router } from "express";
import * as bgController from "../controllers/bg.controller.js";
import lotCaptureController from "../controllers/lotCapture.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { requireBridgeSecret } from "../middlewares/bridgeSecret.middleware.js";
import { requireBridgeIpAllowlist } from "../middlewares/bridgeIpAllowlist.middleware.js";

const router = Router();

// 브리지 전용 엔드포인트: 시크릿 + IP 허용목록
router.post(
  "/register-file",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.registerProcessedFile,
);

router.post(
  "/register-finish-line",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.registerFinishLine,
);
router.post(
  "/presign-upload",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getPresignedUploadUrl,
);
router.post(
  "/lot-capture/packaging",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  lotCaptureController.handlePackagingCapture,
);
router.get(
  "/file-status",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getFileProcessingStatus,
);
router.get(
  "/status",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getBgStatus,
);
router.get(
  "/pending-stl",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.listPendingStl,
);
router.get(
  "/original-file",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.downloadOriginalFile,
);
router.get(
  "/request-meta",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
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
