import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { requireBgWorkerSecret } from "../../middlewares/bridgeSecret.middleware.js";
import * as rhinoController from "../../controllers/rhino/rhino.controller.js";

const router = Router();

// BG worker (rhino/bridge) may call this endpoint using X-Bridge-Secret
router.post(
  "/process-file",
  requireBgWorkerSecret,
  rhinoController.processFileByName,
);

// Other routes require normal authentication/authorization
router.use(authenticate);
router.use(authorize(["requestor", "manufacturer", "admin"]));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file?.originalname || "").toLowerCase();
    if (name.endsWith(".stl")) return cb(null, true);
    return cb(new Error("STL 파일만 업로드할 수 있습니다."), false);
  },
});

router.post(
  "/fillhole",
  upload.single("file"),
  rhinoController.fillholeFromUpload,
);

router.post("/fillhole/by-name", rhinoController.fillholeFromStoreName);

export default router;
