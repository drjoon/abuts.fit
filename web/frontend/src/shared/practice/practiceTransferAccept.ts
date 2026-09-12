// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFileDropTarget.tsx
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

export const PRACTICE_TRANSFER_ACCEPT =
  ".stl,.ply,.obj,.dcm,.png,.jpg,.jpeg,.webp,.bmp,.gif";

/** STL 전용 input accept — Windows는 확장자(.stl/.STL) 위주, MIME은 보조 */
export const PRACTICE_TRANSFER_STL_ACCEPT =
  ".stl,.STL,model/stl,application/sla,application/vnd.ms-pki.stl";

export const PRACTICE_TRANSFER_MODEL_EXTENSIONS = new Set([
  ".stl",
  ".ply",
  ".obj",
  ".dcm",
]);

export const PRACTICE_TRANSFER_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
]);

export const PRACTICE_TRANSFER_ALLOWED_EXTENSIONS = new Set([
  ...PRACTICE_TRANSFER_MODEL_EXTENSIONS,
  ...PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
]);

/** 기공의뢰 첨부 확장자 안내 (치과 intake · 기공소 결과파일 공통) */
export const PRACTICE_ACCEPTED_HINT = "STL · PLY · OBJ · DCM · 이미지";

export const getPracticeTransferFileExtension = (fileName: string) => {
  const name = String(fileName || "").trim().toLowerCase();
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx);
};

export const isPracticeTransferModelFileName = (fileName: string) =>
  PRACTICE_TRANSFER_MODEL_EXTENSIONS.has(
    getPracticeTransferFileExtension(fileName),
  );

export const isPracticeTransferImageFileName = (fileName: string) =>
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(
    getPracticeTransferFileExtension(fileName),
  );

export const isPracticeTransferAcceptedFileName = (fileName: string) => {
  const ext = getPracticeTransferFileExtension(fileName);
  return PRACTICE_TRANSFER_ALLOWED_EXTENSIONS.has(ext);
};

export const isPracticeTransferAcceptedFile = (file: File) =>
  isPracticeTransferAcceptedFileName(file.name);

export const isPracticeTransferModelFile = (file: File) =>
  isPracticeTransferModelFileName(file.name);

export const isPracticeTransferImageFile = (file: File) =>
  isPracticeTransferImageFileName(file.name);

export const filterPracticeTransferFiles = (files: File[]) =>
  files.filter((file) => isPracticeTransferAcceptedFile(file));

export const isPracticeTransferStlFile = (file: File) =>
  getPracticeTransferFileExtension(file.name) === ".stl";

/** 기공소 채팅 탭 드롭 — STL은 작업 파일, 그 외는 채팅 첨부 */
export const partitionLabChatDropFiles = (files: File[]) => {
  const stlFiles: File[] = [];
  const chatFiles: File[] = [];
  for (const file of files) {
    if (isPracticeTransferStlFile(file)) stlFiles.push(file);
    else chatFiles.push(file);
  }
  return { stlFiles, chatFiles };
};

/**
 * 상세 패널 드롭·클립 첨부 분기.
 * - 3D(model) → 의뢰 파일(자동)
 * - 이미지 → 호출측에서 의뢰 파일 vs 채팅 선택
 * - 그 외 → 채팅
 * (기공소 작업 STL은 partitionLabChatDropFiles 후 남은 파일에 적용)
 */
export const partitionDetailAttachFiles = (files: File[]) => {
  const modelFiles: File[] = [];
  const imageFiles: File[] = [];
  const otherFiles: File[] = [];
  for (const file of files) {
    if (isPracticeTransferModelFile(file)) modelFiles.push(file);
    else if (isPracticeTransferImageFile(file)) imageFiles.push(file);
    else otherFiles.push(file);
  }
  return { modelFiles, imageFiles, otherFiles };
};
