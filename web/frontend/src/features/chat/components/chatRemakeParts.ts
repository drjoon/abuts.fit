// related files:
// - web/frontend/src/features/chat/components/ChatRemakePromptDialog.tsx
// - web/frontend/src/features/chat/components/LabRemakeChargeDialog.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/backend/utils/labFeeSchedule.js (buildRemakeToothWorksFromSelectedParts)
// change-log:
// - 2026-09-11: 리메이크 요약 — 술식별 묶음 + 연속 치아 구간(17-15 브리지, 17,15 어벗).
// - 2026-09-11: 요약 정렬 — 보철(18→11→21→28→38→31→41→48) 먼저, 어벗 마지막.

import { isCustomAbutmentWork } from "@/shared/practice/labFeeSchedule";
import {
  isCustomAbutmentProsthesisType,
  toothWorkHasLabProsthesis,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export type RemakePartKind = "prosthesis" | "ca";

export type RemakePartOption = {
  key: string;
  index: number;
  kind: RemakePartKind;
  toothNumber: string;
  prosthesisType: string;
  label: string;
};

export type RemakeSelectedPart = {
  index: number;
  prosthesis: boolean;
  customAbutment: boolean;
};

export const remakePartKey = (index: number, kind: RemakePartKind) =>
  `${index}:${kind}` as const;

/** 리메이크 범위 카드용 — 보철 / CA 옵션 목록 */
export function listRemakePartOptions(
  toothWorks: Array<Partial<ToothWorkSelection> | Record<string, unknown> | null> | null | undefined,
): RemakePartOption[] {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const out: RemakePartOption[] = [];

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const toothNumber = String(
      (row as { toothNumber?: unknown }).toothNumber ||
        (row as { tooth?: unknown }).tooth ||
        "",
    ).trim();
    const prosthesisType = String(
      (row as { prosthesisType?: unknown }).prosthesisType ||
        (row as { type?: unknown }).type ||
        "",
    ).trim();
    if (!toothNumber && !prosthesisType) return;

    const asSelection = row as Partial<ToothWorkSelection>;
    const standaloneCa = isCustomAbutmentProsthesisType(prosthesisType);
    const hasCa = isCustomAbutmentWork(asSelection);
    const hasProsthesis = toothWorkHasLabProsthesis(asSelection);

    if (hasProsthesis) {
      out.push({
        key: remakePartKey(index, "prosthesis"),
        index,
        kind: "prosthesis",
        toothNumber: toothNumber || "—",
        prosthesisType: prosthesisType || "보철",
        label: `${toothNumber || "—"} · ${prosthesisType || "보철"}`,
      });
    }

    if (hasCa || standaloneCa) {
      out.push({
        key: remakePartKey(index, "ca"),
        index,
        kind: "ca",
        toothNumber: toothNumber || "—",
        prosthesisType: standaloneCa ? prosthesisType || "커스텀어벗" : "커스텀어벗",
        label: `${toothNumber || "—"} · 커스텀어벗`,
      });
    }
  });

  return out;
}

export function selectedKeysToRemakeParts(
  options: RemakePartOption[],
  selectedKeys: ReadonlySet<string>,
): RemakeSelectedPart[] {
  const byIndex = new Map<number, RemakeSelectedPart>();
  for (const opt of options) {
    if (!selectedKeys.has(opt.key)) continue;
    const prev = byIndex.get(opt.index) || {
      index: opt.index,
      prosthesis: false,
      customAbutment: false,
    };
    if (opt.kind === "prosthesis") prev.prosthesis = true;
    if (opt.kind === "ca") prev.customAbutment = true;
    byIndex.set(opt.index, prev);
  }
  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

/** 선택 키 → 견적/전송용 toothWorks 서브셋 */
export function buildToothWorksFromRemakeSelection(
  toothWorks: ToothWorkSelection[],
  selectedKeys: ReadonlySet<string>,
): ToothWorkSelection[] {
  const options = listRemakePartOptions(toothWorks);
  const parts = selectedKeysToRemakeParts(options, selectedKeys);
  const out: ToothWorkSelection[] = [];

  for (const part of parts) {
    const row = toothWorks[part.index];
    if (!row) continue;
    const prosthesisType = String(row.prosthesisType || "").trim();
    const standaloneCa = isCustomAbutmentProsthesisType(prosthesisType);
    const hasCa = isCustomAbutmentWork(row);

    if (part.prosthesis && part.customAbutment) {
      out.push(
        standaloneCa || hasCa
          ? { ...row, customAbutment: true }
          : { ...row, customAbutment: false },
      );
      continue;
    }

    if (part.prosthesis) {
      if (standaloneCa) continue;
      out.push({
        ...row,
        customAbutment: false,
      });
      continue;
    }

    if (part.customAbutment) {
      if (standaloneCa) {
        out.push({ ...row });
        continue;
      }
      if (!hasCa) continue;
      out.push({
        ...row,
        prosthesisType: "커스텀어벗",
        customAbutment: true,
        bridgeLinkedTeeth: [],
      });
    }
  }

  return out;
}

/** FDI 10→20→30→40 — 18→11→21→28→38→31→41→48 (labFeeSchedule.toToothDecadeSortNumber) */
const REMAKE_ARCH_TOOTH_ORDER = [
  "18",
  "17",
  "16",
  "15",
  "14",
  "13",
  "12",
  "11",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "38",
  "37",
  "36",
  "35",
  "34",
  "33",
  "32",
  "31",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
] as const;
const REMAKE_ARCH_TOOTH_INDEX = new Map(
  REMAKE_ARCH_TOOTH_ORDER.map((tooth, index) => [tooth, index] as const),
);

const remakeToothSortIndex = (tooth: string) =>
  REMAKE_ARCH_TOOTH_INDEX.get(String(tooth || "").trim()) ??
  Number.MAX_SAFE_INTEGER;

/** 전체가 한 연속 구간이면 17-15, 아니면 17,15 (부분 구간 혼용 금지) */
export function formatCompactToothNumbers(
  teeth: ReadonlyArray<string | null | undefined>,
): string {
  const sorted = [
    ...new Set(
      teeth
        .map((t) => String(t || "").trim())
        .filter((t) => /^[1-4][1-8]$/.test(t)),
    ),
  ].sort((a, b) => remakeToothSortIndex(a) - remakeToothSortIndex(b));
  if (sorted.length === 0) return "";

  const runs: string[][] = [];
  for (const tooth of sorted) {
    const prevRun = runs[runs.length - 1];
    const prev = prevRun?.[prevRun.length - 1];
    const prevIdx = prev != null ? REMAKE_ARCH_TOOTH_INDEX.get(prev) : undefined;
    const curIdx = REMAKE_ARCH_TOOTH_INDEX.get(tooth);
    if (
      prevRun &&
      prevIdx != null &&
      curIdx != null &&
      curIdx === prevIdx + 1
    ) {
      prevRun.push(tooth);
      continue;
    }
    runs.push([tooth]);
  }

  // 파닉 포함 브리지처럼 한 스팬만 있을 때만 `-`. 어벗 등 띄엄띄엄이면 전부 `,`.
  if (runs.length === 1 && runs[0].length >= 2) {
    const run = runs[0];
    return `${run[0]}-${run[run.length - 1]}`;
  }
  return sorted.join(",");
}

const remakeSummaryTypeLabel = (opt: RemakePartOption): string => {
  if (opt.kind === "ca") return "어벗";
  const type = String(opt.prosthesisType || "").trim();
  if (type === "커스텀어벗") return "어벗";
  return type || "보철";
};

/** 보철(치식 순) 먼저, 어벗 마지막 */
function formatRemakeSummaryFromGroups(
  teethByType: Map<string, string[]>,
): string {
  const types = Array.from(teethByType.keys());
  const prosthesisTypes = types.filter((type) => type !== "어벗");
  const hasAbutment = types.includes("어벗");

  const minToothIndex = (typeLabel: string) => {
    const teeth = teethByType.get(typeLabel) || [];
    if (teeth.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...teeth.map((tooth) => remakeToothSortIndex(tooth)));
  };

  prosthesisTypes.sort((a, b) => {
    const diff = minToothIndex(a) - minToothIndex(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b, "ko");
  });

  const ordered = hasAbutment
    ? [...prosthesisTypes, "어벗"]
    : prosthesisTypes;

  return ordered
    .map((typeLabel) => {
      const teethLabel = formatCompactToothNumbers(
        teethByType.get(typeLabel) || [],
      );
      return teethLabel ? `${teethLabel} ${typeLabel}` : typeLabel;
    })
    .filter(Boolean)
    .join(", ");
}

const expandRemakeToothToken = (raw: string): string[] => {
  const token = String(raw || "").trim();
  if (!token) return [];
  const range = token.match(/^([1-4][1-8])-([1-4][1-8])$/);
  if (range) {
    const startIdx = REMAKE_ARCH_TOOTH_INDEX.get(range[1]);
    const endIdx = REMAKE_ARCH_TOOTH_INDEX.get(range[2]);
    if (
      startIdx == null ||
      endIdx == null ||
      endIdx < startIdx
    ) {
      return [range[1], range[2]].filter(Boolean);
    }
    return REMAKE_ARCH_TOOTH_ORDER.slice(startIdx, endIdx + 1).map(String);
  }
  if (/^[1-4][1-8]$/.test(token)) return [token];
  return [];
};

const parseRemakeToothList = (raw: string): string[] =>
  String(raw || "")
    .split(",")
    .flatMap((part) => expandRemakeToothToken(part));

/** 선택 요약 — 예: `17-15 브리지, 14 크라운, 17,15,14 어벗` */
export function summarizeRemakeSelection(
  options: RemakePartOption[],
  selectedKeys: ReadonlySet<string>,
): string {
  const teethByType = new Map<string, string[]>();

  for (const opt of options) {
    if (!selectedKeys.has(opt.key)) continue;
    const typeLabel = remakeSummaryTypeLabel(opt);
    if (!teethByType.has(typeLabel)) teethByType.set(typeLabel, []);
    const tooth = String(opt.toothNumber || "").trim();
    if (tooth && tooth !== "—") teethByType.get(typeLabel)!.push(tooth);
  }

  return formatRemakeSummaryFromGroups(teethByType);
}

/**
 * 레거시 `17 · 브리지, …` 및 압축 `14 크라운, 17-15 브리지, …` →
 * 보철(치식 순) → 어벗 순으로 재정렬.
 */
export function compactRemakeSummaryLabel(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";

  const legacyTokens = text
    .split(/\s*,\s*/)
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^#?([1-4][1-8])\s*[·.]\s*(.+)$/);
      if (!m) return null;
      let type = String(m[2] || "").trim();
      if (type === "커스텀어벗") type = "어벗";
      return { tooth: m[1], type };
    });

  if (
    legacyTokens.length > 0 &&
    legacyTokens.every((token) => token != null)
  ) {
    const teethByType = new Map<string, string[]>();
    for (const token of legacyTokens) {
      if (!token) continue;
      if (!teethByType.has(token.type)) teethByType.set(token.type, []);
      teethByType.get(token.type)!.push(token.tooth);
    }
    return formatRemakeSummaryFromGroups(teethByType);
  }

  const compactParts = text
    .split(/,\s+/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const compactTokens = compactParts.map((part) => {
    const m =
      part.match(/^([0-9][0-9,\-]*)\s+(.+)$/) ||
      part.match(/^(.+?)\s*[·.]\s*(.+)$/);
    if (!m) return null;
    const teeth = parseRemakeToothList(String(m[1] || "").trim());
    let type = String(m[2] || "").trim();
    if (type === "커스텀어벗") type = "어벗";
    if (teeth.length === 0 || !type) return null;
    return { teeth, type };
  });

  if (
    compactTokens.length > 0 &&
    compactTokens.every((token) => token != null)
  ) {
    const teethByType = new Map<string, string[]>();
    for (const token of compactTokens) {
      if (!token) continue;
      if (!teethByType.has(token.type)) teethByType.set(token.type, []);
      teethByType.get(token.type)!.push(...token.teeth);
    }
    return formatRemakeSummaryFromGroups(teethByType);
  }

  return text;
}

/** remakeCharges.selectedParts → charged part keys (`index:prosthesis` | `index:ca`) */
export function collectChargedRemakePartKeys(
  remakeCharges:
    | Array<{ selectedParts?: unknown } | null | undefined>
    | null
    | undefined,
): Set<string> {
  const out = new Set<string>();
  const rows = Array.isArray(remakeCharges) ? remakeCharges : [];
  for (const row of rows) {
    const parts = Array.isArray(row?.selectedParts) ? row.selectedParts : [];
    for (const raw of parts) {
      if (!raw || typeof raw !== "object") continue;
      const part = raw as {
        index?: unknown;
        prosthesis?: unknown;
        customAbutment?: unknown;
        includeCustomAbutment?: unknown;
        ca?: unknown;
      };
      const index = Math.trunc(Number(part.index));
      if (!Number.isFinite(index) || index < 0) continue;
      if (part.prosthesis === true) out.add(remakePartKey(index, "prosthesis"));
      const wantCa = Boolean(
        part.customAbutment === true ||
          part.includeCustomAbutment === true ||
          part.ca === true,
      );
      if (wantCa) out.add(remakePartKey(index, "ca"));
    }
  }
  return out;
}

export function remakeChargeSourceLabel(source?: string | null): string {
  const s = String(source || "").trim();
  if (s === "ca_reupload") return "CA 재업로드";
  if (s === "lab_charge") return "기공소";
  return s || "리메이크";
}
