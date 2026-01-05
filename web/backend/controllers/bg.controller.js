import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import File from "../models/file.model.js";
import Request from "../models/request.model.js";

/**
 * BG 프로그램들로부터 파일 처리 완료 보고를 받는 컨트롤러
 */
export const registerProcessedFile = asyncHandler(async (req, res) => {
  const {
    sourceStep, // '2-filled' (Rhino), '3-nc' (ESPRIT), 'cnc' (Bridge)
    fileName, // 처리된 파일명
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

  // 1. 의뢰 찾기 (requestId가 있으면 우선 사용, 없으면 파일명으로 추정)
  let request = null;
  if (requestId) {
    request = await Request.findOne({ requestId });
  }

  if (!request && originalFileName) {
    // 파일명에 requestId가 포함되어 있을 가능성 확인 (예: 20250105-ABCDEFGH_...)
    const match = originalFileName.match(/(\d{8}-[A-Z]{8})/);
    if (match) {
      request = await Request.findOne({ requestId: match[1] });
    }
  }

  if (!request) {
    console.warn(`[BG-Callback] Request not found for file: ${fileName}`);
    // 의뢰를 찾지 못해도 일단 성공 응답 (백그라운드 프로세스는 계속 진행되므로)
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

  // 2. 단계별 DB 업데이트
  const updateData = {};
  const now = new Date();

  if (status === "success") {
    switch (sourceStep) {
      case "2-filled": // Rhino 처리 완료
        updateData.status = "CAM";
        updateData.status2 = "중";
        updateData["caseInfos.camFile"] = {
          fileName,
          filePath: fileName, // 로컬 스토리지 경로 또는 S3 키
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamStart"] = now;
        break;

      case "3-nc": // ESPRIT 처리 완료 (NC 생성)
        updateData.status = "CAM";
        updateData.status2 = "후";
        updateData["caseInfos.ncFile"] = {
          fileName,
          filePath: fileName,
          uploadedAt: now,
        };
        updateData["productionSchedule.actualCamComplete"] = now;
        break;

      case "cnc": // 가공 시작/완료
        updateData.status = "생산";
        updateData.status2 = "중";
        updateData["productionSchedule.actualMachiningStart"] = now;
        // 가공기 할당 정보가 metadata에 있다면 업데이트
        if (metadata?.machineId) {
          updateData["productionSchedule.assignedMachine"] = metadata.machineId;
        }
        break;
    }
  } else {
    // 실패 시 로그 및 상태 표시 (필요 시)
    console.error(
      `[BG-Callback] Processing failed for ${request.requestId} at ${sourceStep}`
    );
  }

  await Request.findByIdAndUpdate(request._id, { $set: updateData });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updated: true, requestId: request.requestId },
        "Successfully registered processed file and updated DB"
      )
    );
});

export const getBgStatus = asyncHandler(async (req, res) => {
  // 나중에 BG 프로그램들의 상태를 취합해서 보여주는 로직 추가 가능
  return res.status(200).json(new ApiResponse(200, {}, "BG Status retrieved"));
});
