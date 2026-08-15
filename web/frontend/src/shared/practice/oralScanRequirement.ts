// related files:
// - web/backend/services/practiceTransferProduction.service.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx

/** 자동매칭 CA: 치과 전송 시 구강스캔 필수 */
export const ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE =
  "자동매칭으로 커스텀어벗을 보낼 때는 구강스캔 파일을 첨부해주세요.";

/** 자동매칭 CA: 스캔 없이 수락 불가 */
export const ORAL_SCAN_REQUIRED_FROM_PRACTICE =
  "자동매칭 커스텀어벗 의뢰는 치과에서 구강스캔을 첨부해야 합니다.";

/** 지정 기공소 CA: 치과 미첨부 시 수락 전 기공소 업로드 */
export const ORAL_SCAN_REQUIRED_FROM_LAB =
  "커스텀어벗 의뢰를 수락하려면 구강스캔 파일을 업로드해주세요.";

export const needsOralScanForAccept = (params: {
  hasCustomAbutment?: boolean;
  fileCount?: number;
}) =>
  Boolean(params.hasCustomAbutment) && Number(params.fileCount || 0) <= 0;

/** 지정: 기공소가 수락 전 업로드 가능. 자동매칭: 치과만 */
export const canLabAttachOralScanOnAccept = (matchingMode?: string | null) =>
  String(matchingMode || "").trim() !== "auto";
