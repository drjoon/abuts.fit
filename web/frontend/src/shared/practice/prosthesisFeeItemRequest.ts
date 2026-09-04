// related files:
// - web/backend/controllers/practiceTransfers/prosthesisFeeItemRequest.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// change-log:
// - 2026-09-05: 치과 커스텀 보철 수가 요청 API 클라이언트.
// - 2026-09-05: 추가요청 — 관리자 승인 전 대기, approve/dismiss 헬퍼.
// - 2026-09-05: 대상 기공소 다중 선택(labs).
import { apiFetch } from "@/shared/api/apiClient";

export const ARCH_BULK_PROSTHESIS_PRESETS = [
  "전체틀니",
  "부분틀니",
  "랩어라운드",
] as const;

export type ArchBulkProsthesisPreset =
  (typeof ARCH_BULK_PROSTHESIS_PRESETS)[number];

export const isArchBulkProsthesisPreset = (name: string) =>
  ARCH_BULK_PROSTHESIS_PRESETS.some((preset) => preset === String(name || "").trim());

export type ProsthesisFeeItemRequestLabTarget = {
  labAnchorId: string;
  labName?: string | null;
};

export type CreateProsthesisFeeItemRequestParams = {
  /** 요청 내용(보철물 이름) */
  name: string;
  /** @deprecated labs 사용 */
  labAnchorId?: string | null;
  /** @deprecated labs 사용 */
  labName?: string | null;
  labs?: ProsthesisFeeItemRequestLabTarget[];
  source?:
    | "extra_request"
    | "select_all"
    | "prosthesis_type_settings"
    | "other";
};

/**
 * 추가요청(관리자 대시보드 pending). 승인 전까지 기공비 시드하지 않음.
 */
export async function createProsthesisFeeItemRequest(
  params: CreateProsthesisFeeItemRequestParams,
): Promise<boolean> {
  const name = String(params.name || "").trim();
  if (!name || isArchBulkProsthesisPreset(name)) return false;

  const labsFromParam = Array.isArray(params.labs)
    ? params.labs
        .map((row) => ({
          labAnchorId: String(row?.labAnchorId || "").trim(),
          labName: String(row?.labName || "").trim(),
        }))
        .filter((row) => Boolean(row.labAnchorId))
    : [];
  const legacyId = String(params.labAnchorId || "").trim();
  const labs =
    labsFromParam.length > 0
      ? labsFromParam
      : legacyId
        ? [
            {
              labAnchorId: legacyId,
              labName: String(params.labName || "").trim(),
            },
          ]
        : [];

  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: "/api/practice/transfers/prosthesis-fee-item-requests",
      method: "POST",
      jsonBody: {
        name,
        content: name,
        labs,
        ...(labs[0]
          ? {
              labAnchorId: labs[0].labAnchorId,
              ...(labs[0].labName ? { labName: labs[0].labName } : {}),
            }
          : {}),
        source: params.source || "extra_request",
      },
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export type ApproveProsthesisFeeItemRequestParams = {
  requestId: string;
  applyScope: "lab" | "all_labs";
  name?: string | null;
  labAnchorId?: string | null;
  labName?: string | null;
  labs?: ProsthesisFeeItemRequestLabTarget[];
};

export async function approveProsthesisFeeItemRequest(
  params: ApproveProsthesisFeeItemRequestParams,
): Promise<boolean> {
  const requestId = String(params.requestId || "").trim();
  if (!requestId) return false;
  const name = String(params.name || "").trim();
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/prosthesis-fee-item-requests/${encodeURIComponent(requestId)}/approve`,
      method: "POST",
      jsonBody: {
        applyScope: params.applyScope,
        ...(name ? { name } : {}),
        ...(Array.isArray(params.labs) && params.labs.length > 0
          ? { labs: params.labs }
          : {}),
        ...(params.labAnchorId
          ? { labAnchorId: String(params.labAnchorId) }
          : {}),
        ...(params.labName ? { labName: String(params.labName) } : {}),
      },
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function renameProsthesisFeeItemRequest(params: {
  requestId: string;
  name: string;
}): Promise<boolean> {
  const requestId = String(params.requestId || "").trim();
  const name = String(params.name || "").trim();
  if (!requestId || !name || isArchBulkProsthesisPreset(name)) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/prosthesis-fee-item-requests/${encodeURIComponent(requestId)}`,
      method: "PATCH",
      jsonBody: { name },
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function dismissProsthesisFeeItemRequest(
  requestId: string,
): Promise<boolean> {
  const id = String(requestId || "").trim();
  if (!id) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/prosthesis-fee-item-requests/${encodeURIComponent(id)}/dismiss`,
      method: "POST",
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function revertProsthesisFeeItemRequest(
  requestId: string,
): Promise<boolean> {
  const id = String(requestId || "").trim();
  if (!id) return false;
  try {
    const res = await apiFetch<{ success?: boolean }>({
      path: `/api/admin/prosthesis-fee-item-requests/${encodeURIComponent(id)}/revert`,
      method: "POST",
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}
