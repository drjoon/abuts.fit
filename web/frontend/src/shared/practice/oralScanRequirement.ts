// - 2026-08-19: 치과 전송 시 구강스캔은 선택(어벗츠기공소 포함).
// - 2026-08-15: 수락 기공소 CA 디자인 — 기공소 구강스캔 업로드 UI 제거. 지정은 스캔 없이 수락.
// - 2026-08-15: 수락 기공소 CA 디자인 — 구강스캔 다운로드 잠금 해제. 지정은 스캔 없이 수락 가능.
// - web/backend/services/practiceTransferProduction.service.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx

/** @deprecated 생성 시 구강스캔은 선택. 레거시 토스트 문구 */
export const ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE =
  "자동매칭으로 보낼 때는 구강스캔 파일을 첨부해주세요.";

/** 자동매칭 CA: 스캔 없이 수락 불가 */
export const ORAL_SCAN_REQUIRED_FROM_PRACTICE =
  "자동매칭 커스텀어벗 의뢰는 치과에서 구강스캔을 첨부해야 합니다.";

/** @deprecated 수락 기공소가 CA 디자인 — 기공소 구강스캔 업로드 UI 없음 */
export const ORAL_SCAN_REQUIRED_FROM_LAB =
  "커스텀어벗 디자인을 위해 구강스캔 파일을 업로드해주세요.";

/** @deprecated 수락 기공소가 CA 디자인 — 구강스캔 다운로드 잠금 없음 */
export const ORAL_SCAN_DOWNLOAD_LOCKED_UNTIL_ABUTS_DESIGN =
  "어벗츠 커스텀어벗 디자인이 도착한 뒤 구강스캔을 다운로드할 수 있습니다. 그 디자인으로 작업을 진행해 주세요.";

/** 자동매칭 CA: 치과 스캔 없으면 수락 불가. 지정은 스캔 없이 수락 */
export const needsOralScanForAccept = (params: {
  hasCustomAbutment?: boolean;
  fileCount?: number;
  matchingMode?: string | null;
}) => {
  if (!params.hasCustomAbutment) return false;
  if (Number(params.fileCount || 0) > 0) return false;
  // 지정 기공소: 스캔 없이도 수락(디자인·크라운 바로 진행).
  if (String(params.matchingMode || "").trim() !== "auto") return false;
  return true;
};

/** @deprecated 기공소 수락 모달에서 구강스캔 첨부 UI 제거 */
export const canLabAttachOralScanOnAccept = (matchingMode?: string | null) =>
  String(matchingMode || "").trim() !== "auto";

/** 수락 기공소가 디자인 — 구강스캔 다운로드 잠금 없음(BE shouldLockLabOralScanDownload과 동기) */
export const isLabOralScanDownloadLocked = (_params?: {
  hasCustomAbutment?: boolean;
  designReadyAt?: string | Date | null;
  designFileCount?: number;
}) => false;
