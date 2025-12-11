/**
 * 룰 테이블 기반 파일명 파싱 엔진
 *
 * 흐름:
 * 1. 파일명에 매칭되는 룰 찾기
 * 2. 룰의 extraction 설정에 따라 정보 추출
 * 3. 룰이 없거나 실패하면 fallback (기존 parseFilename 로직)
 */

import { ParsedFilenameInfo } from "./parseFilename";
import { findMatchingRule, FilenameRule } from "./filenameRules";
import { parseFilename as fallbackParseFilename } from "./parseFilename";

/**
 * 토큰 배열에서 특정 범위의 한글 토큰 추출
 */
function extractTokenRange(
  parts: string[],
  rangeStr: string,
  endIndex: number
): string[] {
  if (rangeStr === "0-end") {
    // 0부터 endIndex 앞까지의 한글 토큰
    const result: string[] = [];
    for (let i = 0; i < endIndex; i++) {
      if (/[가-힣]/.test(parts[i]) && !/^[0-9]+$/.test(parts[i])) {
        result.push(parts[i]);
      }
    }
    return result;
  }

  // "0-2" 같은 형식
  const [start, end] = rangeStr.split("-").map((s) => {
    const num = parseInt(s, 10);
    return isNaN(num) ? 0 : num;
  });

  return parts.slice(start, end + 1);
}

/**
 * 토큰 인덱스로 추출 (음수는 뒤에서부터)
 */
function extractTokenByIndex(
  parts: string[],
  index: number,
  direction: "forward" | "backward" = "forward"
): string | undefined {
  if (direction === "backward") {
    // 뒤에서부터 검색 (한글 포함 토큰)
    for (let i = Math.min(index, parts.length - 1); i >= 0; i--) {
      if (/[가-힣]/.test(parts[i])) {
        return parts[i];
      }
    }
  } else {
    // 앞에서부터
    if (index >= 0 && index < parts.length) {
      return parts[index];
    }
  }

  return undefined;
}

/**
 * 정규식으로 추출
 */
function extractByRegex(
  filename: string,
  regexStr: string,
  captureGroupIndex: number = 1
): string | undefined {
  try {
    const regex = new RegExp(regexStr);
    const match = filename.match(regex);
    if (match && match[captureGroupIndex]) {
      return match[captureGroupIndex];
    }
  } catch (err) {
    // invalid regex, ignore
  }

  return undefined;
}

/**
 * 후처리 함수
 */
function postprocess(
  value: string | undefined,
  postprocessType?: string
): string | undefined {
  if (!value) return undefined;

  if (postprocessType === "strip_leading_digits") {
    return value.replace(/^[0-9]+[_\-\s]*/, "");
  }

  if (postprocessType === "normalize_spaces") {
    return value.trim().replace(/\s+/g, " ");
  }

  return value;
}

/**
 * 룰 기반 파싱
 */
function parseWithRule(
  filename: string,
  rule: FilenameRule
): Partial<ParsedFilenameInfo> {
  const result: Partial<ParsedFilenameInfo> = {};

  // 파일명을 토큰으로 분할 (fallback 로직과 동일)
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const parts = nameWithoutExt
    .split(/[_\-\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 치과이름 추출
  if (rule.extraction.clinic) {
    const clinic = rule.extraction.clinic;
    let clinicValue: string | undefined;

    if (clinic.type === "regex") {
      clinicValue = extractByRegex(filename, clinic.value as string);
    } else if (clinic.type === "token_range") {
      // 치아번호 위치를 먼저 찾아야 함
      const toothMatch = rule.extraction.tooth
        ? extractByRegex(filename, rule.extraction.tooth.value)
        : null;
      const toothIndex = toothMatch
        ? parts.findIndex((p) => p.includes(toothMatch))
        : parts.length;

      const clinicParts = extractTokenRange(
        parts,
        clinic.value as string,
        toothIndex
      );
      clinicValue = clinicParts.join(" ");
    } else if (clinic.type === "token_indices") {
      const indices = clinic.value as number[];
      const clinicParts = indices
        .map((i) => parts[i])
        .filter((p) => p !== undefined);
      clinicValue = clinicParts.join(" ");
    }

    if (clinicValue) {
      result.clinicName = postprocess(clinicValue, clinic.postprocess);
    }
  }

  // 환자이름 추출
  if (rule.extraction.patient) {
    const patient = rule.extraction.patient;
    let patientValue: string | undefined;

    if (patient.type === "regex") {
      patientValue = extractByRegex(filename, patient.value as string);
    } else if (patient.type === "token_index") {
      const idx = patient.value as number;
      const direction = idx < 0 ? "backward" : "forward";
      const actualIdx = idx < 0 ? parts.length + idx : idx;
      patientValue = extractTokenByIndex(parts, actualIdx, direction);
    }

    if (patientValue) {
      result.patientName = postprocess(patientValue, patient.postprocess);
    }
  }

  // 치아번호 추출
  if (rule.extraction.tooth) {
    const tooth = rule.extraction.tooth;
    if (tooth.type === "regex") {
      const toothValue = extractByRegex(filename, tooth.value, 1);
      if (toothValue) {
        result.tooth = toothValue;
      }
    }
  }

  return result;
}

/**
 * 룰 기반 파일명 파싱 (with fallback)
 */
export function parseFilenameWithRules(filename: string): ParsedFilenameInfo {
  // 1. 매칭되는 룰 찾기
  const rule = findMatchingRule(filename);

  if (rule) {
    try {
      const result = parseWithRule(filename, rule);

      // 부분 성공도 괜찮음 (일부만 추출되었어도 반환)
      if (result.clinicName || result.patientName || result.tooth) {
        return {
          clinicName: result.clinicName,
          patientName: result.patientName,
          tooth: result.tooth,
        };
      }
    } catch (err) {
      // rule failed, fall back
    }
  }

  // 2. Fallback: 기존 parseFilename 로직 사용
  return fallbackParseFilename(filename);
}
