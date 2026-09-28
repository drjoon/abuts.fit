// 작업 스캔 모델 정렬 메타데이터(production.workScanAlignment). 서버가 지금 작업 스캔에 맞는 기록만 내려준다.
// related files:
// - web/backend/utils/workScanAlignment.js
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

export type WorkScanAlignSource = "auto" | "ai-design";

export type WorkScanAlignment = {
  upper: boolean;
  lower: boolean;
  source: WorkScanAlignSource | null;
  alignedAt: string | null;
};

export function parseWorkScanAlignment(raw: unknown): WorkScanAlignment | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const source = String(row.source || "").trim();
  return {
    upper: Boolean(row.upper),
    lower: Boolean(row.lower),
    source: source === "auto" || source === "ai-design" ? source : null,
    alignedAt: typeof row.alignedAt === "string" ? row.alignedAt : null,
  };
}

/** 업로드 직후 자동 정렬 잡이 만든 작업 스캔. 기공소 초안이 있으면 초안이 이긴다. */
export function isMachineWorkScanAlignment(alignment: WorkScanAlignment | null | undefined) {
  return alignment?.source === "auto";
}
