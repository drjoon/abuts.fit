import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  createDraft,
  getDraft,
  updateDraft,
  addFileToDraft,
  removeFileFromDraft,
  deleteDraft,
} from "../../controllers/requests/draftRequest.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize(["requestor", "admin"]));

// 새 드래프트 생성
router.post("/", createDraft);

// 드래프트 조회
router.get("/:id", getDraft);

// 드래프트 업데이트 (message/caseInfos)
router.patch("/:id", updateDraft);

// 파일 메타데이터 추가
router.post("/:id/files", addFileToDraft);

// 파일 메타데이터 삭제
router.delete("/:id/files/:fileId", removeFileFromDraft);

// 드래프트 삭제
router.delete("/:id", deleteDraft);

export default router;
