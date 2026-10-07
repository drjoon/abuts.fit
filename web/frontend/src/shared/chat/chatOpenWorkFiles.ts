// 채팅 첨부 PNG가 작업 파일(페인트·카메라 포함)을 열도록 표시한다.
// related files:
// - web/frontend/src/shared/components/PreviewAnnotateActions.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx

/** 작업 파일 프리뷰 「채팅 첨부」가 쓰는 파일명. `paintNoteFileName("작업파일")`. */
export const WORK_FILE_PAINT_CHAT_NAME_RE = /^작업파일-표시-\d{6}\.png$/i;

const OPEN_WORK_FILES = new WeakMap<File, true>();

export function markChatFileOpensWorkFiles(file: File): File {
  OPEN_WORK_FILES.set(file, true);
  return file;
}

export function chatFileOpensWorkFiles(file: File): boolean {
  return OPEN_WORK_FILES.has(file) || chatAttachmentOpensWorkFiles(file);
}

/** 첨부 메타·파일명으로 작업 파일 뷰어를 열지 판별. */
export function chatAttachmentOpensWorkFiles(file: {
  openWorkFiles?: boolean;
  fileName?: string;
  name?: string;
}): boolean {
  if (file?.openWorkFiles === true) return true;
  const name = String(file?.fileName || file?.name || "").trim();
  return WORK_FILE_PAINT_CHAT_NAME_RE.test(name);
}
