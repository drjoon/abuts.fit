// 기공소 작업완료 — 보철 디자인 파일이 슬롯마다 있어야 한다.
// 크라운·인레이는 치아당 1파일, 연결 브리지·임시치아·유지장치는 스팬당 1파일.
import {
  isMissingToothProsthesisType,
  isRemovableTempProsthesisType,
  isRetainerProsthesisType,
} from "./labFeeSchedule.js";
import { toothWorkHasLabProsthesis } from "./practiceTransferLabShipping.js";

const toothKey = (value) => {
  const n = Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 999;
};

const sortTeeth = (teeth) =>
  [...new Set(teeth.map((t) => String(t || "").trim()).filter(Boolean))].sort(
    (a, b) => toothKey(a) - toothKey(b),
  );

const isBridgeLike = (type) => {
  const raw = String(type || "").trim();
  return (
    raw === "브리지" ||
    raw === "Pontic" ||
    isRetainerProsthesisType(raw) ||
    isMissingToothProsthesisType(raw)
  );
};

const canGroupAsBridgeSpan = (rows, type, tooth) => {
  const raw = String(type || "").trim();
  if (!isBridgeLike(raw) && !isRemovableTempProsthesisType(raw)) return false;
  if (isMissingToothProsthesisType(raw)) return false;
  return collectLinks(rows, tooth).length > 0;
};

function collectLinks(rows, toothNumber) {
  const tooth = String(toothNumber || "").trim();
  const byTooth = new Map(
    rows.map((row) => [String(row?.toothNumber || "").trim(), row]),
  );
  const links = new Set();
  const self = byTooth.get(tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth)
    ? self.bridgeLinkedTeeth
    : []) {
    const other = String(linked || "").trim();
    if (other && byTooth.has(other)) links.add(other);
  }
  for (const [other, row] of byTooth) {
    if (!other || other === tooth) continue;
    const otherLinks = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) {
      links.add(other);
    }
  }
  return [...links];
}

/** @returns {{ id: string, tooth: string, teeth: string[], prosthesisType: string, label: string }[]} */
export function listProstheticUploadSlots(toothWorks) {
  const rows = (Array.isArray(toothWorks) ? toothWorks : []).filter((row) =>
    toothWorkHasLabProsthesis(row),
  );
  if (rows.length === 0) return [];
  const remaining = new Set(
    rows.map((row) => String(row.toothNumber || "").trim()).filter(Boolean),
  );
  const byTooth = new Map(
    rows.map((row) => [String(row.toothNumber || "").trim(), row]),
  );
  const slots = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value;
    const startType = String(byTooth.get(start)?.prosthesisType || "").trim();
    if (!canGroupAsBridgeSpan(rows, startType, start)) {
      remaining.delete(start);
      slots.push({
        id: `single:${start}`,
        tooth: start,
        teeth: [start],
        prosthesisType: startType || "보철",
        label: `${start} ${startType || "보철"}`,
      });
      continue;
    }

    const stack = [start];
    const component = [];
    remaining.delete(start);
    while (stack.length > 0) {
      const cur = stack.pop();
      component.push(cur);
      for (const linked of collectLinks(rows, cur)) {
        if (!remaining.has(linked)) continue;
        const linkedType = String(byTooth.get(linked)?.prosthesisType || "").trim();
        if (
          !isBridgeLike(linkedType) &&
          !isRemovableTempProsthesisType(linkedType)
        ) {
          continue;
        }
        remaining.delete(linked);
        stack.push(linked);
      }
    }
    const teeth = sortTeeth(component);
    const primary = teeth[0] || start;
    const labelType = teeth.some(
      (t) => String(byTooth.get(t)?.prosthesisType || "").trim() === "브리지",
    )
      ? "브리지"
      : teeth.some((t) =>
            isRemovableTempProsthesisType(
              String(byTooth.get(t)?.prosthesisType || ""),
            ),
          )
        ? "임시치아"
        : String(byTooth.get(primary)?.prosthesisType || startType || "브리지").trim();
    const spanLabel =
      teeth.length > 1 ? `${teeth[0]}-${teeth[teeth.length - 1]}` : primary;
    slots.push({
      id: `bridge:${teeth.join("-")}`,
      tooth: primary,
      teeth,
      prosthesisType: labelType,
      label: `${spanLabel} ${labelType}`,
    });
  }

  return slots.sort((a, b) => toothKey(a.tooth) - toothKey(b.tooth));
}

export function listPendingProstheticSlots(toothWorks, resultFiles) {
  const slots = listProstheticUploadSlots(toothWorks);
  if (slots.length === 0) return [];
  const files = Array.isArray(resultFiles) ? resultFiles : [];
  const used = new Set();
  let unassigned = 0;
  for (const file of files) {
    const tooth = String(file?.tooth || "").trim();
    if (!tooth) {
      unassigned += 1;
      continue;
    }
    const matched = slots.find(
      (slot) =>
        !used.has(slot.id) &&
        (slot.tooth === tooth || slot.teeth.includes(tooth)),
    );
    if (matched) used.add(matched.id);
    else unassigned += 1;
  }
  const pending = slots.filter((slot) => !used.has(slot.id));
  if (unassigned <= 0) return pending;
  return pending.slice(unassigned);
}

export function attachProsthesisTypeToResultFiles(toothWorks, resultFiles) {
  const slots = listProstheticUploadSlots(toothWorks);
  return (Array.isArray(resultFiles) ? resultFiles : []).map((file) => {
    const existing = String(file?.prosthesisType || "").trim();
    if (existing) return file;
    const tooth = String(file?.tooth || "").trim();
    const slot = slots.find(
      (row) => row.tooth === tooth || row.teeth.includes(tooth),
    );
    return {
      ...file,
      prosthesisType: slot?.prosthesisType || "",
    };
  });
}
