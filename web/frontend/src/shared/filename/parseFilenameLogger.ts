/**
 * 파일명 파싱 결과 로깅 및 피드백 수집
 *
 * 목적:
 * - 파싱 결과 vs 사용자 최종 입력값 비교
 * - "규칙이 자주 틀리는 패턴" 수집
 * - 오프라인 AI 도구에 데이터 제공
 */

export interface ParseFilenameLog {
  /** 로그 ID (타임스탬프 기반) */
  id: string;

  /** 원본 파일명 */
  filename: string;

  /** 파싱 결과 */
  parsed: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };

  /** 사용자가 최종 입력한 값 */
  userInput: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };

  /** 파싱 결과와 사용자 입력이 일치하는지 여부 */
  isCorrect: boolean;

  /** 일치하지 않는 필드 목록 */
  mismatchedFields?: ("clinicName" | "patientName" | "tooth")[];

  /** 로그 생성 시각 (ISO 8601) */
  createdAt: string;

  /** 사용자 ID (선택사항) */
  userId?: string;

  /** 기공소 ID (선택사항, 나중에 기공소별 룰 분리용) */
  clinicId?: string;
}

/**
 * 로그 저장소 (로컬 스토리지 또는 IndexedDB)
 */
const PARSE_LOG_STORAGE_KEY = "abutsfit:parse-filename-logs:v1";
const MAX_LOGS_IN_MEMORY = 100; // 메모리에 최대 100개까지만 유지

let logsInMemory: ParseFilenameLog[] = [];

/**
 * 로컬 스토리지에서 로그 로드
 */
function loadLogsFromStorage(): ParseFilenameLog[] {
  try {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(PARSE_LOG_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn("[parseFilenameLogger] Failed to load logs:", err);
    return [];
  }
}

/**
 * 로컬 스토리지에 로그 저장
 */
function saveLogsToStorage(logs: ParseFilenameLog[]): void {
  try {
    if (typeof window === "undefined") return;
    // 최근 로그만 저장 (용량 제한)
    const recentLogs = logs.slice(-MAX_LOGS_IN_MEMORY);
    localStorage.setItem(PARSE_LOG_STORAGE_KEY, JSON.stringify(recentLogs));
  } catch (err) {
    console.warn("[parseFilenameLogger] Failed to save logs:", err);
  }
}

/**
 * 파싱 결과 로깅
 *
 * @param filename 원본 파일명
 * @param parsed 파싱 결과
 * @param userInput 사용자가 최종 입력한 값
 */
export function logParseResult(
  filename: string,
  parsed: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  },
  userInput: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  }
): ParseFilenameLog {
  // 일치 여부 판단
  const mismatchedFields: ("clinicName" | "patientName" | "tooth")[] = [];
  const isCorrect =
    (parsed.clinicName || "") === (userInput.clinicName || "") &&
    (parsed.patientName || "") === (userInput.patientName || "") &&
    (parsed.tooth || "") === (userInput.tooth || "");

  if ((parsed.clinicName || "") !== (userInput.clinicName || "")) {
    mismatchedFields.push("clinicName");
  }
  if ((parsed.patientName || "") !== (userInput.patientName || "")) {
    mismatchedFields.push("patientName");
  }
  if ((parsed.tooth || "") !== (userInput.tooth || "")) {
    mismatchedFields.push("tooth");
  }

  const log: ParseFilenameLog = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    filename,
    parsed,
    userInput,
    isCorrect,
    mismatchedFields:
      mismatchedFields.length > 0 ? mismatchedFields : undefined,
    createdAt: new Date().toISOString(),
  };

  // 메모리에 추가
  logsInMemory.push(log);
  if (logsInMemory.length > MAX_LOGS_IN_MEMORY) {
    logsInMemory = logsInMemory.slice(-MAX_LOGS_IN_MEMORY);
  }

  // 스토리지에 저장
  saveLogsToStorage(logsInMemory);

  console.log(
    `[parseFilenameLogger] Logged: ${filename} (correct: ${isCorrect})`
  );

  return log;
}

/**
 * 모든 로그 조회
 */
export function getAllLogs(): ParseFilenameLog[] {
  if (logsInMemory.length === 0) {
    logsInMemory = loadLogsFromStorage();
  }
  return [...logsInMemory];
}

/**
 * 틀린 로그만 조회 (AI 학습용)
 */
export function getIncorrectLogs(): ParseFilenameLog[] {
  return getAllLogs().filter((log) => !log.isCorrect);
}

/**
 * 특정 필드가 자주 틀리는 패턴 분석
 */
export function analyzeCommonMismatches(): {
  field: string;
  count: number;
  examples: ParseFilenameLog[];
}[] {
  const logs = getIncorrectLogs();
  const fieldCounts: Record<string, ParseFilenameLog[]> = {
    clinicName: [],
    patientName: [],
    tooth: [],
  };

  logs.forEach((log) => {
    log.mismatchedFields?.forEach((field) => {
      fieldCounts[field].push(log);
    });
  });

  return Object.entries(fieldCounts)
    .map(([field, examples]) => ({
      field,
      count: examples.length,
      examples: examples.slice(0, 5), // 상위 5개만
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 로그를 JSON으로 내보내기 (AI 분석용)
 */
export function exportLogsAsJSON(): string {
  return JSON.stringify(getAllLogs(), null, 2);
}

/**
 * 로그를 CSV로 내보내기 (스프레드시트용)
 */
export function exportLogsAsCSV(): string {
  const logs = getAllLogs();
  const headers = [
    "filename",
    "parsed_clinic",
    "parsed_patient",
    "parsed_tooth",
    "user_clinic",
    "user_patient",
    "user_tooth",
    "is_correct",
    "mismatched_fields",
    "created_at",
  ];

  const rows = logs.map((log) => [
    log.filename,
    log.parsed.clinicName || "",
    log.parsed.patientName || "",
    log.parsed.tooth || "",
    log.userInput.clinicName || "",
    log.userInput.patientName || "",
    log.userInput.tooth || "",
    log.isCorrect ? "true" : "false",
    log.mismatchedFields?.join("|") || "",
    log.createdAt,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return csvContent;
}

/**
 * 로그 초기화
 */
export function clearAllLogs(): void {
  logsInMemory = [];
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(PARSE_LOG_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("[parseFilenameLogger] Failed to clear logs:", err);
  }
}

/**
 * 로그 통계
 */
export function getLogStatistics(): {
  totalLogs: number;
  correctLogs: number;
  incorrectLogs: number;
  correctRate: number;
} {
  const logs = getAllLogs();
  const correctLogs = logs.filter((log) => log.isCorrect).length;
  const incorrectLogs = logs.length - correctLogs;

  return {
    totalLogs: logs.length,
    correctLogs,
    incorrectLogs,
    correctRate: logs.length > 0 ? (correctLogs / logs.length) * 100 : 0,
  };
}
