// related files:
// - web/backend/app.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middlewares/auth.middleware.js";
import * as controller from "../../controllers/scanbodyLibraries/scanbodyLibrary.controller.js";

const router = Router();

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 200 },
});

router.use(authenticate);

router.get("/", controller.listScanbodyLibraries);
router.get("/file", controller.downloadScanbodyGeometry);
router.post("/dme", memory.array("files", 200), controller.importDmeLibrary);
router.post("/templates", memory.single("file"), controller.upsertAbutmentTemplate);
router.delete("/templates/:id", controller.deleteAbutmentTemplate);
router.patch("/:id/kits/:kitId", controller.updateScanbodyKit);
router.delete("/:id", controller.deleteScanbodyLibrary);

export default router;
