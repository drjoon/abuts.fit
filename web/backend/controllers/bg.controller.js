import s3Utils from "../utils/s3.utils.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import path from "path";
import fs from "fs/promises";

const BG_STORAGE_BASE =
  process.env.BG_STORAGE_PATH ||
  path.resolve(process.cwd(), "../../bg/storage");

/**
 * BG 프로그램들로부터 파일 처리 완료 보고를 받는 컨트롤러
 */
export const registerProcessedFile = asyncHandler(async (req, res) => {
  const {
    sourceStep, // '2-filled' (Rhino), '3-nc' (ESPRIT), 'cnc' (Bridge)
    fileName, // 처리된 파일명 (bg/storage/ 하위 상대 경로 포함 가능)
    originalFileName, // 원본 파일명 (연결용)
    requestId, // 의뢰 ID (있는 경우)
    status, // 'success', 'failed'
    metadata, // 추가 정보 (직경 등)
  } = req.body;

  if (!fileName || !sourceStep) {
    throw new ApiError(400, "fileName and sourceStep are required");
  }

  console.log(
    `[BG-Callback] Received from ${sourceStep}: ${fileName} (Status: ${status})`
  );

  // 1. 의뢰 찾기
  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId });
  }

  if (!request && originalFileName) {
    const match = originalFileName.match(/(\d{8}-[A-Z]{8})/);
    if (match) {
      request = await Request.findOne({ requestId: match[1] });
    }
  }

  if (!request) {
    console.warn(`[BG-Callback] Request not found for file: ${fileName}`);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { found: false },
          "File received but no matching request found"
        )
      );
  }

  // 2. S3 업로드 (성공 시에만, 로컬 스토리지에서 읽어서)
  let s3Info = null;
  if (status === "success") {
    try {
      const localFilePath = path.join(BG_STORAGE_BASE, sourceStep, fileName);
      const fileBuffer = await fs.readFile(localFilePath);
      const s3Key = `requests/${request.requestId}/${sourceStep}/${fileName}`;
      const contentType =
        s3Utils.getFileType(fileName) === "3d_model"
          ? "application/octet-stream"
          : "application/octet-stream";

      const uploaded = await s3Utils.uploadFileToS3(
        fileBuffer,
        s3Key,
        contentType
      );
      s3Info = {
        fileName,
        s3Key: uploaded.key,
        s3Url: uploaded.location,
        fileSize: fileBuffer.length,
        uploadedAt: new Date(),
      };
    } catch (err) {
      console.error(
        `[BG-Callback] Failed to upload processed file to S3: ${err.message}`
      );
      // S3 업로드 실패해도 DB 업데이트는 진행 (로컬에는 파일이 있으므로)
    }
  }

  // 3. 단계별 DB 업데이트
  const updateData = {};
  const now = new Date();

  if (status === "success") {
    switch (sourceStep) {
      case "2-filled":
        updateData.status = "CAM";
        updateData.status2 = "중";
        updateData["caseInfos.camFile"] = s3Info || {
          fileName,
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamStart"] = now;
        break;

      case "3-nc":
        updateData.status = "CAM";
        updateData.status2 = "후";
        updateData["caseInfos.ncFile"] = s3Info || {
          fileName,
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamComplete"] = now;
        break;

      case "cnc":
        updateData.status = "생산";
        updateData.status2 = "중";
        updateData["productionSchedule.actualMachiningStart"] = now;
        if (metadata?.machineId) {
          updateData["productionSchedule.assignedMachine"] = metadata.machineId;
        }
        break;
    }
  } else {
    // 실패 시 상태 업데이트
    console.error(
      `[BG-Callback] Processing failed for ${request.requestId} at ${sourceStep}`
    );
    // 실패 시 제조사 수동 대응을 위해 상태 변경 또는 로그 기록
    updateData[
      `reviewByStage.${
        sourceStep === "2-filled"
          ? "cam"
          : sourceStep === "3-nc"
          ? "cam"
          : "machining"
      }.status`
    ] = "REJECTED";
    updateData[
      `reviewByStage.${
        sourceStep === "2-filled"
          ? "cam"
          : sourceStep === "3-nc"
          ? "cam"
          : "machining"
      }.reason`
    ] = `백그라운드 작업 실패 (${sourceStep})`;
  }

  await Request.findByIdAndUpdate(request._id, { $set: updateData });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: true, requestId: request.requestId, s3Uploaded: !!s3Info },
        "Successfully registered processed file"
      )
    );
});

export const getBgStatus = asyncHandler(async (req, res) => {
  // 나중에 BG 프로그램들의 상태를 취합해서 보여주는 로직 추가 가능
  return res.status(200).json(new ApiResponse(200, {}, "BG Status retrieved"));
});
