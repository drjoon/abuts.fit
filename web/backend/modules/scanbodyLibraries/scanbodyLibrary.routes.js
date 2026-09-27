// related files:
// - web/backend/app.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware.js";
import * as controller from "../../controllers/scanbodyLibraries/scanbodyLibrary.controller.js";

const router = Router();

const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
});

router.use(authenticate);

router.get("/", controller.listScanbodyLibraries);
router.get("/file", controller.downloadScanbodyGeometry);
router.get("/uploads", controller.listLibraryUploads);
router.post("/uploads", controller.createLibraryUpload);
router.post("/uploads/:uploadId/complete", controller.completeLibraryUpload);
router.post("/templates", templateUpload.single("file"), controller.upsertAbutmentTemplate);
router.delete("/templates/:id", controller.deleteAbutmentTemplate);
router.patch("/:id/kits/:kitId", controller.updateScanbodyKit);
router.patch("/:id/visibility", controller.updateScanbodyVisibility);
router.delete("/:id", controller.deleteScanbodyLibrary);

export default router;
