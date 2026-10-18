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
import { runStlMachiningPreflight } from "../../services/abutmentStl/preflight.service.js";

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

export const checkStlMachiningPreflight = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw new ApiError(400, "검사할 STL 파일이 필요합니다.");
  }
  const body = req.body || {};
  const summary = await runStlMachiningPreflight({
    buffer: file.buffer,
    caseInfos: {
      implantManufacturer: String(body.implantManufacturer || "").trim(),
      implantBrand: String(body.implantBrand || "").trim(),
      implantFamily: String(body.implantFamily || "").trim(),
      implantType: String(body.implantType || "").trim(),
      connectionPrcFileName: String(body.connectionPrcFileName || "").trim(),
    },
  });
  return res
    .status(200)
    .json(new ApiResponse(200, summary, "가공 검사가 완료되었습니다."));
});
