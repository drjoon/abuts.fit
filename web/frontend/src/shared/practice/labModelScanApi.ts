// related files:
// - web/backend/controllers/practiceTransfers/labModelScanTransfer.controller.js
// - docs/intent/lab-oral-scan-opens-practice-transfer.md
import { apiFetch } from "@/shared/api/apiClient";

const LOCAL_LABELS_KEY = "abutsfit:lab-client-labels:v1";

export const LAB_MODEL_SCAN_INTAKE_SOURCE = "lab_model_scan";
export const LAB_MODEL_SCAN_HREF = "/dashboard/model-scan-transfers";

export type LabModelScanCreateBody = {
  clinicLabel: string;
  patientName: string;
  arrivalYmd?: string;
  orderYmd?: string;
  transferMemo?: string;
  toothWorks: unknown[];
  files: Array<{
    patientName?: string;
    tooth?: string;
    scanRole?: string;
    scanRoleSetBy?: string;
    originalName: string;
    mimetype?: string;
    size?: number;
    s3Key: string;
  }>;
  rushProcessing?: boolean;
  anodizingEnabled?: boolean;
  crownFabrication?: "scan" | "impression" | null;
  isRemake?: boolean;
};

function readLocalLabels(): string[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_LABELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 40);
  } catch {
    return [];
  }
}

function writeLocalLabels(labels: string[]) {
  try {
    window.localStorage.setItem(
      LOCAL_LABELS_KEY,
      JSON.stringify(labels.slice(0, 40)),
    );
  } catch {
    // ignore
  }
}

export function rememberLocalLabClientLabel(label: string) {
  const next = String(label || "").trim();
  if (!next) return;
  const prev = readLocalLabels().filter((x) => x !== next);
  writeLocalLabels([next, ...prev]);
}

export function mergeLabClientLabels(
  server: string[],
  query = "",
): string[] {
  const q = String(query || "").trim().toLowerCase();
  const local = readLocalLabels();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...local, ...server]) {
    const label = String(raw || "").trim();
    if (!label || seen.has(label)) continue;
    if (q && !label.toLowerCase().includes(q)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= 40) break;
  }
  return out;
}

export async function fetchLabClientLabels(
  token: string,
  q = "",
): Promise<string[]> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const res = await apiFetch<{
    success?: boolean;
    data?: { labels?: string[] };
  }>({
    path: `/api/practice/transfers/lab-client-labels${
      qs.toString() ? `?${qs}` : ""
    }`,
    method: "GET",
    token,
  });
  const server = Array.isArray(res.data?.data?.labels)
    ? res.data.data.labels
    : [];
  return mergeLabClientLabels(server, q);
}

export async function createLabModelScanTransfer(
  token: string,
  body: LabModelScanCreateBody,
): Promise<{ ok: boolean; data?: { _id?: string; transferId?: string }; message?: string }> {
  const res = await apiFetch<{
    success?: boolean;
    data?: { _id?: string; transferId?: string };
    message?: string;
  }>({
    path: "/api/practice/transfers/lab-model-scan",
    method: "POST",
    token,
    jsonBody: body,
  });
  if (!res.ok || !res.data?.success) {
    return {
      ok: false,
      message:
        String(res.data?.message || "").trim() ||
        "모델스캔 의뢰 생성에 실패했습니다.",
    };
  }
  rememberLocalLabClientLabel(body.clinicLabel);
  return { ok: true, data: res.data.data };
}

export function withLabModelScanIntakeSource(
  qs: URLSearchParams | string,
): string {
  const params =
    typeof qs === "string" ? new URLSearchParams(qs) : new URLSearchParams(qs);
  params.set("intakeSource", LAB_MODEL_SCAN_INTAKE_SOURCE);
  return params.toString();
}
