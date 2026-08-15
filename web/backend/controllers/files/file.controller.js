// change-log:
// - 2026-08-15: 기공소 CA — 어벗츠 디자인 전 PracticeTransfer 구강스캔 S3 다운로드 차단.
// - 2026-08-10: 디자인 파트너가 Request caseInfos 파일 S3 키 다운로드 가능.
// - 2026-08-11: temp multipart + gzip ContentEncoding 지원, 다운로드 시 gunzip.
// related files:
// - web/backend/modules/files/file.routes.js
// - web/backend/models/file.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/utils/designAccess.js
// - web/backend/utils/s3.utils.js
// - web/frontend/src/shared/hooks/useS3TempUpload.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
import mongoose, { Types } from "mongoose";
import path from "path";
import fs from "fs/promises";
import File from "../../models/file.model.js";
import Request from "../../models/request.model.js";
import ChatRoom from "../../models/chatRoom.model.js";
import Chat from "../../models/chat.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import s3Utils from "../../utils/s3.utils.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { resolveDesignAccessForUser } from "../../utils/designAccess.js";
import {
  shouldLockLabOralScanDownload,
} from "../../services/practiceTransferProduction.service.js";

const getFileType = (filename) => {
  const extension = filename.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif"].includes(extension)) return "image";
  if (["pdf"].includes(extension)) return "pdf";
  if (["zip", "rar", "7z"].includes(extension)) return "archive";
  return "other";
};

// 클라이언트에서 전달한 원본 파일명을 NFC로만 정규화해서 사용한다.
const normalizeOriginalName = (name) => {
  if (typeof name !== "string") return String(name || "");
  try {
    return name.normalize("NFC");
  } catch {
    return name;
  }
};

const getExtFromName = (name) => {
  const n = String(name || "");
  if (!n.includes(".")) return "";
  const ext = `.${n.split(".").pop().toLowerCase()}`;
  return ext.length > 10 ? "" : ext;
};

// [정책] uploadToRhinoServer / uploadS3ToRhinoServer 제거
// 백엔드가 rhino-server에 직접 파일을 전송하던 방식 삭제.
// rhino-server가 /api/rhino/process-file 호출 시 /bg/original-file → S3에서 직접 다운로드함.

// 임시 파일 업로드 (의뢰와 아직 연결되지 않은 상태, 사용자별 중복 방지)
export const uploadTempFiles = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    throw new ApiError(400, "하나 이상의 파일이 필요합니다.");
  }

  const uploadedBy = req.user._id;
  const results = [];

  for (const [index, file] of files.entries()) {
    const { mimetype, size, buffer } = file;
    const bodyNames = req.body?.originalNames;
    let rawName;
    if (Array.isArray(bodyNames)) {
      rawName = bodyNames[index];
    } else if (typeof bodyNames === "string") {
      rawName = bodyNames;
    } else {
      rawName = file.originalname;
    }

    const originalname = normalizeOriginalName(rawName);

    // 사용자별 파일명+용량 기준 중복 검사
    const existing = await File.findOne({
      uploadedBy,
      originalName: originalname,
      size,
    }).lean();

    if (existing) {
      const existingKey = String(existing?.key || "").trim();
      let existsInS3 = false;
      if (existingKey) {
        try {
          existsInS3 = await s3Utils.objectExistsInS3(existingKey);
        } catch {
          existsInS3 = false;
        }
      }

      if (!existsInS3) {
        await File.findByIdAndDelete(existing._id);
        const ext = originalname.includes(".")
          ? `.${originalname.split(".").pop().toLowerCase()}`
          : "";
        const key = `uploads/users/${uploadedBy.toString()}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}${ext}`;

        const uploaded = await s3Utils.uploadFileToS3(buffer, key, mimetype);

        if (!uploaded || !uploaded.location) {
          throw new ApiError(500, "S3 업로드에 실패했습니다.");
        }

        const fileType =
          s3Utils.getFileType(originalname) || getFileType(originalname);

        const created = await File.create({
          originalName: originalname,
          encoding: file.encoding,
          mimetype,
          size,
          bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
          key: uploaded.key || key,
          location: uploaded.location,
          contentType: mimetype,
          uploadedBy,
          fileType,
          isPublic: false,
        });

        results.push(created.toObject());
        continue;
      } else {
        // 중복 파일이 이미 존재하면 새로 업로드하지 않고 기존 문서를 그대로 반환한다.
        // 이렇게 하면 프론트엔드 입장에서는 "업로드 성공"으로 동일하게 처리할 수 있다.
        console.log(
          "[uploadTempFiles] Duplicate file detected, returning existing",
          {
            uploadedBy: uploadedBy.toString(),
            originalName: originalname,
            size,
            existingFileId: existing._id,
          },
        );
        results.push(existing);
        continue;
      }
    }

    const ext = originalname.includes(".")
      ? `.${originalname.split(".").pop().toLowerCase()}`
      : "";
    const key = `uploads/users/${uploadedBy.toString()}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}${ext}`;

    const uploaded = await s3Utils.uploadFileToS3(buffer, key, mimetype);

    if (!uploaded || !uploaded.location) {
      throw new ApiError(500, "S3 업로드에 실패했습니다.");
    }

    const fileType =
      s3Utils.getFileType(originalname) || getFileType(originalname);

    const created = await File.create({
      originalName: originalname,
      encoding: file.encoding,
      mimetype,
      size,
      bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
      key: uploaded.key || key,
      location: uploaded.location,
      contentType: mimetype,
      uploadedBy,
      fileType,
      isPublic: false,
    });

    results.push(created.toObject());
  }

  return res
    .status(201)
    .json(new ApiResponse(201, results, "파일이 성공적으로 업로드되었습니다."));
});

export const createTempUploadPresign = asyncHandler(async (req, res) => {
  const uploadedBy = req.user?._id;
  if (!uploadedBy) {
    throw new ApiError(401, "인증 정보가 없습니다.");
  }

  const bodyFiles = Array.isArray(req.body?.files) ? req.body.files : [];
  if (!bodyFiles.length) {
    throw new ApiError(400, "하나 이상의 파일 메타 정보가 필요합니다.");
  }

  const results = [];
  for (const item of bodyFiles) {
    const originalName = normalizeOriginalName(item?.originalName || "");
    const mimetype = String(item?.mimetype || "").trim();
    const size = Number(item?.size || 0);
    const contentEncoding = String(item?.contentEncoding || "")
      .trim()
      .toLowerCase();
    const encoding = contentEncoding === "gzip" ? "gzip" : "";
    if (!originalName || !mimetype || !Number.isFinite(size) || size <= 0) {
      throw new ApiError(400, "파일 메타 정보가 올바르지 않습니다.");
    }

    const ext = getExtFromName(originalName);
    const key = `uploads/users/${uploadedBy.toString()}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}${ext}`;

    const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
    const region = process.env.AWS_REGION || "ap-northeast-2";
    const location = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    const fileType =
      s3Utils.getFileType(originalName) || getFileType(originalName);

    const created = await File.create({
      originalName,
      encoding: encoding || "",
      mimetype,
      size,
      bucket,
      key,
      location,
      contentType: mimetype,
      uploadedBy,
      fileType,
      isPublic: false,
      ...(encoding
        ? {
            metadata: {
              contentEncoding: encoding,
              uncompressedSize: String(item?.uncompressedSize || ""),
            },
          }
        : {}),
    });

    const uploadUrl = await s3Utils.getUploadSignedUrl(key, mimetype, 900, {
      contentEncoding: encoding || undefined,
    });

    results.push({
      uploadUrl,
      file: created.toObject(),
      contentEncoding: encoding || undefined,
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, results, "업로드 URL이 생성되었습니다."));
});

const MAX_MULTIPART_PARTS = 10000;

export const createTempMultipartUpload = asyncHandler(async (req, res) => {
  const uploadedBy = req.user?._id;
  if (!uploadedBy) {
    throw new ApiError(401, "인증 정보가 없습니다.");
  }

  const originalName = normalizeOriginalName(req.body?.originalName || "");
  const mimetype = String(req.body?.mimetype || "").trim();
  const size = Number(req.body?.size || 0);
  const partCount = Math.floor(Number(req.body?.partCount || 0));
  const contentEncoding = String(req.body?.contentEncoding || "")
    .trim()
    .toLowerCase();
  const encoding = contentEncoding === "gzip" ? "gzip" : "";

  if (!originalName || !mimetype || !Number.isFinite(size) || size <= 0) {
    throw new ApiError(400, "파일 메타 정보가 올바르지 않습니다.");
  }
  if (!Number.isFinite(partCount) || partCount < 1 || partCount > MAX_MULTIPART_PARTS) {
    throw new ApiError(400, "multipart partCount가 올바르지 않습니다.");
  }

  const ext = getExtFromName(originalName);
  const key = `uploads/users/${uploadedBy.toString()}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  const region = process.env.AWS_REGION || "ap-northeast-2";
  const location = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const fileType =
    s3Utils.getFileType(originalName) || getFileType(originalName);

  const created = await File.create({
    originalName,
    encoding: encoding || "",
    mimetype,
    size,
    bucket,
    key,
    location,
    contentType: mimetype,
    uploadedBy,
    fileType,
    isPublic: false,
    ...(encoding
      ? {
          metadata: {
            contentEncoding: encoding,
            uncompressedSize: String(req.body?.uncompressedSize || ""),
          },
        }
      : {}),
  });

  const { uploadId } = await s3Utils.createMultipartUpload(key, mimetype, {
    contentEncoding: encoding || undefined,
  });

  const partUrls = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const uploadUrl = await s3Utils.getUploadPartSignedUrl(
      key,
      uploadId,
      partNumber,
      3600,
    );
    partUrls.push({ partNumber, uploadUrl });
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        uploadId,
        partUrls,
        file: created.toObject(),
        contentEncoding: encoding || undefined,
      },
      "multipart 업로드가 시작되었습니다.",
    ),
  );
});

export const completeTempMultipartUpload = asyncHandler(async (req, res) => {
  const uploadedBy = req.user?._id;
  if (!uploadedBy) {
    throw new ApiError(401, "인증 정보가 없습니다.");
  }

  const fileId = String(req.body?.fileId || "").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];

  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    throw new ApiError(400, "fileId가 올바르지 않습니다.");
  }
  if (!uploadId) {
    throw new ApiError(400, "uploadId가 필요합니다.");
  }

  const file = await File.findById(fileId);
  if (!file) {
    throw new ApiError(404, "파일을 찾을 수 없습니다.");
  }
  if (String(file.uploadedBy || "") !== String(uploadedBy)) {
    throw new ApiError(403, "권한이 없습니다.");
  }

  await s3Utils.completeMultipartUpload(file.key, uploadId, parts);

  return res
    .status(200)
    .json(new ApiResponse(200, { file: file.toObject() }, "multipart 업로드가 완료되었습니다."));
});

export const abortTempMultipartUpload = asyncHandler(async (req, res) => {
  const uploadedBy = req.user?._id;
  if (!uploadedBy) {
    throw new ApiError(401, "인증 정보가 없습니다.");
  }

  const fileId = String(req.body?.fileId || "").trim();
  const uploadId = String(req.body?.uploadId || "").trim();

  if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
    throw new ApiError(400, "fileId가 올바르지 않습니다.");
  }
  if (!uploadId) {
    throw new ApiError(400, "uploadId가 필요합니다.");
  }

  const file = await File.findById(fileId);
  if (!file) {
    throw new ApiError(404, "파일을 찾을 수 없습니다.");
  }
  if (String(file.uploadedBy || "") !== String(uploadedBy)) {
    throw new ApiError(403, "권한이 없습니다.");
  }

  await s3Utils.abortMultipartUpload(file.key, uploadId);

  return res
    .status(200)
    .json(new ApiResponse(200, { ok: true }, "multipart 업로드가 취소되었습니다."));
});

export const uploadFile = asyncHandler(async (req, res) => {
  const {
    relatedRequest,
    fileType = "document",
    tags,
    isPublic = false,
  } = req.body;

  const uploaded = req.file
    ? req.file
    : Array.isArray(req.files?.file) && req.files.file.length
      ? req.files.file[0]
      : Array.isArray(req.files?.files) && req.files.files.length
        ? req.files.files[0]
        : null;

  const localPath = uploaded?.path;

  if (!uploaded || !localPath) {
    throw new ApiError(400, "File is required");
  }

  if (!relatedRequest) {
    throw new ApiError(400, "Related request ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(relatedRequest)) {
    throw new ApiError(400, "Invalid related request ID");
  }

  const request = await Request.findById(relatedRequest);
  if (!request) {
    throw new ApiError(404, "Related request not found");
  }

  const originalName = normalizeOriginalName(uploaded.originalname);
  const ext = path.extname(originalName || "");
  const key = `uploads/requests/${relatedRequest.toString()}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(localPath);
  } catch {
    throw new ApiError(500, "Failed to read uploaded file");
  }

  const uploadedFile = await s3Utils.uploadFileToS3(
    fileBuffer,
    key,
    uploaded.mimetype,
  );

  if (!uploadedFile || !uploadedFile.location || !uploadedFile.key) {
    throw new ApiError(500, "File upload to S3 failed");
  }

  const newFile = await File.create({
    originalName,
    mimetype: uploaded.mimetype,
    size: uploaded.size,
    bucket: process.env.AWS_S3_BUCKET_NAME || "abuts-fit",
    key: uploadedFile.key,
    location: uploadedFile.location,
    contentType: uploaded.mimetype,
    fileType,
    relatedRequest,
    uploadedBy: req.user._id,
    tags: tags ? JSON.parse(tags) : [],
    isPublic: !!isPublic,
  });

  try {
    await fs.unlink(localPath);
  } catch {
    // ignore
  }

  return res
    .status(201)
    .json(new ApiResponse(201, newFile, "File uploaded successfully"));
});

export const getFiles = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    sort = "createdAt",
    order = "desc",
    relatedRequest,
    fileType,
  } = req.query;

  const query = {};

  // Only admins can view all files. Other users can only see their own.
  if (req.user.role !== "admin") {
    query.uploadedBy = req.user._id;
  }

  if (relatedRequest) {
    if (!mongoose.Types.ObjectId.isValid(relatedRequest)) {
      throw new ApiError(400, "Invalid related request ID");
    }
    query.relatedRequest = relatedRequest;
  }

  if (fileType) {
    query.fileType = fileType;
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { [sort]: order === "desc" ? -1 : 1 },
    populate: { path: "uploadedBy", select: "-password" },
    lean: true,
  };

  const result = await File.paginate(query, options);

  const responseData = {
    files: result.docs,
    pagination: {
      totalFiles: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
    },
  };

  return res
    .status(200)
    .json(new ApiResponse(200, responseData, "Files retrieved successfully"));
});

// 내 파일 목록 조회
export const getMyFiles = asyncHandler(async (req, res) => {
  // getFiles와 동일하지만 현재 사용자 기준으로만 조회
  const {
    page = 1,
    limit = 10,
    sort = "createdAt",
    order = "desc",
    fileType,
  } = req.query;

  const query = { uploadedBy: req.user._id };

  if (fileType) {
    query.fileType = fileType;
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { [sort]: order === "desc" ? -1 : 1 },
    populate: { path: "uploadedBy", select: "-password" },
    lean: true,
  };

  const result = await File.paginate(query, options);

  const responseData = {
    files: result.docs,
    pagination: {
      totalFiles: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
    },
  };

  return res
    .status(200)
    .json(new ApiResponse(200, responseData, "Files retrieved successfully"));
});

// 특정 의뢰의 파일 목록 조회
export const getRequestFiles = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new ApiError(400, "Invalid request ID");
  }

  const {
    page = 1,
    limit = 10,
    sort = "createdAt",
    order = "desc",
    fileType,
  } = req.query;

  const query = { relatedRequest: requestId };

  if (fileType) {
    query.fileType = fileType;
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { [sort]: order === "desc" ? -1 : 1 },
    populate: { path: "uploadedBy", select: "-password" },
    lean: true,
  };

  const result = await File.paginate(query, options);

  const responseData = {
    files: result.docs,
    pagination: {
      totalFiles: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
    },
  };

  return res
    .status(200)
    .json(new ApiResponse(200, responseData, "Files retrieved successfully"));
});

export const getFileById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid file ID");
  }

  const file = await File.findById(id).populate({
    path: "uploadedBy",
    select: "-password",
  });

  if (!file) {
    throw new ApiError(404, "File not found");
  }

  // Admins or file owners can view the file
  if (
    req.user.role !== "admin" &&
    file.uploadedBy._id.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "You are not authorized to view this file");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, file, "File details retrieved successfully"));
});

export const deleteFile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid file ID");
  }

  const file = await File.findById(id);

  if (!file) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  const isRequestor =
    file.relatedRequest &&
    file.relatedRequest.requestor &&
    file.relatedRequest.requestor.toString() === req.user._id.toString();
  const isManufacturer =
    file.relatedRequest &&
    file.relatedRequest.caManufacturer &&
    file.relatedRequest.caManufacturer.toString() === req.user._id.toString();
  const isUploader = file.uploadedBy.toString() === req.user._id.toString();

  if (
    req.user.role !== "admin" &&
    !isRequestor &&
    !isManufacturer &&
    !isUploader
  ) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  await file.deleteOne();

  return res
    .status(200)
    .json({ success: true, message: "File deleted successfully" });
});

// 파일 다운로드 URL 생성
export const getFileDownloadUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid file ID");
  }

  const fileObjectId = new mongoose.Types.ObjectId(id);
  const file = await File.findById(id);

  if (!file) {
    throw new ApiError(404, "File not found");
  }

  const userId = req.user?._id;
  const isAdmin = req.user?.role === "admin";
  const isUploader =
    userId && String(file.uploadedBy || "") === String(userId || "");

  let allowed = !!isAdmin || !!isUploader;

  if (!allowed && userId) {
    const roomIds = await ChatRoom.find({
      participants: userId,
      isArchived: false,
    })
      .select({ _id: 1 })
      .lean();

    const ids = Array.isArray(roomIds) ? roomIds.map((r) => r._id) : [];
    if (ids.length > 0) {
      const exists = await Chat.findOne({
        roomId: { $in: ids },
        attachments: { $elemMatch: { fileId: fileObjectId } },
      })
        .select({ _id: 1 })
        .lean();
      allowed = !!exists;
    }
  }

  if (!allowed) {
    throw new ApiError(403, "Forbidden");
  }

  const signedUrl = await s3Utils.getSignedUrl(file.key);
  return res
    .status(200)
    .json(new ApiResponse(200, { url: signedUrl }, "Download URL generated"));
});

const canUserAccessS3Key = async (req, key) => {
  // Admin always allowed
  if (req.user?.role === "admin") {
    return true;
  }

  // Check if file exists in DB and user is uploader
  const file = await File.findOne({ key }).populate("uploadedBy", "_id");
  if (file && file.uploadedBy?._id.toString() === req.user._id.toString()) {
    return true;
  }

  // Check if user is organization owner and file belongs to their organization
  if (req.user?.businessAnchorId) {
    const BusinessAnchor = (
      await import("../../models/businessAnchor.model.js")
    ).default;
    const org = await BusinessAnchor.findById(req.user.businessAnchorId).select(
      "businessLicense",
    );

    if (org?.businessLicense?.s3Key === key) {
      return true;
    }
  }

  // PracticeTransfer 파일 접근 허용
  // - practice 전송자(작성자)
  // - 전송 대상 기공소(동일 businessAnchor) — CA면 어벗츠 디자인 도착 후만 구강스캔
  const practiceTransfer = await PracticeTransfer.findOne({
    "files.file.s3Key": key,
  })
    .select({
      practiceUserId: 1,
      practiceBusinessAnchorId: 1,
      targetLabAnchorId: 1,
      toothWorks: 1,
      production: 1,
    })
    .lean();

  if (practiceTransfer) {
    const currentUserId = String(req.user?._id || "").trim();
    const currentAnchorId = String(req.user?.businessAnchorId || "").trim();

    const isPracticeOwner =
      currentUserId &&
      currentUserId === String(practiceTransfer?.practiceUserId || "").trim();

    const isTargetLabMember =
      !!currentAnchorId &&
      currentAnchorId === String(practiceTransfer?.targetLabAnchorId || "").trim();

    const isPracticeBusinessMember =
      !!currentAnchorId &&
      currentAnchorId === String(practiceTransfer?.practiceBusinessAnchorId || "").trim();

    if (isPracticeOwner || isPracticeBusinessMember) {
      return true;
    }
    if (isTargetLabMember) {
      if (shouldLockLabOralScanDownload(practiceTransfer)) {
        return false;
      }
      return true;
    }
  }

  // Request caseInfos 파일 (원본 STL / 추가 첨부)
  // - 의뢰 소유 사업자 / 제조사·관리자 / 디자인 파트너
  const requestWithFile = await Request.findOne({
    $or: [
      { "caseInfos.file.s3Key": key },
      { "caseInfos.files.s3Key": key },
    ],
  })
    .select({
      businessAnchorId: 1,
      requestor: 1,
      "caseInfos.productMode": 1,
    })
    .lean();

  if (requestWithFile) {
    const role = String(req.user?.role || "").trim();
    if (role === "manufacturer" || role === "admin") {
      return true;
    }
    const currentAnchorId = String(req.user?.businessAnchorId || "").trim();
    const ownerAnchorId = String(requestWithFile?.businessAnchorId || "").trim();
    if (currentAnchorId && ownerAnchorId && currentAnchorId === ownerAnchorId) {
      return true;
    }
    const currentUserId = String(req.user?._id || "").trim();
    if (
      currentUserId &&
      currentUserId === String(requestWithFile?.requestor || "").trim()
    ) {
      return true;
    }
    if (
      role === "requestor" &&
      String(requestWithFile?.caseInfos?.productMode || "").trim() ===
        "design_custom_abutment" &&
      (await resolveDesignAccessForUser(req.user))
    ) {
      return true;
    }
  }

  // 채팅 첨부파일 접근 허용
  // - 첨부가 포함된 채팅방 참여자라면 다운로드 허용
  const chatMsg = await Chat.findOne({
    isDeleted: false,
    "attachments.s3Key": key,
  })
    .select({ roomId: 1 })
    .lean();

  if (chatMsg?.roomId) {
    const room = await ChatRoom.findById(chatMsg.roomId)
      .select({ participants: 1 })
      .lean();

    const myUserId = String(req.user?._id || "").trim();
    const isParticipant = Array.isArray(room?.participants)
      ? room.participants.some((p) => String(p || "").trim() === myUserId)
      : false;

    if (isParticipant) return true;
  }

  return false;
};

// S3 키 기반 다운로드 URL 생성 (관리자, 업로더, 조직 소유자)
export const getS3DownloadUrl = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "").trim();
  if (!key) {
    throw new ApiError(400, "Invalid S3 key");
  }

  const allowed = await canUserAccessS3Key(req, key);
  if (!allowed) {
    throw new ApiError(403, "Forbidden");
  }

  const signedUrl = await s3Utils.getDownloadSignedUrl(key);
  return res
    .status(200)
    .json(new ApiResponse(200, { url: signedUrl }, "Download URL generated"));
});

// related files:
// - web/backend/modules/files/file.routes.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// 인증된 사용자가 동일 오리진에서 첨부를 직접 내려받도록 프록시 다운로드 제공
export const downloadS3FileProxy = asyncHandler(async (req, res) => {
  const key = String(req.query?.key || "").trim();
  if (!key) {
    throw new ApiError(400, "Invalid S3 key");
  }

  const allowed = await canUserAccessS3Key(req, key);
  if (!allowed) {
    throw new ApiError(403, "Forbidden");
  }

  const rawName = String(req.query?.fileName || "").trim();
  const fallbackName = String(key.split("/").pop() || "download").trim() || "download";
  const targetName = normalizeOriginalName(rawName || fallbackName).replace(/[\\/:*?"<>|]/g, "_");

  const { body, contentType, contentLength, eTag, lastModified } =
    await s3Utils.getObjectStreamFromS3(key);
  if (!body) {
    throw new ApiError(404, "S3 파일을 찾을 수 없습니다.");
  }

  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(targetName)}`,
  );
  if (Number.isFinite(contentLength) && contentLength > 0) {
    res.setHeader("Content-Length", String(Math.floor(contentLength)));
  }
  if (eTag) {
    res.setHeader("ETag", eTag);
  }
  if (lastModified) {
    res.setHeader("Last-Modified", new Date(lastModified).toUTCString());
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  body.on?.("error", () => {
    if (!res.headersSent) {
      res.status(500).end();
      return;
    }
    res.end();
  });

  body.pipe(res);
  return;
});
