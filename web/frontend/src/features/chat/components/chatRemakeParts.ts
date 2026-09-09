// related files:
// - web/frontend/src/features/chat/components/ChatRemakePromptDialog.tsx
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/backend/utils/labFeeSchedule.js (buildRemakeToothWorksFromSelectedParts)

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

export function summarizeRemakeSelection(
  options: RemakePartOption[],
  selectedKeys: ReadonlySet<string>,
): string {
  const labels = options
    .filter((opt) => selectedKeys.has(opt.key))
    .map((opt) => opt.label);
  return labels.join(", ");
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
