import mongoose from "mongoose";
import File from "../models/file.model.js";
import Request from "../models/request.model.js";
import * as s3Utils from "../utils/s3.utils.js";
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
    const isRequestor =
      file.relatedRequest.requestor.toString() === req.user._id.toString();
    const isManufacturer =
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
  }

  const signedUrl = await getSignedUrl(file.key);
  res.status(200).json({ success: true, data: { url: signedUrl } });
});
