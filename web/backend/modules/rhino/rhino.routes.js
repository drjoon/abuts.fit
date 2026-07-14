import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { requireBgWorkerSecret } from "../../middlewares/bridgeSecret.middleware.js";
import * as rhinoController from "../../controllers/rhino/rhino.controller.js";

const router = Router();

// Conditional middleware: if X-Bridge-Secret header present, validate it; otherwise require JWT auth+role.
function requireBgOrAuth(req, res, next) {
  const provided =
    (req.headers &&
      (req.headers["x-bridge-secret"] || req.headers["X-Bridge-Secret"])) ||
    req.get("X-Bridge-Secret");
  if (provided) {
    return requireBgWorkerSecret(req, res, next);
  }
  // no bg secret -> use authenticate + authorize
  return authenticate(req, res, () =>
    authorize(["requestor", "manufacturer", "admin"])(req, res, next),
  );
}

// Allow both BG workers (by X-Bridge-Secret) and authenticated users to call /process-file
router.post(
  "/process-file",
  requireBgOrAuth,
  rhinoController.processFileByName,
);



// Other routes require normal authentication/authorization
router.use(authenticate);
router.use(authorize(["requestor", "manufacturer", "admin"]));

router.post("/finish-line/manual", rhinoController.saveManualFinishLine);

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
