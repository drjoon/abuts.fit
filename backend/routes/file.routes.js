import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { s3Upload } from "../utils/s3.utils.js";
import * as fileController from "../controllers/file.controller.js";

const router = Router();

// 파일 업로드 (기존 - 디스크 기반)
router.post(
  "/upload",
  authenticate,
  upload.fields, // 'file'과 'files' 필드 모두 지원
  fileController.uploadFile
);

// 임시 파일 업로드 (S3, 의뢰 미지정, 사용자별 중복 방지)
router.post(
  "/temp",
  authenticate,
  s3Upload.array("files", 20),
  fileController.uploadTempFiles
);

// 전체 파일 목록 조회 (관리자) 또는 의뢰 ID로 필터링
router.get("/", authenticate, fileController.getFiles);

// 내 파일 목록 조회
router.get("/my", authenticate, fileController.getMyFiles);

// 특정 의뢰의 파일 목록 조회
router.get("/request/:requestId", authenticate, fileController.getRequestFiles);

// 파일 다운로드 URL 생성
router.get(
  "/:id/download-url",
  authenticate,
  fileController.getFileDownloadUrl
);

// 파일 상세 조회
router.get("/:id", authenticate, fileController.getFileById);

// 파일 삭제
router.delete("/:id", authenticate, fileController.deleteFile);

export default router;
