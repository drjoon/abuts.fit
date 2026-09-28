// related files:
// - web/backend/app.js
// - web/backend/controllers/scanbodyLibraries/scanbodyLibrary.controller.js
// 업로드 원본은 브라우저가 presigned POST로 S3에 직접 올린다. 이 라우터는 파일 본문을 받지 않는다.
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import * as controller from "../../controllers/scanbodyLibraries/scanbodyLibrary.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", controller.listScanbodyLibraries);
router.get("/file", controller.downloadScanbodyGeometry);
router.get("/uploads", controller.listLibraryUploads);
router.post("/uploads", controller.createLibraryUpload);
router.post("/uploads/:uploadId/complete", controller.completeLibraryUpload);
router.get("/templates/uploads", controller.listTemplateUploadsHandler);
router.post("/templates/uploads", controller.createTemplateUploadHandler);
router.post("/templates/uploads/:uploadId/complete", controller.completeTemplateUploadHandler);
router.post("/templates/uploads/:uploadId/approve", controller.approveTemplateUploadHandler);
router.post("/templates/uploads/:uploadId/reject", controller.rejectTemplateUploadHandler);
router.get("/templates/reviews", controller.listTemplateReviews);
router.delete("/templates/:id", controller.deleteAbutmentTemplate);
router.get("/blocklist", controller.listUploadBlocklist);
router.delete("/blocklist/:id", controller.unblockUploader);
router.patch("/:id/kits/:kitId", controller.updateScanbodyKit);
router.patch("/:id/visibility", controller.updateScanbodyVisibility);
router.delete("/:id", controller.deleteScanbodyLibrary);

export default router;
