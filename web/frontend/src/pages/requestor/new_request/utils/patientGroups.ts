// change-log:
// - 2026-08-09: 크기별 productMode·상단 뱃지(구강스캔/어벗디자인) SSOT 주석.
// - 2026-08-09: 구강스캔 자동묶음 — 파일 크기(>3MB) 기준. 소형(<1.5MB) 커스텀어벗은 제외.
// - 2026-08-09: 구강스캔 카드 제목 — 파일명 환자명/공통 문자열 추출.
// - 2026-08-09: 디자인+생산용 환자 단위 파일 묶음(구강 스캔 N개 → 환자 1건).
// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/usePatientFileGroups.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestSubmitV2.ts
// - web/frontend/src/shared/filename/parseFilenameWithRules.ts

import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";

/** 이 크기 초과면 구강 스캔으로 간주 (자동 묶음 대상 → 디자인+생산) */
export const ORAL_SCAN_MIN_BYTES = 3 * 1024 * 1024;
/** 이 크기 미만이면 커스텀어벗 디자인 STL로 간주 (자동 묶음 제외 → 생산) */
export const CUSTOM_ABUT_DESIGN_MAX_BYTES = 1.5 * 1024 * 1024;

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

/** 구강 스캔 후보(>3MB). 자동 묶음·디자인+생산. */
export function isLikelyOralScanSize(sizeBytes: number | null | undefined): boolean {
  return typeof sizeBytes === "number" && sizeBytes > ORAL_SCAN_MIN_BYTES;
}

/** 커스텀어벗 디자인 STL 후보(<1.5MB). 자동 묶음 제외·생산. */
export function isLikelyCustomAbutDesignSize(
  sizeBytes: number | null | undefined,
): boolean {
  return (
    typeof sizeBytes === "number" &&
    sizeBytes >= 0 &&
    sizeBytes < CUSTOM_ABUT_DESIGN_MAX_BYTES
  );
}

function filterOralScanFileKeys(
  fileKeys: string[],
  sizeByFileKey?: Record<string, number | undefined>,
): string[] {
  return fileKeys.filter((key) =>
    isLikelyOralScanSize(resolveFileSizeBytes(key, sizeByFileKey)),
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
 * 새로 추가된 파일들 중 같은 환자명(비어 있지 않음)끼리 묶을 후보를 만든다.
 * 기존 그룹에 같은 환자가 있으면 그 그룹 id로 합친다.
 * 구강 스캔 크기(>3MB)만 대상 — 소형 커스텀어벗 디자인 STL은 같은 환자여도 묶지 않는다.
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
  const byPatient = new Map<string, string[]>();

  for (const fileKey of oralScanKeys) {
    const patientKey = normalizePatientKey(patientNameByFileKey[fileKey]);
    if (!patientKey) continue;
    const list = byPatient.get(patientKey) || [];
    list.push(fileKey);
    byPatient.set(patientKey, list);
  }

  const groupsToCreate: PatientFileGroup[] = [];
  const groupsToUpdate: PatientFileGroup[] = [];
  const usedExisting = new Set<string>();

  for (const [patientKey, keys] of byPatient.entries()) {
    const existing = existingGroups.find((group) => {
      if (usedExisting.has(group.id)) return false;
      const primary = getPrimaryFileKey(group);
      if (!primary) return false;
      return normalizePatientKey(patientNameByFileKey[primary]) === patientKey;
    });

    if (existing) {
      usedExisting.add(existing.id);
      const merged = Array.from(new Set([...existing.fileKeys, ...keys]));
      if (merged.length !== existing.fileKeys.length) {
        groupsToUpdate.push({ ...existing, fileKeys: merged });
      }
      continue;
    }

    if (keys.length >= 2) {
      groupsToCreate.push({
        id: createPatientGroupId(),
        fileKeys: keys,
      });
    }
  }

  return { groupsToCreate, groupsToUpdate };
}

/**
 * 한 번에 드롭/선택한 파일이 2개 이상이고 환자명이 없거나 모두 같으면
 * (구강 스캔 묶음으로 보고) 하나의 환자 그룹으로 만든다.
 * 구강 스캔 크기(>3MB)만 대상 — 동일 환자 커스텀어벗 여러 개를 한꺼번에 올려도 묶지 않는다.
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
  const nonEmpty = patientKeys.filter(Boolean);
  const unique = new Set(nonEmpty);

  // 환자명이 서로 다르면 배치 묶음 금지 (환자명 기반 자동묶음에 맡김)
  if (unique.size > 1) return null;

  // 이미 환자명으로 묶였으면 스킵
  if (unique.size === 1 && nonEmpty.length === keys.length) return null;

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
