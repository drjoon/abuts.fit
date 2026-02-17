/**
 * ParseLog API 클라이언트
 * 백엔드의 파싱 로그 API와 통신
 */

import { request } from "@/shared/api/apiClient";

export interface ParseLogPayload {
  filename: string;
  parsed: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };
  userInput: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };
  matchedRuleId?: string;
  draftId?: string;
}

export interface ParseLogResponse {
  _id: string;
  filename: string;
  parsed: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };
  userInput: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
  };
  isCorrect: boolean;
  mismatchedFields?: string[];
  matchedRuleId?: string;
  createdAt: string;
}

/**
 * 파싱 로그 저장
 */
export async function createParseLog(
  payload: ParseLogPayload
): Promise<ParseLogResponse> {
  const response = await request<ParseLogResponse>({
    path: "/api/parse-logs",
    method: "POST",
    jsonBody: payload,
  });

  return response.data;
}

/**
 * 틀린 로그 조회
 */
export async function getIncorrectLogs(options?: {
  limit?: number;
  skip?: number;
  userId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  data: ParseLogResponse[];
  pagination: {
    total: number;
    limit: number;
    skip: number;
    pages: number;
  };
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.skip) params.append("skip", String(options.skip));
  if (options?.userId) params.append("userId", options.userId);
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);

  const response = await request<{
    data: ParseLogResponse[];
    pagination: any;
  }>({
    path: `/api/parse-logs/incorrect?${params.toString()}`,
    method: "GET",
  });

  return response.data;
}

/**
 * 자주 틀리는 패턴 분석
 */
export async function analyzeMismatches(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<{
  fieldMismatches: Array<{
    _id: string;
    count: number;
  }>;
  patternMismatches: Array<{
    _id: string;
    count: number;
    fields: string[][];
  }>;
}> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);

  const response = await request<any>({
    path: `/api/parse-logs/analysis/mismatches?${params.toString()}`,
    method: "GET",
  });

  return response.data;
}

/**
 * 로그 통계
 */
export async function getParseLogStatistics(options?: {
  startDate?: string;
  endDate?: string;
  userId?: string;
}): Promise<{
  totalLogs: number;
  correctLogs: number;
  incorrectLogs: number;
  correctRate: number;
}> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);
  if (options?.userId) params.append("userId", options.userId);

  const response = await request<any>({
    path: `/api/parse-logs/stats?${params.toString()}`,
    method: "GET",
  });

  return response.data;
}

/**
 * 로그 내보내기 (JSON)
 */
export async function exportLogsAsJSON(options?: {
  startDate?: string;
  endDate?: string;
  isCorrect?: boolean;
}): Promise<void> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);
  if (options?.isCorrect !== undefined)
    params.append("isCorrect", String(options.isCorrect));

  const url = `/api/parse-logs/export/json?${params.toString()}`;
  window.location.href = url;
}

/**
 * 로그 내보내기 (CSV)
 */
export async function exportLogsAsCSV(options?: {
  startDate?: string;
  endDate?: string;
  isCorrect?: boolean;
}): Promise<void> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);
  if (options?.isCorrect !== undefined)
    params.append("isCorrect", String(options.isCorrect));

  const url = `/api/parse-logs/export/csv?${params.toString()}`;
  window.location.href = url;
}
