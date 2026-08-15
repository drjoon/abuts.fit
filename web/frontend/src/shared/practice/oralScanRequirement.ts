// related files:
// - web/backend/services/practiceTransferProduction.service.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx

/** 자동매칭: 치과 전송 시 구강스캔 필수(지정 기공소는 수락 전 기공소 업로드 가능) */
export const ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE =
  "자동매칭으로 보낼 때는 구강스캔 파일을 첨부해주세요.";

/** 자동매칭 CA: 스캔 없이 수락 불가 */
export const ORAL_SCAN_REQUIRED_FROM_PRACTICE =
  "자동매칭 커스텀어벗 의뢰는 치과에서 구강스캔을 첨부해야 합니다.";

/** 지정: 기공소가 수락 전 업로드 가능. 자동매칭: 치과만 */
export const ORAL_SCAN_REQUIRED_FROM_LAB =
  "커스텀어벗 의뢰를 수락하려면 구강스캔 파일을 업로드해주세요.";

/** 기공소: 어벗츠 CA 디자인이 오기 전 구강스캔 다운로드 차단 */
export const ORAL_SCAN_DOWNLOAD_LOCKED_UNTIL_ABUTS_DESIGN =
  "어벗츠 커스텀어벗 디자인이 도착한 뒤 구강스캔을 다운로드할 수 있습니다. 그 디자인으로 작업을 진행해 주세요.";

export const needsOralScanForAccept = (params: {
  hasCustomAbutment?: boolean;
  fileCount?: number;
}) =>
  Boolean(params.hasCustomAbutment) && Number(params.fileCount || 0) <= 0;

/** 지정: 기공소가 수락 전 업로드 가능. 자동매칭: 치과만 */
export const canLabAttachOralScanOnAccept = (matchingMode?: string | null) =>
  String(matchingMode || "").trim() !== "auto";

/** 기공소 상세: CA + 어벗 디자인 미도착이면 의뢰(구강스캔) 파일 다운로드 잠금 */
export const isLabOralScanDownloadLocked = (params: {
  hasCustomAbutment?: boolean;
  designReadyAt?: string | Date | null;
  designFileCount?: number;
}) => {
  if (!params.hasCustomAbutment) return false;
  if (params.designReadyAt) return false;
  if (Number(params.designFileCount || 0) > 0) return false;
  return true;
};
