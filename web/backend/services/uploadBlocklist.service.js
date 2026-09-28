// 업로드 차단 목록 조회·추가. 스캔바디 라이브러리·심플어벗 템플릿 업로드가 같이 쓴다.
// related files:
// - web/backend/models/uploadBlocklist.model.js
// - web/backend/services/scanbodyLibraryUpload.service.js
// - web/backend/services/abutmentTemplateUpload.service.js
import { Types } from "mongoose";
import UploadBlocklist from "../models/uploadBlocklist.model.js";
import { ApiError } from "../utils/ApiError.js";

function objectId(value) {
  const id = String(value || "").trim();
  return id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

/** 사용자 또는 그 사업자가 차단됐으면 403. */
export async function assertUploaderNotBlocked({ userId, businessAnchorId }) {
  const or = [];
  const user = objectId(userId);
  const anchor = objectId(businessAnchorId);
  if (user) or.push({ userId: user });
  if (anchor) or.push({ businessAnchorId: anchor });
  if (or.length === 0) return;
  const hit = await UploadBlocklist.exists({ active: true, $or: or });
  if (hit) {
    throw new ApiError(403, "악성 파일 업로드 기록이 있어 업로드가 막혀 있습니다. 관리자에게 문의해 주세요.");
  }
}

/** 이미 활성 차단이 있으면 그대로 둔다. 실패는 호출한 쪽이 로그만 남긴다. */
export async function blockUploader({ userId, businessAnchorId, reason, source, uploadKind, uploadId, fileName, createdBy }) {
  const user = objectId(userId);
  if (!user) return null;
  try {
    return await UploadBlocklist.findOneAndUpdate(
      { userId: user, active: true },
      {
        $setOnInsert: {
          userId: user,
          businessAnchorId: objectId(businessAnchorId),
          reason: String(reason || "").slice(0, 500),
          source,
          uploadKind: String(uploadKind || ""),
          uploadId: objectId(uploadId),
          fileName: String(fileName || "").slice(0, 200),
          createdBy: objectId(createdBy),
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    // 동시에 두 번 추가하면 부분 unique 인덱스에 걸린다. 이미 차단된 것이다.
    if (error?.code === 11000) return UploadBlocklist.findOne({ userId: user, active: true }).lean();
    throw error;
  }
}
