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

function allowPackingCaptureAccess(req, res, next) {
  const hasBearerAuth = String(req.headers.authorization || "").startsWith(
    "Bearer ",
  );

  if (hasBearerAuth) {
    return authenticate(req, res, () => {
      const role = String(req.user?.role || "").trim();
      if (!["manufacturer", "admin"].includes(role)) {
        return res.status(403).json({
          success: false,
          message: "이 작업을 수행할 권한이 없습니다.",
        });
      }
      return next();
    });
  }

  return requireBridgeIpAllowlist(req, res, () =>
    requireBgWorkerSecret(req, res, next),
  );
}

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
  allowPackingCaptureAccess,
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

// STL 메타데이터 등록 (rhino-server -> backend)
router.post(
  "/register-stl-metadata",
  requireBridgeIpAllowlist,
  requireBgWorkerSecret,
  bgController.registerStlMetadata,
);

// STL 메타데이터 조회 (frontend -> backend)
router.get(
  "/stl-metadata/:requestId",
  authenticate,
  bgController.getStlMetadata,
);

// STL 메타데이터 재생성 요청 (frontend -> backend -> rhino-server)
router.post(
  "/recalculate-stl-metadata/:requestId",
  authenticate,
  authorize("manufacturer", "admin"),
  bgController.recalculateStlMetadata,
);

export default router;
