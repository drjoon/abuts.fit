/**
 * 로컬 스토리지 기반 NewRequest SSOT
 *
 * 파일 드롭부터 의뢰하기 클릭까지 모든 데이터를 로컬 스토리지에 저장
 * - 파일 메타데이터 (File 객체는 IndexedDB에 저장)
 * - 환자/임플란트 정보 (CaseInfos)
 * - 중복 처리 결정 (DuplicateResolutions)
 *
 * 의뢰하기 클릭 시 이 데이터를 기반으로 S3 업로드 및 Draft 생성
 */

const STORAGE_KEY = "abutsfit:new-request-draft:v2";

export interface FileMetadata {
  fileKey: string; // "파일명:파일크기"
  name: string;
  size: number;
  type: string;
  lastModified: number;
  addedAt: number;
}

export interface CaseInfos {
  clinicName: string;
  patientName: string;
  tooth: string;
  implantManufacturer?: string;
  implantSystem?: string;
  implantType?: string;
  maxDiameter?: number;
  connectionDiameter?: number;
  shippingMode?: string;
  requestedShipDate?: string;
  workType?: string;
}

export interface DuplicateResolution {
  fileKey: string;
  strategy: "skip" | "replace" | "remake";
  existingRequestId: string;
  resolvedAt: number;
}

export interface LocalDraft {
  files: FileMetadata[];
  caseInfosMap: Record<string, CaseInfos>; // fileKey -> CaseInfos
  duplicateResolutions: DuplicateResolution[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 파일 키 생성 (파일명 + 크기)
 * - 파일명은 NFC 정규화하여 일관성을 유지한다.
 */
export function getFileKey(file: File): string {
  const name = (() => {
    try {
      return String(file.name || "").normalize("NFC");
    } catch {
      return String(file.name || "");
    }
  })();
  return `${name}:${file.size}`;
}

/**
 * 로컬 Draft 조회
 */
export function getLocalDraft(): LocalDraft | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const draft: LocalDraft = JSON.parse(stored);
    return draft;
  } catch (error) {
    console.error("[localDraftStorage] Failed to load local draft:", error);
    return null;
  }
}

/**
 * 로컬 Draft 저장
 */
export function saveLocalDraft(draft: LocalDraft): void {
  try {
    draft.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.error("[localDraftStorage] Failed to save local draft:", error);
  }
}

/**
 * 로컬 Draft 초기화
 */
export function initLocalDraft(): LocalDraft {
  const draft: LocalDraft = {
    files: [],
    caseInfosMap: {},
    duplicateResolutions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveLocalDraft(draft);
  return draft;
}

/**
 * 로컬 Draft 삭제
 */
export function clearLocalDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("[localDraftStorage] Failed to clear local draft:", error);
  }
}

/**
 * 파일 추가
 */
export function addFile(file: File): LocalDraft {
  const draft = getLocalDraft() || initLocalDraft();
  const fileKey = getFileKey(file);

  // 중복 체크
  const exists = draft.files.some((f) => f.fileKey === fileKey);
  if (exists) {
    return draft;
  }

  const metadata: FileMetadata = {
    fileKey,
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    addedAt: Date.now(),
  };

  draft.files.push(metadata);
  saveLocalDraft(draft);
  return draft;
}

/**
 * 여러 파일 추가
 */
export function addFiles(files: File[]): {
  draft: LocalDraft;
  addedCount: number;
  skippedCount: number;
} {
  const draft = getLocalDraft() || initLocalDraft();
  const existingKeys = new Set(draft.files.map((f) => f.fileKey));

  let addedCount = 0;
  let skippedCount = 0;

  files.forEach((file) => {
    const fileKey = getFileKey(file);
    if (existingKeys.has(fileKey)) {
      skippedCount++;
      return;
    }

    const metadata: FileMetadata = {
      fileKey,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      addedAt: Date.now(),
    };

    draft.files.push(metadata);
    existingKeys.add(fileKey);
    addedCount++;
  });

  if (addedCount > 0) {
    saveLocalDraft(draft);
  }

  return { draft, addedCount, skippedCount };
}

/**
 * 파일 제거
 */
export function removeFile(fileKey: string): LocalDraft {
  const draft = getLocalDraft() || initLocalDraft();

  draft.files = draft.files.filter((f) => f.fileKey !== fileKey);
  delete draft.caseInfosMap[fileKey];
  draft.duplicateResolutions = draft.duplicateResolutions.filter(
    (r) => r.fileKey !== fileKey,
  );

  saveLocalDraft(draft);
  return draft;
}

/**
 * CaseInfos 업데이트
 */
export function updateCaseInfos(
  fileKey: string,
  caseInfos: Partial<CaseInfos>,
): LocalDraft {
  const draft = getLocalDraft() || initLocalDraft();

  const existing = draft.caseInfosMap[fileKey] || {
    clinicName: "",
    patientName: "",
    tooth: "",
  };

  draft.caseInfosMap[fileKey] = {
    ...existing,
    ...caseInfos,
  };

  saveLocalDraft(draft);
  return draft;
}

/**
 * 중복 처리 결정 추가
 */
export function addDuplicateResolution(
  resolution: Omit<DuplicateResolution, "resolvedAt">,
): LocalDraft {
  const draft = getLocalDraft() || initLocalDraft();

  // 기존 결정 제거
  draft.duplicateResolutions = draft.duplicateResolutions.filter(
    (r) => r.fileKey !== resolution.fileKey,
  );

  // 새 결정 추가
  draft.duplicateResolutions.push({
    ...resolution,
    resolvedAt: Date.now(),
  });

  saveLocalDraft(draft);
  return draft;
}

/**
 * 특정 파일의 중복 처리 결정 조회
 */
export function getDuplicateResolution(
  fileKey: string,
): DuplicateResolution | undefined {
  const draft = getLocalDraft();
  if (!draft) return undefined;

  return draft.duplicateResolutions.find((r) => r.fileKey === fileKey);
}
