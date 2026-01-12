import { Router } from "express";
import * as bgController from "../controllers/bg.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { requireBridgeSecret } from "../middlewares/bridgeSecret.middleware.js";
import { requireBridgeIpAllowlist } from "../middlewares/bridgeIpAllowlist.middleware.js";

const router = Router();

// 브리지 전용 엔드포인트: 시크릿 + IP 허용목록
router.post(
  "/register-file",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.registerProcessedFile
);
router.post(
  "/presign-upload",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getPresignedUploadUrl
);
router.get(
  "/file-status",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getFileProcessingStatus
);
router.get(
  "/status",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getBgStatus
);
router.get(
  "/pending-stl",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.listPendingStl
);
router.get(
  "/original-file",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.downloadOriginalFile
);
router.get(
  "/request-meta",
  requireBridgeIpAllowlist,
  requireBridgeSecret,
  bgController.getRequestMeta
);

export default router;
