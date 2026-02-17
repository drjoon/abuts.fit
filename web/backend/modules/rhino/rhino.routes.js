import { Router } from "express";
import multer from "multer";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as rhinoController from "../../controllers/rhino.controller.js";

const router = Router();

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

router.post("/process-file", rhinoController.processFileByName);

export default router;
