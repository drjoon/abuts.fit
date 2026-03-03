/**
 * 호환용 로컬 파일 스토리지 유틸리티 (V2 -> V3 브릿지)
 * 기존 V2 훅(useNewRequestFilesV2)에서 import하는 모듈을 최소 구현하여
 * 빌드/런타임 오류(404)를 방지합니다.
 *
 * V3에서는 localDraftStorage.ts 를 사용합니다.
 */

import {
  getLocalDraft,
  initLocalDraft,
  saveLocalDraft,
  getFileKey,
} from "./localDraftStorage";

// 드롭된 파일 목록에서 중복을 분리
export function filterNewFiles(files: File[]): {
  newFiles: File[];
  duplicateFiles: File[];
} {
  const draft = getLocalDraft() || initLocalDraft();
  const existing = new Set(draft.files.map((f) => f.fileKey));

  const newFiles: File[] = [];
  const duplicateFiles: File[] = [];

  files.forEach((file) => {
    const key = getFileKey(file);
    if (existing.has(key)) {
      duplicateFiles.push(file);
    } else {
      newFiles.push(file);
    }
  });

  return { newFiles, duplicateFiles };
}

// 업로드 성공한 파일 메타데이터를 로컬에 기록
export function addUploadedFiles(files: File[]): void {
  const draft = getLocalDraft() || initLocalDraft();
  const existing = new Set(draft.files.map((f) => f.fileKey));
  let changed = false;

  files.forEach((file) => {
    const key = getFileKey(file);
    if (existing.has(key)) return;
    draft.files.push({
      fileKey: key,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      addedAt: Date.now(),
    });
    changed = true;
  });

  if (changed) {
    saveLocalDraft(draft);
  }
}

// 업로드 파일 메타데이터 제거
export function removeUploadedFile(fileKey: string): void {
  const draft = getLocalDraft();
  if (!draft) return;

  // SSOT: exact key removal only
  const before = draft.files.length;
  draft.files = draft.files.filter((f) => f.fileKey !== fileKey);
  if (draft.caseInfosMap) delete draft.caseInfosMap[fileKey];
  draft.duplicateResolutions = (draft.duplicateResolutions || []).filter(
    (r) => r.fileKey !== fileKey,
  );

  saveLocalDraft(draft);

  // concise debug
  console.log("[localFileStorage.removeUploadedFile] removed", {
    fileKey,
    removed: before !== draft.files.length,
    remaining: draft.files.length,
  });
}
