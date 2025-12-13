import mongoose from "mongoose";
import File from "../models/file.model.js";
import Request from "../models/request.model.js";
import s3Utils from "../utils/s3.utils.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

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

    // 클라이언트가 FormData로 보낸 원본 파일명을 우선 사용한다.
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
      // 중복 파일이 이미 존재하면 새로 업로드하지 않고 기존 문서를 그대로 반환한다.
      // 이렇게 하면 프론트엔드 입장에서는 "업로드 성공"으로 동일하게 처리할 수 있다.
      console.log(
        "[uploadTempFiles] Duplicate file detected, returning existing",
        {
          uploadedBy: uploadedBy.toString(),
          originalName: originalname,
          size,
          existingFileId: existing._id,
        }
      );
      results.push(existing);
      continue;
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

export const uploadFile = asyncHandler(async (req, res) => {
  const {
    relatedRequest,
    fileType = "document",
    tags,
    isPublic = false,
  } = req.body;
  const localPath = req.file?.path;

  if (!localPath) {
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

  const uploadedFile = await s3Utils.uploadFileToS3(localPath);

  if (!uploadedFile || !uploadedFile.Location || !uploadedFile.Key) {
    throw new ApiError(500, "File upload to S3 failed");
  }

  const newFile = await File.create({
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    key: uploadedFile.Key,
    location: uploadedFile.Location,
    fileType,
    relatedRequest,
    uploadedBy: req.user._id,
    tags: tags ? JSON.parse(tags) : [],
    isPublic: !!isPublic,
  });

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
    file.relatedRequest.manufacturer &&
    file.relatedRequest.manufacturer.toString() === req.user._id.toString();
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

  const file = await File.findById(id);

  if (!file) {
    throw new ApiError(404, "File not found");
  }

  const signedUrl = await s3Utils.getSignedUrl(file.key);
  return res
    .status(200)
    .json(new ApiResponse(200, { url: signedUrl }, "Download URL generated"));
});
