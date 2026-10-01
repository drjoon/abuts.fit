// 작업 스캔(상악·하악·바이트)을 한 모델로 묶는다. 역할 순서와 표시 이름.
// 날짜는 의뢰 파일 업로드 날. 자동 정렬로 같은 시각에 저장된 작업 스캔도 그 날로 나눈다.
// related files:
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
import { toKstYmd } from "@/shared/date/kst";
import {
  isAbutsWorkScanFileName,
  oralScanRoleLabel,
  resolveOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";

export type WorkScanModelFile = {
  s3Key?: string | null;
  fileName: string;
  scanRole?: string | null;
  uploadedAt?: string | null;
};

const ROLE_ORDER = ["upper", "lower", "bite"] as const;

function roleRank(file: WorkScanModelFile) {
  const role = resolveOralScanRole(file);
  const rank = ROLE_ORDER.indexOf(role as (typeof ROLE_ORDER)[number]);
  return rank < 0 ? ROLE_ORDER.length : rank;
}

function workScanNameIndex(fileName: string) {
  const match = String(fileName || "").match(/작업-(\d+)\.dcm$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 1 ? n - 1 : 0;
}

/**
 * 작업 스캔은 정렬 시각이 같다. 역할 순서대로 의뢰 스캔의 업로드 시각을 붙인다.
 * `상악-작업.dcm`은 그 역할의 첫 의뢰 파일, `상악-작업-2.dcm`은 다음 파일.
 */
export function withWorkScanSourceDates<T extends WorkScanModelFile>(
  workFiles: readonly T[],
  sourceFiles: readonly WorkScanModelFile[],
): T[] {
  const queues = new Map<string, string[]>();
  for (const source of sourceFiles) {
    if (isAbutsWorkScanFileName(source.fileName)) continue;
    const role = resolveOralScanRole(source);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const at = String(source.uploadedAt || "").trim();
    if (!at) continue;
    const list = queues.get(role) ?? [];
    list.push(at);
    queues.set(role, list);
  }
  if (queues.size === 0) return [...workFiles];
  const ordered = [...workFiles].sort(
    (a, b) =>
      roleRank(a) - roleRank(b) ||
      workScanNameIndex(a.fileName) - workScanNameIndex(b.fileName) ||
      a.fileName.localeCompare(b.fileName),
  );
  const assigned = new Map<string, string>();
  const cursor = new Map<string, number>();
  for (const file of ordered) {
    const role = resolveOralScanRole(file);
    if (role !== "upper" && role !== "lower" && role !== "bite") continue;
    const queue = queues.get(role) ?? [];
    const index = cursor.get(role) ?? 0;
    cursor.set(role, index + 1);
    const at = queue[index];
    const key = String(file.s3Key || "").trim();
    if (key && at) assigned.set(key, at);
  }
  return workFiles.map((file) => {
    const at = assigned.get(String(file.s3Key || "").trim());
    return at ? { ...file, uploadedAt: at } : file;
  });
}

function uploadedAtMs(file: WorkScanModelFile) {
  const at = Date.parse(String(file.uploadedAt || ""));
  return Number.isFinite(at) ? at : 0;
}

/** KST 날짜 키 `YYYY-MM-DD`. 시각이 없으면 빈 문자열. */
export function workScanDateKey(uploadedAt: string | null | undefined) {
  return toKstYmd(uploadedAt) || "";
}

/** `2026. 09. 22.` */
export function workScanDateLabel(dateKey: string) {
  const [year, month, day] = String(dateKey || "").split("-");
  if (!year || !month || !day) return "날짜 없음";
  return `${year}. ${month}. ${day}.`;
}

export type WorkScanModelPart<T extends WorkScanModelFile = WorkScanModelFile> = {
  key: string;
  file: T;
  role: string;
  label: string;
  dateKey: string;
  dateLabel: string;
  uploadedAtMs: number;
};

/**
 * 상악·하악·바이트 순, 같은 역할은 오래된 것부터.
 * 번호는 같은 날짜 안에서만 붙인다. 날짜가 달라도 `상악`으로 둔다.
 */
export function workScanModelParts<T extends WorkScanModelFile>(
  files: readonly T[],
): WorkScanModelPart<T>[] {
  const sorted = [...files]
    .filter((file) => String(file.s3Key || "").trim())
    .sort(
      (a, b) =>
        roleRank(a) - roleRank(b) ||
        uploadedAtMs(a) - uploadedAtMs(b) ||
        a.fileName.localeCompare(b.fileName),
    );
  const counts = new Map<string, number>();
  for (const file of sorted) {
    const role = resolveOralScanRole(file) || "other";
    const bucket = `${workScanDateKey(file.uploadedAt)}\0${role}`;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return sorted.map((file) => {
    const role = resolveOralScanRole(file) || "other";
    const dateKey = workScanDateKey(file.uploadedAt);
    const bucket = `${dateKey}\0${role}`;
    const nth = (seen.get(bucket) ?? 0) + 1;
    seen.set(bucket, nth);
    const base = oralScanRoleLabel(role);
    const label = (counts.get(bucket) ?? 0) > 1 ? `${base} ${nth}` : base;
    return {
      key: String(file.s3Key).trim(),
      file,
      role,
      label,
      dateKey,
      dateLabel: workScanDateLabel(dateKey),
      uploadedAtMs: uploadedAtMs(file),
    };
  });
}

export type WorkScanDateGroup<T extends WorkScanModelFile = WorkScanModelFile> = {
  key: string;
  label: string;
  uploadedAtMs: number;
  parts: WorkScanModelPart<T>[];
};

/** 최근 날짜가 앞. 같은 날 파일은 한 묶음. */
export function workScanDateGroups<T extends WorkScanModelFile>(
  parts: readonly WorkScanModelPart<T>[],
): WorkScanDateGroup<T>[] {
  const groups = new Map<string, WorkScanDateGroup<T>>();
  for (const part of parts) {
    const prev = groups.get(part.dateKey);
    if (!prev) {
      groups.set(part.dateKey, {
        key: part.dateKey,
        label: part.dateLabel,
        uploadedAtMs: part.uploadedAtMs,
        parts: [part],
      });
      continue;
    }
    prev.parts.push(part);
    if (part.uploadedAtMs > prev.uploadedAtMs) prev.uploadedAtMs = part.uploadedAtMs;
  }
  return [...groups.values()].sort(
    (a, b) => b.uploadedAtMs - a.uploadedAtMs || b.key.localeCompare(a.key),
  );
}

/**
 * 고른 날짜의 상악·하악만 켠다. 그 날짜의 바이트와 다른 날짜는 끈다.
 * 악이 없는 날짜는 그 날짜의 바이트를 켠다.
 */
export function hiddenKeysForWorkScanDate(
  parts: ReadonlyArray<{ key: string; role: string; dateKey: string }>,
  dateKey: string,
): Record<string, boolean> {
  const inDate = parts.filter((part) => part.dateKey === dateKey);
  const hasJaw = inDate.some((part) => part.role === "upper" || part.role === "lower");
  const hidden: Record<string, boolean> = {};
  for (const part of parts) {
    if (part.dateKey !== dateKey || (hasJaw && part.role === "bite")) {
      hidden[part.key] = true;
    }
  }
  return hidden;
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
