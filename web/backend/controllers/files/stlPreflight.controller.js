// related files:
// - web/backend/modules/files/file.routes.js
// - web/backend/services/abutmentStl/preflight.service.js
// - web/frontend/src/pages/requestor/new_request/hooks/useStlMachiningPreflight.ts
//
// POST /api/files/temp/stl-preflight — 접수 전 커스텀어벗 STL 가공 검사.
// 파일은 메모에서만 파이프라인을 돌리고 저장하지 않는다.
import multer from "multer";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  buildCorrectedDesignStlBuffer,
  runStlMachiningPreflight,
} from "../../services/abutmentStl/preflight.service.js";

const MAX_STL_BYTES = 30 * 1024 * 1024;

export const stlPreflightUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STL_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.stl$/i.test(String(file?.originalname || ""))) {
      cb(null, true);
      return;
    }
    cb(new ApiError(400, "STL 파일만 검사할 수 있습니다."));
  },
}).single("file");

function caseInfosFromMultipartBody(body) {
  const b = body || {};
  return {
    implantManufacturer: String(b.implantManufacturer || "").trim(),
    implantBrand: String(b.implantBrand || "").trim(),
    implantFamily: String(b.implantFamily || "").trim(),
    implantType: String(b.implantType || "").trim(),
    connectionPrcFileName: String(b.connectionPrcFileName || "").trim(),
  };
}

const CORRECTED_REASON_MESSAGE = {
  empty_file: "STL 파일이 비어 있습니다.",
  finishline_missing: "피니시라인을 찾지 못해 보정 STL을 만들 수 없습니다.",
  no_tight_corners: "불완전 가공 구간이 없어 보정 STL이 필요하지 않습니다.",
  correction_failed: "보정 메시를 만들지 못했습니다.",
  pipeline_failed: "가공 검사 파이프라인이 실패했습니다.",
};

function correctedDownloadName(originalName) {
  const raw = String(originalName || "model.stl").trim() || "model.stl";
  const base = raw.replace(/\.stl$/i, "");
  return `${base}.corrected.stl`;
}

export const checkStlMachiningPreflight = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw new ApiError(400, "검사할 STL 파일이 필요합니다.");
  }
  const summary = await runStlMachiningPreflight({
    buffer: file.buffer,
    caseInfos: caseInfosFromMultipartBody(req.body),
  });
  return res
    .status(200)
    .json(new ApiResponse(200, summary, "가공 검사가 완료되었습니다."));
});

/** POST /api/files/temp/stl-corrected — 불완전 가공 보정 STL 다운로드(저장 없음). */
export const downloadStlMachiningCorrected = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw new ApiError(400, "보정할 STL 파일이 필요합니다.");
  }
  const result = await buildCorrectedDesignStlBuffer({
    buffer: file.buffer,
    caseInfos: caseInfosFromMultipartBody(req.body),
  });
  if (!result.ok) {
    const reason = String(result.reason || "correction_failed");
    throw new ApiError(
      422,
      CORRECTED_REASON_MESSAGE[reason] || CORRECTED_REASON_MESSAGE.correction_failed,
    );
  }
  const filename = correctedDownloadName(file.originalname);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return res.status(200).send(result.buffer);
});
