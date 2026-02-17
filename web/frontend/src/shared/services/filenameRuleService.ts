/**
 * FilenameRule API 클라이언트
 * 백엔드의 파일명 파싱 룰 API와 통신
 */

import { request } from "@/shared/api/apiClient";
import { FilenameRule } from "@/shared/filename/filenameRules";

/**
 * 활성 룰 조회
 */
export async function getActiveRules(): Promise<FilenameRule[]> {
  const response = await request<FilenameRule[]>({
    path: "/api/filename-rules",
    method: "GET",
  });

  return response.data;
}

/**
 * 모든 룰 조회 (관리자용)
 */
export async function getAllRules(options?: {
  source?: string;
  isActive?: boolean;
}): Promise<FilenameRule[]> {
  const params = new URLSearchParams();
  if (options?.source) params.append("source", options.source);
  if (options?.isActive !== undefined)
    params.append("isActive", String(options.isActive));

  const response = await request<FilenameRule[]>({
    path: `/api/filename-rules/all?${params.toString()}`,
    method: "GET",
  });

  return response.data;
}

/**
 * 룰 생성
 */
export async function createRule(rule: FilenameRule): Promise<FilenameRule> {
  const response = await request<FilenameRule>({
    path: "/api/filename-rules",
    method: "POST",
    jsonBody: rule,
  });

  return response.data;
}

/**
 * 룰 업데이트
 */
export async function updateRule(
  ruleId: string,
  updates: Partial<FilenameRule>
): Promise<FilenameRule> {
  const response = await request<FilenameRule>({
    path: `/api/filename-rules/${ruleId}`,
    method: "PUT",
    jsonBody: updates,
  });

  return response.data;
}

/**
 * 룰 활성화/비활성화
 */
export async function toggleRuleActive(ruleId: string): Promise<FilenameRule> {
  const response = await request<FilenameRule>({
    path: `/api/filename-rules/${ruleId}/toggle`,
    method: "PATCH",
  });

  return response.data;
}

/**
 * 룰 정확도 업데이트
 */
export async function updateRuleAccuracy(
  ruleId: string
): Promise<FilenameRule> {
  const response = await request<FilenameRule>({
    path: `/api/filename-rules/${ruleId}/accuracy`,
    method: "PATCH",
  });

  return response.data;
}

/**
 * 룰 삭제
 */
export async function deleteRule(ruleId: string): Promise<void> {
  await request({
    path: `/api/filename-rules/${ruleId}`,
    method: "DELETE",
  });
}

/**
 * 룰 통계
 */
export async function getRuleStatistics(): Promise<{
  totalRules: number;
  activeRules: number;
  totalUsage: number;
  avgAccuracy: number;
}> {
  const response = await request<any>({
    path: "/api/filename-rules/stats",
    method: "GET",
  });

  return response.data;
}

/**
 * 여러 룰 일괄 생성/업데이트
 */
export async function batchUpsertRules(
  rules: FilenameRule[]
): Promise<FilenameRule[]> {
  const response = await request<FilenameRule[]>({
    path: "/api/filename-rules/batch",
    method: "POST",
    jsonBody: { rules },
  });

  return response.data;
}
