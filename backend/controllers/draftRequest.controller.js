import { Types } from "mongoose";
import DraftRequest from "../models/draftRequest.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

// 새 드래프트 생성
export const createDraft = asyncHandler(async (req, res) => {
  const { message = "", caseInfos = {}, aiFileInfos = [] } = req.body || {};

  const draft = await DraftRequest.create({
    requestor: req.user._id,
    message,
    caseInfos,
    aiFileInfos: Array.isArray(aiFileInfos) ? aiFileInfos : [],
  });

  return res
    .status(201)
    .json(new ApiResponse(201, draft, "Draft created successfully"));
});

// 드래프트 조회
export const getDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid draft ID");
  }

  const draft = await DraftRequest.findById(id).lean();

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to access this draft");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, draft, "Draft fetched successfully"));
});

// 드래프트 부분 업데이트 (message, caseInfos 등)
export const updateDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid draft ID");
  }

  const draft = await DraftRequest.findById(id);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this draft");
  }

  const { message, caseInfos, aiFileInfos } = req.body || {};

  if (typeof message === "string") {
    draft.message = message;
  }

  if (caseInfos && typeof caseInfos === "object") {
    draft.caseInfos = {
      ...(draft.caseInfos?.toObject?.() || draft.caseInfos || {}),
      ...caseInfos,
    };
  }

  if (Array.isArray(aiFileInfos)) {
    draft.aiFileInfos = aiFileInfos;
  }

  await draft.save();

  return res
    .status(200)
    .json(new ApiResponse(200, draft, "Draft updated successfully"));
});

// 파일 추가 (메타데이터 등록)
export const addFileToDraft = asyncHandler(async (req, res) => {
  const { id } = req.params; // draftId
  const { originalName, size, mimetype, s3Key, fileId } = req.body || {};

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid draft ID");
  }

  if (!originalName || !size || !mimetype) {
    throw new ApiError(400, "originalName, size, mimetype are required");
  }

  // fileId 또는 s3Key 중 하나는 반드시 있어야 한다.
  if (!fileId && !s3Key) {
    throw new ApiError(400, "fileId or s3Key is required");
  }

  const draft = await DraftRequest.findById(id);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this draft");
  }

  draft.files.push({
    fileId: fileId && Types.ObjectId.isValid(fileId) ? fileId : undefined,
    originalName,
    size,
    mimetype,
    s3Key,
  });

  await draft.save();

  const addedFile = draft.files[draft.files.length - 1];

  return res
    .status(201)
    .json(new ApiResponse(201, addedFile, "File added to draft"));
});

// 드래프트에서 파일 삭제
export const removeFileFromDraft = asyncHandler(async (req, res) => {
  const { id, fileId } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid draft ID");
  }

  const draft = await DraftRequest.findById(id);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this draft");
  }

  const beforeLength = draft.files.length;
  draft.files = draft.files.filter((f) => f._id.toString() !== fileId);

  if (draft.files.length === beforeLength) {
    throw new ApiError(404, "File not found in draft");
  }

  await draft.save();

  return res
    .status(200)
    .json(new ApiResponse(200, draft.files, "File removed from draft"));
});

// 드래프트 삭제 (취소)
export const deleteDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid draft ID");
  }

  const draft = await DraftRequest.findById(id);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to delete this draft");
  }

  await draft.deleteOne();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Draft deleted successfully"));
});
