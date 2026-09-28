// 작업 스캔(상악·하악·바이트)을 한 모델로 묶는다. 역할 순서와 표시 이름.
// related files:
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import {
  oralScanRoleLabel,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";

export type WorkScanModelFile = {
  s3Key?: string | null;
  fileName: string;
  scanRole?: string | null;
};

const ROLE_ORDER = ["upper", "lower", "bite"] as const;

function roleRank(file: WorkScanModelFile) {
  const role = resolveOralScanRole(file);
  const rank = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  return rank < 0 ? ROLE_ORDER.length : rank;
}

/** 상악·하악·바이트 순. 같은 역할이 둘이면 뒤에 번호를 붙인다. */
export function workScanModelParts(files: readonly WorkScanModelFile[]) {
  const sorted = [...files]
    .filter((file) => String(file.s3Key || "").trim())
    .sort((a, b) => roleRank(a) - roleRank(b) || a.fileName.localeCompare(b.fileName));
  const counts = new Map<string, number>();
  for (const file of sorted) {
    const role = resolveOralScanRole(file) || "other";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return sorted.map((file) => {
    const role = resolveOralScanRole(file) || "other";
    const nth = (seen.get(role) ?? 0) + 1;
    seen.set(role, nth);
    const base = oralScanRoleLabel(role);
    return {
      key: String(file.s3Key).trim(),
      file,
      role,
      label: (counts.get(role) ?? 0) > 1 ? `${base} ${nth}` : base,
    };
  });
}

/** 타일 이름. 역할이 같은 파일은 한 번만 쓴다. `상악·하악·바이트` */
export function workScanModelTitle(files: readonly WorkScanModelFile[]) {
  const labels: string[] = [];
  for (const part of workScanModelParts(files)) {
    const label = oralScanRoleLabel(resolveOralScanRole(part.file) || "other");
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join("·");
}
