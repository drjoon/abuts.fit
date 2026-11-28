// related files:
// - web/backend/controllers/labOralScanCases/labOralScanCase.controller.js
// - web/frontend/src/pages/requestor/new_request/components/LabOralScanEntryPanel.tsx
import { apiFetch } from "@/shared/api/apiClient";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

export type LabOralScanCaseFile = {
  originalName: string;
  mimetype?: string;
  size?: number;
  s3Key: string;
  patientName?: string;
  tooth?: string;
  scanRole?: "" | "upper" | "lower" | "bite" | "other";
  uploadedAt?: string | Date | null;
};

export type LabOralScanCaseDto = {
  caseId: string;
  clinicName: string;
  patientName: string;
  memo: string;
  toothWorks: ToothWorkSelection[];
  caseInfos?: Record<string, unknown> | null;
  files: LabOralScanCaseFile[];
  status: string;
  relatedRequestIds: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function createLabOralScanCase(
  token: string,
  body: {
    clinicName?: string;
    patientName: string;
    memo?: string;
    toothWorks: ToothWorkSelection[];
    files: LabOralScanCaseFile[];
    caseInfos?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; data?: LabOralScanCaseDto; message?: string }> {
  const res = await apiFetch<{ success?: boolean; data?: LabOralScanCaseDto; message?: string }>({
    path: "/api/lab/oral-scan-cases",
    method: "POST",
    token,
    jsonBody: body,
  });
  if (!res.ok) {
    return {
      ok: false,
      message: res.data?.message || "케이스 생성에 실패했습니다.",
    };
  }
  return { ok: true, data: res.data?.data };
}

export async function getLabOralScanCase(
  token: string,
  caseId: string,
): Promise<{ ok: boolean; data?: LabOralScanCaseDto; message?: string }> {
  const id = encodeURIComponent(String(caseId || "").trim());
  const res = await apiFetch<{ success?: boolean; data?: LabOralScanCaseDto; message?: string }>({
    path: `/api/lab/oral-scan-cases/${id}`,
    method: "GET",
    token,
  });
  if (!res.ok) {
    return {
      ok: false,
      message: res.data?.message || "케이스를 불러오지 못했습니다.",
    };
  }
  return { ok: true, data: res.data?.data };
}
