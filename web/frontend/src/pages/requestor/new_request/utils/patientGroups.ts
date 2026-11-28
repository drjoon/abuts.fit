// change-log:
// - 2026-11-28: 자동 묶음 — 역할어 제거 줄기(stem) 우선, 포맷 무관(isLikelyOralScanFile).
// - 2026-08-10: 수동 합치기/해제는 3MB 필터 없음(모든 파일). 자동만 크기 기준 — 룰 SSOT 정리.
// - 2026-08-09: 크기 판정 3MB 단일 기준 — >=3MB 구강스캔, <3MB 어벗디자인(중간 구간 제거).
// - 2026-08-09: 크기별 productMode·상단 뱃지(구강스캔/어벗디자인) SSOT 주석.
// - 2026-08-09: 구강스캔 자동묶음 — 파일 크기(>=3MB) 기준. 소형(<3MB) 커스텀어벗은 제외.
// - 2026-08-09: 구강스캔 카드 제목 — 파일명 환자명/공통 문자열 추출.
// - 2026-08-09: 디자인+생산용 환자 단위 파일 묶음(구강 스캔 N개 → 환자 1건).
// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/usePatientFileGroups.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/frontend/src/shared/filename/parseFilenameWithRules.ts
// - .cursor/rules/oral-scan-file-size.mdc
// - docs/intent/oral-scan-bundle-multi-abutment.md

import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import {
  getPracticeTransferFileExtension,
  PRACTICE_TRANSFER_CAD_PROJECT_EXTENSIONS,
  PRACTICE_TRANSFER_MODEL_EXTENSIONS,
} from "@/shared/practice/practiceTransferAccept";

/** 이 크기 이상이면 구강 스캔으로 간주 (**자동** 묶음 대상 → 디자인+생산) */
export const ORAL_SCAN_MIN_BYTES = 3 * 1024 * 1024;
/**
 * 이 크기 미만이면 커스텀어벗 디자인 STL로 간주 (**자동** 묶음 제외 → 생산).
 * 3MB 단일 기준 — ORAL_SCAN_MIN_BYTES와 동일.
 * 수동 합치기/연결 끊기에는 이 기준을 쓰지 않는다.
 */
export const CUSTOM_ABUT_DESIGN_MAX_BYTES = ORAL_SCAN_MIN_BYTES;

export type PatientFileGroup = {
  id: string;
  /** 그룹에 속한 fileKey 목록. 첫 항목이 대표(primary) 키. */
  fileKeys: string[];
};

/**
 * fileKey(`name:size`)에서 바이트 크기 추출.
 * sizeByFileKey가 있으면 그쪽을 우선한다.
 */
export function resolveFileSizeBytes(
  fileKey: string,
  sizeByFileKey?: Record<string, number | undefined>,
): number | null {
  const fromMap = sizeByFileKey?.[fileKey];
  if (typeof fromMap === "number" && Number.isFinite(fromMap) && fromMap >= 0) {
    return fromMap;
  }
  const idx = String(fileKey || "").lastIndexOf(":");
  if (idx < 0) return null;
  const size = Number(String(fileKey).slice(idx + 1));
  return Number.isFinite(size) && size >= 0 ? size : null;
}

/** 구강 스캔 후보(>=3MB). **자동** 묶음·디자인+생산. 수동 경로에서는 사용하지 말 것. */
export function isLikelyOralScanSize(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === "number" && sizeBytes >= ORAL_SCAN_MIN_BYTES;
}

/**
 * 구강 스캔·스캐너 프로젝트 후보.
 * PLY/OBJ/DCM(3Shape)·ExoCAD·3ox는 용량과 무관. STL은 3MB 기준.
 */
export function isLikelyOralScanFile(file: {
  name?: string;
  size?: number;
} | null | undefined): boolean {
  if (!file) return false;
  const ext = getPracticeTransferFileExtension(String(file.name || ""));
  if (ext === ".stl") return isLikelyOralScanSize(file.size);
  if (PRACTICE_TRANSFER_MODEL_EXTENSIONS.has(ext)) return true;
  if (PRACTICE_TRANSFER_CAD_PROJECT_EXTENSIONS.has(ext)) return true;
  return isLikelyOralScanSize(file.size);
}

/** 커스텀어벗 디자인 STL 후보(<3MB). **자동** 묶음 제외·생산. */
export function isLikelyCustomAbutDesignSize(
  sizeBytes: number | null | undefined,
): boolean {
  return (
    typeof sizeBytes === "number" &&
    sizeBytes >= 0 &&
    sizeBytes < CUSTOM_ABUT_DESIGN_MAX_BYTES
  );
}

/**
 * fileKey(`name:size`)에서 원본 파일명 추출.
 */
export function resolveFileNameFromKey(fileKey: string): string {
  const raw = String(fileKey || "");
  const idx = raw.lastIndexOf(":");
  if (idx < 0) return raw;
  return raw.slice(0, idx);
}

/**
 * 상악·하악·바이트 등 역할 토큰.
 * 자동 묶음 줄기(stem)에서 제거한다. 스캐너·언어 무관 공통 키워드만.
 */
const ORAL_SCAN_ROLE_TOKEN_RE =
  /^(?:상악|하악|바이트|바이트[12]|교합|스캔|인상|모델|upper|lower|maxilla|mandible|bite|bite[12]|jaw|occlusion|occlusal|antagonist|scan|prep|situation)$/iu;

const ORAL_SCAN_ROLE_EMBEDDED_RE =
  /(?:^|[\s_\-./\\]+)(?:상악|하악|바이트[12]?|교합|스캔|인상|upper|lower|maxilla|mandible|bite[12]?|jaw|occlusion|occlusal|antagonist|scan)(?=$|[\s_\-./\\]+)/giu;

/** 역할어를 뺀 파일명 줄기(확장자 제외). 같으면 같은 구강스캔 묶음. */
export function resolveOralScanBundleStem(filename: string): string {
  const base = stripExtension(String(filename || ""));
  if (!base) return "";

  const tokens = base
    .split(/[\s_\-./\\]+/u)
    .map((t) => t.trim())
    .filter(Boolean);
  const kept = tokens.filter((token) => !ORAL_SCAN_ROLE_TOKEN_RE.test(token));
  let stem = kept.join("_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();

  if (!stem || stem.length < 2) {
    stem = base
      .replace(ORAL_SCAN_ROLE_EMBEDDED_RE, " ")
      .replace(/[\s_\-./\\]+/gu, "_")
      .replace(/^_|_$/g, "")
      .trim();
  }

  return stem.length >= 2 ? stem : "";
}

export function normalizeOralScanBundleStemKey(stem: string): string {
  return normalizePatientKey(stem);
}

/** 자동 묶음 전용 — 수동 합치기/해제에는 호출하지 않는다. 포맷·크기 무관 구강스캔 후보. */
function filterOralScanFileKeys(
  fileKeys: string[],
  sizeByFileKey?: Record<string, number | undefined>,
): string[] {
  return fileKeys.filter((key) =>
    isLikelyOralScanFile({
      name: resolveFileNameFromKey(key),
      size: resolveFileSizeBytes(key, sizeByFileKey) ?? undefined,
    }),
  );
}

export type AttachmentListItem =
  | { kind: "group"; group: PatientFileGroup; fileIndices: number[] }
  | { kind: "file"; fileKey: string; fileIndex: number };

const normalizePatientKey = (value: unknown): string => {
  try {
    return String(value || "")
      .normalize("NFC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  } catch {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }
};

const stripExtension = (filename: string): string =>
  String(filename || "")
    .normalize("NFC")
    .replace(/\.[^.]+$/u, "")
    .trim();

const tokenizeBasename = (basename: string): string[] =>
  basename
    .split(/[\s_\-./\\]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

/**
 * 파일명들에 공통으로 등장하는 문자열(토큰 우선, 없으면 공통 prefix).
 */
export function findSharedFilenameLabel(filenames: string[]): string {
  const bases = filenames.map(stripExtension).filter(Boolean);
  if (!bases.length) return "";
  if (bases.length === 1) return bases[0];

  const tokenLists = bases.map(tokenizeBasename);
  const firstTokens = tokenLists[0] || [];
  const commonTokens = firstTokens.filter((token) => {
    const key = normalizePatientKey(token);
    if (!key) return false;
    return tokenLists.every((list) =>
      list.some((t) => normalizePatientKey(t) === key),
    );
  });

  const hangulNames = commonTokens.filter((t) => /^[가-힣]{2,6}$/u.test(t));
  if (hangulNames.length) {
    return hangulNames.sort((a, b) => b.length - a.length)[0] || hangulNames[0];
  }
  if (commonTokens.length) {
    return [...commonTokens].sort((a, b) => b.length - a.length)[0] || "";
  }

  let prefix = bases[0];
  for (let i = 1; i < bases.length; i += 1) {
    const next = bases[i];
    while (prefix && !next.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s_\-./\\]+$/u, "").trim();
  return prefix.length >= 2 ? prefix : "";
}

/**
 * 구강스캔 카드 제목:
 * 1) 파일명 파싱 환자명(가장 많이 나온 값)
 * 2) 없으면 파일명 공통 문자열
 */
export function resolveOralScanGroupTitle(filenames: string[]): string {
  const names = filenames.map((n) => String(n || "").trim()).filter(Boolean);
  if (!names.length) return "환자(이름 미입력)";

  const counts = new Map<string, { label: string; count: number }>();
  for (const name of names) {
    const parsed = parseFilenameWithRules(name);
    const patient = String(parsed?.patientName || "").trim();
    if (!patient) continue;
    const key = normalizePatientKey(patient);
    if (!key) continue;
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { label: patient, count: 1 });
  }

  if (counts.size > 0) {
    const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    if (best?.label) return best.label;
  }

  return findSharedFilenameLabel(names) || "환자(이름 미입력)";
}

export function createPatientGroupId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pg_${crypto.randomUUID()}`;
  }
  return `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getPrimaryFileKey(group: PatientFileGroup): string | null {
  const key = String(group?.fileKeys?.[0] || "").trim();
  return key || null;
}

export function findGroupByFileKey(
  groups: PatientFileGroup[],
  fileKey: string,
): PatientFileGroup | null {
  const key = String(fileKey || "").trim();
  if (!key) return null;
  return groups.find((g) => g.fileKeys.includes(key)) || null;
}

export function buildFileKeyToGroupIdMap(
  groups: PatientFileGroup[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const key of group.fileKeys) {
      map.set(key, group.id);
    }
  }
  return map;
}

/**
 * 파일 목록을 화면 카드 단위로 펼친다.
 * - 그룹: 대표 파일 인덱스 + 멤버 인덱스들
 * - 단독: 그룹에 속하지 않은 파일
 * 순서는 files 배열의 첫 등장 순서를 따른다.
 */
export function buildAttachmentListItems(
  files: File[],
  toFileKey: (file: File) => string,
  groups: PatientFileGroup[],
): AttachmentListItem[] {
  const keyToIndex = new Map<string, number>();
  files.forEach((file, index) => {
    keyToIndex.set(toFileKey(file), index);
  });

  const validGroups = groups
    .map((group) => ({
      ...group,
      fileKeys: group.fileKeys.filter((key) => keyToIndex.has(key)),
    }))
    .filter((group) => group.fileKeys.length >= 2);

  const groupedKeys = new Set<string>();
  for (const group of validGroups) {
    for (const key of group.fileKeys) groupedKeys.add(key);
  }

  const emittedGroupIds = new Set<string>();
  const items: AttachmentListItem[] = [];

  files.forEach((file, index) => {
    const fileKey = toFileKey(file);
    const group = validGroups.find((g) => g.fileKeys.includes(fileKey));
    if (group) {
      if (emittedGroupIds.has(group.id)) return;
      emittedGroupIds.add(group.id);
      items.push({
        kind: "group",
        group,
        fileIndices: group.fileKeys
          .map((key) => keyToIndex.get(key))
          .filter((v): v is number => typeof v === "number"),
      });
      return;
    }
    if (groupedKeys.has(fileKey)) return;
    items.push({ kind: "file", fileKey, fileIndex: index });
  });

  return items;
}

/**
 * 기존 그룹의 묶음 키(줄기 우선, 없으면 환자명).
 */
function resolveGroupBundleKey(
  group: PatientFileGroup,
  patientNameByFileKey: Record<string, string | undefined>,
): { stemKey: string; patientKey: string } {
  const stems = group.fileKeys
    .map((key) =>
      normalizeOralScanBundleStemKey(
        resolveOralScanBundleStem(resolveFileNameFromKey(key)),
      ),
    )
    .filter(Boolean);
  const stemCounts = new Map<string, number>();
  for (const stem of stems) {
    stemCounts.set(stem, (stemCounts.get(stem) || 0) + 1);
  }
  const stemKey =
    [...stemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const primary = getPrimaryFileKey(group);
  const patientKey = primary
    ? normalizePatientKey(patientNameByFileKey[primary])
    : "";
  return { stemKey, patientKey };
}

/**
 * 새로 추가된 구강스캔을 묶는다.
 * 1) 역할어를 뺀 파일명 줄기(stem)가 같으면 합친다 (포맷 무관).
 * 2) 줄기가 없으면 환자명 폴백.
 * 소형 커스텀어벗 디자인 STL은 제외.
 */
export function planAutoGroupsForNewFiles(params: {
  newFileKeys: string[];
  patientNameByFileKey: Record<string, string | undefined>;
  existingGroups: PatientFileGroup[];
  sizeByFileKey?: Record<string, number | undefined>;
}): { groupsToCreate: PatientFileGroup[]; groupsToUpdate: PatientFileGroup[] } {
  const { newFileKeys, patientNameByFileKey, existingGroups, sizeByFileKey } =
    params;
  const oralScanKeys = filterOralScanFileKeys(newFileKeys, sizeByFileKey);

  const byStem = new Map<string, string[]>();
  const leftoverKeys: string[] = [];

  for (const fileKey of oralScanKeys) {
    const stemKey = normalizeOralScanBundleStemKey(
      resolveOralScanBundleStem(resolveFileNameFromKey(fileKey)),
    );
    if (!stemKey) {
      leftoverKeys.push(fileKey);
      continue;
    }
    const list = byStem.get(stemKey) || [];
    list.push(fileKey);
    byStem.set(stemKey, list);
  }

  const groupsToCreate: PatientFileGroup[] = [];
  const groupsToUpdate: PatientFileGroup[] = [];
  const usedExisting = new Set<string>();
  const claimedKeys = new Set<string>();

  const claimIntoExistingOrCreate = (
    matchKey: string,
    keys: string[],
    match: "stem" | "patient",
  ) => {
    if (!keys.length) return;
    const existing = existingGroups.find((group) => {
      if (usedExisting.has(group.id)) return false;
      const bundle = resolveGroupBundleKey(group, patientNameByFileKey);
      return match === "stem"
        ? bundle.stemKey === matchKey
        : bundle.patientKey === matchKey;
    });

    if (existing) {
      usedExisting.add(existing.id);
      const merged = Array.from(new Set([...existing.fileKeys, ...keys]));
      for (const key of keys) claimedKeys.add(key);
      if (merged.length !== existing.fileKeys.length) {
        groupsToUpdate.push({ ...existing, fileKeys: merged });
      }
      return;
    }

    if (keys.length >= 2) {
      for (const key of keys) claimedKeys.add(key);
      groupsToCreate.push({
        id: createPatientGroupId(),
        fileKeys: keys,
      });
    }
  };

  for (const [stemKey, keys] of byStem.entries()) {
    claimIntoExistingOrCreate(stemKey, keys, "stem");
  }

  const byPatient = new Map<string, string[]>();
  for (const fileKey of leftoverKeys) {
    if (claimedKeys.has(fileKey)) continue;
    const patientKey = normalizePatientKey(patientNameByFileKey[fileKey]);
    if (!patientKey) continue;
    const list = byPatient.get(patientKey) || [];
    list.push(fileKey);
    byPatient.set(patientKey, list);
  }
  // stem으로 1개만 남아 환자명으로 기존 묶음에 붙일 수 있는 경우
  for (const [stemKey, keys] of byStem.entries()) {
    for (const fileKey of keys) {
      if (claimedKeys.has(fileKey)) continue;
      const patientKey = normalizePatientKey(patientNameByFileKey[fileKey]);
      if (!patientKey) continue;
      const list = byPatient.get(patientKey) || [];
      list.push(fileKey);
      byPatient.set(patientKey, list);
    }
    void stemKey;
  }

  for (const [patientKey, keys] of byPatient.entries()) {
    const unique = Array.from(new Set(keys)).filter((k) => !claimedKeys.has(k));
    claimIntoExistingOrCreate(patientKey, unique, "patient");
  }

  return { groupsToCreate, groupsToUpdate };
}

/**
 * 한 번에 드롭/선택한 파일이 2개 이상이고 환자명·줄기가 없거나 모두 같으면
 * (구강 스캔 묶음으로 보고) 하나의 그룹으로 만든다.
 * 포맷 무관 구강스캔 후보만 — 소형 어벗 STL은 묶지 않는다.
 */
export function planBatchGroupIfAmbiguous(params: {
  newFileKeys: string[];
  patientNameByFileKey: Record<string, string | undefined>;
  alreadyGroupedKeys: Set<string>;
  sizeByFileKey?: Record<string, number | undefined>;
}): PatientFileGroup | null {
  const keys = filterOralScanFileKeys(
    params.newFileKeys.filter((k) => !params.alreadyGroupedKeys.has(k)),
    params.sizeByFileKey,
  );
  if (keys.length < 2) return null;

  const patientKeys = keys.map((k) =>
    normalizePatientKey(params.patientNameByFileKey[k]),
  );
  const nonEmptyPatients = patientKeys.filter(Boolean);
  const uniquePatients = new Set(nonEmptyPatients);

  // 환자명이 서로 다르면 배치 묶음 금지
  if (uniquePatients.size > 1) return null;

  const stemKeys = keys
    .map((k) =>
      normalizeOralScanBundleStemKey(
        resolveOralScanBundleStem(resolveFileNameFromKey(k)),
      ),
    )
    .filter(Boolean);
  const uniqueStems = new Set(stemKeys);

  // 줄기가 서로 다르면 줄기 자동묶음에 맡김
  if (uniqueStems.size > 1) return null;

  // 이미 환자명 또는 줄기로 전부 식별되면 스킵(위에서 묶였어야 함)
  if (
    uniquePatients.size === 1 &&
    nonEmptyPatients.length === keys.length
  ) {
    return null;
  }
  if (uniqueStems.size === 1 && stemKeys.length === keys.length) {
    return null;
  }

  return {
    id: createPatientGroupId(),
    fileKeys: keys,
  };
}

export function removeFileKeysFromGroups(
  groups: PatientFileGroup[],
  fileKeysToRemove: string[],
): PatientFileGroup[] {
  const removeSet = new Set(fileKeysToRemove);
  return groups
    .map((group) => ({
      ...group,
      fileKeys: group.fileKeys.filter((key) => !removeSet.has(key)),
    }))
    .filter((group) => group.fileKeys.length >= 2);
}

export function mergeFileKeysIntoGroup(
  groups: PatientFileGroup[],
  groupId: string,
  fileKeys: string[],
): PatientFileGroup[] {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      fileKeys: Array.from(new Set([...group.fileKeys, ...fileKeys])),
    };
  });
}
