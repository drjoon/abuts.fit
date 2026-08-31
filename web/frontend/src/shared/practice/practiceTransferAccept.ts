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

export const isPracticeTransferAcceptedFile = (file: File) => {
  const ext = getPracticeTransferFileExtension(file.name);
  return PRACTICE_TRANSFER_ALLOWED_EXTENSIONS.has(ext);
};

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
