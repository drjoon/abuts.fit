import { Types } from "mongoose";
import DraftRequest from "../models/draftRequest.model.js";
import Connection from "../models/connection.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

import {
  uploadToRhinoServer,
  buildStandardStlFileName,
} from "./request/creation.controller.js";
import { normalizeCaseInfosImplantFields } from "./request/utils.js";

// 새 드래프트 생성
export const createDraft = asyncHandler(async (req, res) => {
  const { caseInfos = [] } = req.body || {};

  const normalizedCaseInfos = Array.isArray(caseInfos)
    ? caseInfos
    : [caseInfos];

  const draft = await DraftRequest.create({
    requestor: req.user._id,
    caseInfos: await Promise.all(
      normalizedCaseInfos.map(async (ci) => {
        const normalized = await normalizeCaseInfosImplantFields(ci);
        return {
          ...normalized,
          workType: (ci && ci.workType) || "abutment",
        };
      })
    ),
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

  // 권한 확인을 위해 먼저 조회
  const draft = await DraftRequest.findById(id).lean();

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  if (draft.requestor.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this draft");
  }

  const { caseInfos } = req.body || {};

  if (!caseInfos) {
    // caseInfos가 없으면 그냥 기존 draft 반환
    return res
      .status(200)
      .json(new ApiResponse(200, draft, "Draft updated successfully"));
  }

  // 동시성 문제 해결: findByIdAndUpdate 사용 (원자적 업데이트)
  // 최대 3회 재시도
  let retries = 3;
  let updatedDraft = null;

  while (retries > 0) {
    try {
      const incomingList = Array.isArray(caseInfos) ? caseInfos : [caseInfos];

      // 현재 최신 상태 조회
      const currentDraft = await DraftRequest.findById(id);
      if (!currentDraft) {
        throw new ApiError(404, "Draft not found");
      }

      const prevCaseInfos = Array.isArray(currentDraft.caseInfos)
        ? currentDraft.caseInfos
        : [];

      const newCaseInfos = incomingList.map((ci) => {
        const incoming = ci || {};

        // 1. ID가 제공된 경우 해당 ID로 기존 데이터를 찾음
        let prev = null;
        if (incoming._id) {
          prev = prevCaseInfos.find(
            (p) => String(p._id) === String(incoming._id)
          );
        }

        // 2. ID로 못 찾은 경우 파일 정보(s3Key 등)로 매칭 시도
        if (!prev && incoming.file?.s3Key) {
          prev = prevCaseInfos.find(
            (p) => p.file?.s3Key === incoming.file.s3Key
          );
        }

        // 3. 그것도 없으면 인덱스 순서대로 (새로 추가된 경우 등)
        // 이 부분은 기존 로직 유지하되 가급적 매칭된 것 위주로 사용

        return {
          _id: incoming._id || prev?._id || undefined,
          ...incoming,
          file: incoming.file || prev?.file || undefined,
          workType: (incoming.workType || prev?.workType || "abutment").trim(),
        };
      });

      const normalizedCaseInfos = await Promise.all(
        newCaseInfos.map(async (ci) => {
          const normalized = await normalizeCaseInfosImplantFields(ci);
          return {
            ...ci,
            ...normalized,
          };
        })
      );

      // findByIdAndUpdate로 원자적 업데이트
      updatedDraft = await DraftRequest.findByIdAndUpdate(
        id,
        { caseInfos: normalizedCaseInfos },
        { new: true, runValidators: false }
      );

      if (!updatedDraft) {
        throw new ApiError(404, "Draft not found");
      }

      break; // 성공하면 루프 탈출
    } catch (err) {
      retries--;
      if (retries === 0) {
        throw err;
      }
      // 짧은 지연 후 재시도
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedDraft, "Draft updated successfully"));
});

// 파일 + 케이스 정보 추가 (caseInfos 요소 생성)
export const addFileToDraft = asyncHandler(async (req, res) => {
  const { id } = req.params; // draftId
  const {
    originalName,
    size,
    mimetype,
    s3Key,
    fileId,
    clinicName,
    patientName,
    tooth,
    implantManufacturer,
    implantSystem,
    implantType,
    maxDiameter,
    connectionDiameter,
    workType,
    shippingMode,
    requestedShipDate,
  } = req.body || {};

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

  const fileSubdoc = {
    fileId: fileId && Types.ObjectId.isValid(fileId) ? fileId : undefined,
    originalName,
    size,
    mimetype,
    s3Key,
  };

  draft.caseInfos = Array.isArray(draft.caseInfos) ? draft.caseInfos : [];

  draft.caseInfos.push({
    file: fileSubdoc,
    clinicName,
    patientName,
    tooth,
    ...(await normalizeCaseInfosImplantFields({
      implantManufacturer,
      implantSystem,
      implantType,
    })),
    maxDiameter,
    connectionDiameter,
    workType,
    shippingMode: shippingMode || "normal",
    requestedShipDate,
  });

  await draft.save();

  // 드래프트에 파일 추가 성공 시 bg/storage/1-stl 에도 복사
  // [수정] 파일명이 확정되지 않은 Draft 단계에서는 Rhino 서버 전송을 보류하거나,
  // 원본 파일명으로 전송하되 나중에 Request 생성 시 표준 파일명으로 다시 전송하도록 함.
  // 여기서는 기존 로직을 유지하되, 나중에 Request 생성 시 다시 처리되므로
  // Rhino 서버의 자동 처리를 방해하지 않도록 함.
  if (s3Key) {
    try {
      // 1-stl 에 직접 업로드하여 Rhino 서버 처리를 시작하게 함 (파일명은 원본 유지)
      const s3Utils = (await import("../utils/s3.utils.js")).default;
      const buffer = await s3Utils.getObjectBufferFromS3(s3Key);
      if (buffer) {
        await uploadToRhinoServer(buffer, originalName);
      }
    } catch (err) {
      console.error(
        `[Rhino-Direct-Upload] Failed in addFileToDraft: ${err.message}`
      );
    }
  }

  const addedCaseInfo = draft.caseInfos[draft.caseInfos.length - 1];

  return res
    .status(201)
    .json(
      new ApiResponse(201, addedCaseInfo, "Case (file+info) added to draft")
    );
});

// 드래프트에서 케이스(파일+정보) 삭제
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

  draft.caseInfos = Array.isArray(draft.caseInfos) ? draft.caseInfos : [];

  const beforeLength = draft.caseInfos.length;
  draft.caseInfos = draft.caseInfos.filter(
    (ci) => ci._id.toString() !== fileId
  );

  if (draft.caseInfos.length === beforeLength) {
    throw new ApiError(404, "CaseInfo not found in draft");
  }

  await draft.save();

  return res
    .status(200)
    .json(new ApiResponse(200, draft.caseInfos, "Case removed from draft"));
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
