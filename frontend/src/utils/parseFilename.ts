/**
 * STL 파일명에서 치과이름, 환자이름, 치아번호를 추출하는 유틸리티
 *
 * 예상 형식:
 * - "치과이름_환자이름_치아번호.stl"
 * - "치과이름-환자이름-치아번호.stl"
 * - "치과이름 환자이름 치아번호.stl"
 */

export interface ParsedFilenameInfo {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
}

/**
 * 치아번호 패턴 (대한민국 표기법)
 * 단일: 11-18, 21-28, 31-38, 41-48
 * 브리지: 32-42, 11-13 등 (숫자-숫자 형태)
 */
const TOOTH_PATTERN = /\b([1-4][1-8])\b/;
const BRIDGE_PATTERN = /\b([1-4][1-8])-([1-4][1-8])\b/;

/**
 * 파일명에서 치아번호 추출 (브리지 우선)
 * 브리지(예: 32-42)가 있으면 브리지 반환, 없으면 단일 치아번호 반환
 */
function extractTooth(filename: string): string | undefined {
  // 1. 브리지 패턴 먼저 확인 (예: 32-42)
  const bridgeMatch = filename.match(BRIDGE_PATTERN);
  if (bridgeMatch) {
    return `${bridgeMatch[1]}-${bridgeMatch[2]}`;
  }

  // 2. 단일 치아번호 확인
  const match = filename.match(TOOTH_PATTERN);
  return match ? match[1] : undefined;
}

/**
 * 파일명을 구분자(_, -, 공백)로 분할
 */
function splitFilename(filename: string): string[] {
  // 확장자 제거
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // 구분자로 분할 (_, -, 공백)
  const parts = nameWithoutExt
    .split(/[_\-\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return parts;
}

/**
 * 파일명에서 환자이름 추출 (치아번호 제외)
 */
function extractPatientName(
  parts: string[],
  toothIndex: number
): string | undefined {
  if (toothIndex < 0 || toothIndex >= parts.length) return undefined;

  // 치아번호 앞쪽 파츠들 중, 한글이 포함된 가장 오른쪽 파트를 환자이름으로 간주
  for (let i = toothIndex - 1; i >= 0; i--) {
    const raw = parts[i];
    if (!/[가-힣]/.test(raw)) {
      continue;
    }

    // 앞쪽에 붙은 날짜/숫자(예: 20251119김혜영) 제거
    const stripped = raw.replace(/^[0-9]+[_\-\s]*/, "");
    const name = stripped.length > 0 ? stripped : raw;
    if (name) return name;
  }

  return undefined;
}

/**
 * 파일명에서 치과이름 추출
 */
function extractClinicName(
  parts: string[],
  toothIndex: number,
  patientIndex: number
): string | undefined {
  // 치과이름은 환자이름 앞의 파트들 중, 한글이 포함되고 순수 숫자가 아닌 파트들을 결합
  const endIndex = patientIndex > 0 ? patientIndex : toothIndex;
  if (endIndex <= 0) return undefined;

  const clinicParts: string[] = [];
  for (let i = 0; i < endIndex; i++) {
    const token = parts[i];
    // 순수 숫자(날짜 등)는 치과이름에서 제외
    if (/^[0-9]+$/.test(token)) continue;
    // 한글이 하나도 없으면 치과이름 후보로 보지 않음
    if (!/[가-힣]/.test(token)) continue;
    clinicParts.push(token);
  }

  if (clinicParts.length === 0) return undefined;
  return clinicParts.join(" ");
}

/**
 * STL 파일명에서 치과이름, 환자이름, 치아번호 추출
 *
 * @param filename - STL 파일명 (확장자 포함)
 * @returns 추출된 정보 객체
 */
export function parseFilename(filename: string): ParsedFilenameInfo {
  const result: ParsedFilenameInfo = {};

  // 1. 치아번호 추출
  const tooth = extractTooth(filename);
  if (tooth) {
    result.tooth = tooth;
  }

  // 2. 파일명을 구분자로 분할
  const parts = splitFilename(filename);
  if (parts.length === 0) {
    return result;
  }

  // 3. 치아번호의 위치 찾기 (브리지 또는 단일)
  let toothIndex = -1;

  // 먼저 브리지 패턴 찾기 (예: 32-42)
  const bridgeIndex = parts.findIndex((p: string) => BRIDGE_PATTERN.test(p));
  if (bridgeIndex >= 0) {
    toothIndex = bridgeIndex;
  } else {
    // 브리지가 없으면 단일 치아번호 찾기
    toothIndex = parts.findIndex((p: string) => TOOTH_PATTERN.test(p));
  }

  if (toothIndex >= 0) {
    // 치아번호가 있는 경우
    const patientIndex = toothIndex > 0 ? toothIndex - 1 : -1;

    // 환자이름 추출
    const patientName = extractPatientName(parts, toothIndex);
    if (patientName) {
      result.patientName = patientName;
    }

    // 치과이름 추출
    const clinicName = extractClinicName(parts, toothIndex, patientIndex);
    if (clinicName) {
      result.clinicName = clinicName;
    }
  } else {
    // 치아번호가 없는 경우: 첫 번째를 치과이름, 두 번째를 환자이름으로 간주
    if (parts.length >= 1) {
      result.clinicName = parts[0];
    }
    if (parts.length >= 2) {
      result.patientName = parts[1];
    }
  }

  return result;
}

/**
 * 여러 파일명에서 정보 추출 (첫 번째 파일의 정보 사용)
 */
export function parseFilenames(filenames: string[]): ParsedFilenameInfo {
  if (filenames.length === 0) {
    return {};
  }

  // 첫 번째 파일명에서 추출
  return parseFilename(filenames[0]);
}
