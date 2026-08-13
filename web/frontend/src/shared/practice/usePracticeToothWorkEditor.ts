import { useMemo } from "react";

// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx

export type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import {
  emptyToothWorkCustomSpecs,
  isBridgeLikeProsthesisType,
  isMissingToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
  toToothMemoSortNumber,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export {
  isBridgeLikeProsthesisType,
  isMissingToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
};

/** 단독 치아 형태 토글 라벨(크라운↔인레이↔어벗 디자인) */
export const ABUTMENT_DESIGN_PROSTHESIS_TYPE = "어벗 디자인";

export const STANDALONE_PROSTHESIS_TYPES = [
  "크라운",
  "인레이",
  ABUTMENT_DESIGN_PROSTHESIS_TYPE,
] as const;
export const LINKED_PROSTHESIS_TYPES = ["브리지", "Pontic", NO_WORK_PROSTHESIS_TYPE] as const;

export const isAbutmentDesignProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return /^(?:커스텀)?어벗디자인$/i.test(compact);
};

export const isStandaloneProsthesisType = (prosthesisType: string) =>
  prosthesisType === "크라운" ||
  prosthesisType === "인레이" ||
  isAbutmentDesignProsthesisType(prosthesisType);

export const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) =>
  prosthesisType === "크라운" ||
  prosthesisType === "브리지" ||
  isAbutmentDesignProsthesisType(prosthesisType);

export const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];

  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);

  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }

  return Array.from(new Set(out));
};

/** 치열 순(18→11→21→28 / 48→41→31→38) 기준 — 현재 치아의 좌·우 인접치 */
export const splitAdjacentTeethLeftRight = (toothNumber: string) => {
  const current = String(toothNumber || "").trim();
  const adjacent = getAdjacentTeeth(current);
  if (!/^[1-4][1-8]$/.test(current)) {
    return { left: null as string | null, right: null as string | null };
  }
  const currentSort = toToothMemoSortNumber(current);
  let left: string | null = null;
  let right: string | null = null;
  for (const adj of adjacent) {
    const sort = toToothMemoSortNumber(adj);
    if (sort < currentSort) {
      if (left == null || sort > toToothMemoSortNumber(left)) left = adj;
    } else if (sort > currentSort) {
      if (right == null || sort < toToothMemoSortNumber(right)) right = adj;
    }
  }
  return { left, right };
};

/** @deprecated 좌·우 배치로 대체 — splitAdjacentTeethLeftRight 사용 */
export const splitAdjacentTeethAboveBelow = (toothNumber: string) => {
  const { left, right } = splitAdjacentTeethLeftRight(toothNumber);
  return {
    above: left ? [left] : ([] as string[]),
    below: right ? [right] : ([] as string[]),
  };
};

/** 본인 연결 + 인접 치아가 이쪽을 가리키는 연결을 합친다(한쪽만 있어도 브리지로 본다). */
export const collectAdjacentBridgeLinks = (
  rows: ToothWorkSelection[],
  toothNumber: string,
): string[] => {
  const tooth = String(toothNumber || "").trim();
  const adjacent = new Set(getAdjacentTeeth(tooth));
  const links = new Set<string>();
  const self = rows.find((row) => String(row.toothNumber || "").trim() === tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth) ? self.bridgeLinkedTeeth : []) {
    const other = String(linked || "").trim();
    if (adjacent.has(other)) links.add(other);
  }
  for (const row of rows) {
    const other = String(row.toothNumber || "").trim();
    if (!other || other === tooth || !adjacent.has(other)) continue;
    const otherLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) links.add(other);
  }
  return [...links];
};

export const getProsthesisTypesForLinkState = (isLinked: boolean, catalog: string[]) => {
  const allowed = new Set<string>(
    isLinked ? LINKED_PROSTHESIS_TYPES : STANDALONE_PROSTHESIS_TYPES,
  );
  const next = catalog.filter((type) => {
    if (allowed.has(type)) return true;
    if (!isLinked && isAbutmentDesignProsthesisType(type)) return true;
    if (isLinked && /^pontic$/i.test(type)) return true;
    if (isLinked && isMissingToothProsthesisType(type)) return true;
    return false;
  });
  if (isLinked && !next.some((type) => type === "브리지")) next.unshift("브리지");
  if (isLinked && !next.some((type) => /^pontic$/i.test(type))) next.push("Pontic");
  if (isLinked && !next.some((type) => isMissingToothProsthesisType(type))) {
    next.push(NO_WORK_PROSTHESIS_TYPE);
  }
  return next;
};

export const resolveProsthesisTypeForLinkState = (
  currentType: string,
  isLinked: boolean,
  catalog: string[],
) => {
  const options = getProsthesisTypesForLinkState(isLinked, catalog);
  const current = String(currentType || "").trim();
  if (current && options.some((type) => type === current)) return current;
  if (isLinked && isMissingToothProsthesisType(current)) {
    return (
      options.find((type) => isMissingToothProsthesisType(type)) || NO_WORK_PROSTHESIS_TYPE
    );
  }
  if (isLinked && /^pontic$/i.test(current)) {
    return options.find((type) => /^pontic$/i.test(type)) || "Pontic";
  }
  if (isLinked) {
    return options.find((type) => type === "브리지") || options[0] || "브리지";
  }
  return options.find((type) => type === "크라운") || options[0] || "크라운";
};

/** 형태만 변경. 커스텀어벗·임플란트/스캔바디는 유지(인레이 등 UI 비표시 타입 포함 — 크라운/어벗 디자인으로 돌아오면 그대로) */
export const applyProsthesisTypeToRow = (
  row: ToothWorkSelection,
  prosthesisType: string,
): ToothWorkSelection => ({
  ...row,
  prosthesisType,
});

/** 인접 치아 체크 토글: 양방향 연결 + 연결 여부에 맞게 형태(브리지/Pontic/작업X vs 크라운/인레이/어벗 디자인) 동기화 */
export const toggleAdjacentBridgeLink = (
  rows: ToothWorkSelection[],
  originalIndex: number,
  adjTooth: string,
  checked: boolean,
  catalog: string[],
): ToothWorkSelection[] => {
  const next = [...rows];
  const current = next[originalIndex];
  if (!current) return rows;

  const currentTooth = String(current.toothNumber || "").trim();
  const currentLinks = Array.isArray(current.bridgeLinkedTeeth)
    ? current.bridgeLinkedTeeth
    : [];
  const newLinks = checked
    ? Array.from(new Set([...currentLinks, adjTooth]))
    : currentLinks.filter((v) => v !== adjTooth);
  const currentIsLinked = newLinks.length > 0;
  const currentType = resolveProsthesisTypeForLinkState(
    current.prosthesisType,
    currentIsLinked,
    catalog,
  );

  next[originalIndex] = {
    ...applyProsthesisTypeToRow(current, currentType),
    bridgeLinkedTeeth: currentIsLinked ? newLinks : [],
  };

  const pairedIdx = next.findIndex(
    (row, idx) => idx !== originalIndex && String(row.toothNumber || "").trim() === adjTooth,
  );

  if (checked) {
    if (pairedIdx >= 0) {
      const paired = next[pairedIdx];
      const pairedLinks = Array.isArray(paired.bridgeLinkedTeeth)
        ? paired.bridgeLinkedTeeth
        : [];
      const nextPairedLinks = currentTooth
        ? Array.from(new Set([...pairedLinks, currentTooth]))
        : pairedLinks;
      const pairedType = resolveProsthesisTypeForLinkState(
        paired.prosthesisType,
        nextPairedLinks.length > 0,
        catalog,
      );
      next[pairedIdx] = {
        ...applyProsthesisTypeToRow(paired, pairedType),
        bridgeLinkedTeeth: nextPairedLinks,
      };
    } else {
      next.push({
        toothNumber: adjTooth,
        prosthesisType: resolveProsthesisTypeForLinkState("", true, catalog),
        customAbutment: false,
        bridgeLinkedTeeth: currentTooth ? [currentTooth] : [],
        ...emptyToothWorkCustomSpecs(),
      });
    }
  } else if (pairedIdx >= 0 && currentTooth) {
    const paired = next[pairedIdx];
    const pairedLinks = (
      Array.isArray(paired.bridgeLinkedTeeth) ? paired.bridgeLinkedTeeth : []
    ).filter((v) => v !== currentTooth);
    const pairedType = resolveProsthesisTypeForLinkState(
      paired.prosthesisType,
      pairedLinks.length > 0,
      catalog,
    );
    next[pairedIdx] = {
      ...applyProsthesisTypeToRow(paired, pairedType),
      bridgeLinkedTeeth: pairedLinks,
    };
  }

  return next;
};

const toToothSortNumber = (toothNumber: string) => toToothMemoSortNumber(toothNumber);

export const useOrderedToothWorkRows = (toothWorks: ToothWorkSelection[]) => {
  return useMemo(() => {
    if (toothWorks.length === 0)
      return [] as Array<{
        row: ToothWorkSelection;
        originalIndex: number;
        linkPrev: boolean;
        linkNext: boolean;
      }>;

    const rows = toothWorks.map((row, idx) => ({ row, idx }));
    const toothIndices = rows
      .filter(({ row }) => /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()))
      .map(({ idx }) => idx);

    const byTooth = new Map<string, number>();
    for (const { row, idx } of rows) {
      const tooth = String(row.toothNumber || "").trim();
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      if (!byTooth.has(tooth)) byTooth.set(tooth, idx);
    }

    const toothSet = new Set(toothIndices);
    const adjacency = new Map<number, Set<number>>();
    toothIndices.forEach((idx) => adjacency.set(idx, new Set<number>()));

    for (const idx of toothIndices) {
      const row = rows[idx].row;
      const links = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      for (const linked of links) {
        const linkedIdx = byTooth.get(String(linked || "").trim());
        if (linkedIdx == null) continue;
        if (!toothSet.has(linkedIdx)) continue;
        adjacency.get(idx)?.add(linkedIdx);
        adjacency.get(linkedIdx)?.add(idx);
      }
    }

    const componentKeyByIdx = new Map<number, string>();
    const visited = new Set<number>();

    for (const seed of toothIndices) {
      if (visited.has(seed)) continue;
      const stack = [seed];
      const component: number[] = [];
      visited.add(seed);

      while (stack.length > 0) {
        const cur = stack.pop() as number;
        component.push(cur);
        const nexts = adjacency.get(cur) || new Set<number>();
        for (const n of nexts) {
          if (visited.has(n)) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      component.sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const key = component.map((idx) => rows[idx].row.toothNumber).join("-");
      component.forEach((idx) => componentKeyByIdx.set(idx, key));
    }

    const emitted = new Set<number>();
    const orderedIndices: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      if (emitted.has(i)) continue;
      const key = componentKeyByIdx.get(i);
      if (!key) {
        orderedIndices.push(i);
        emitted.add(i);
        continue;
      }

      const componentIndices = toothIndices.filter((idx) => componentKeyByIdx.get(idx) === key);
      const componentSet = new Set(componentIndices);
      const sortedByTooth = [...componentIndices].sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const endpoints = sortedByTooth.filter((idx) => {
        const degree = [...(adjacency.get(idx) || new Set<number>())].filter((n) => componentSet.has(n))
          .length;
        return degree <= 1;
      });
      const start = endpoints[0] ?? sortedByTooth[0];

      const orderedComponent: number[] = [];
      const componentVisited = new Set<number>();
      let current = start;
      let prev = -1;

      while (current >= 0 && !componentVisited.has(current)) {
        orderedComponent.push(current);
        componentVisited.add(current);

        const nextCandidates = [...(adjacency.get(current) || new Set<number>())]
          .filter((n) => componentSet.has(n) && !componentVisited.has(n))
          .sort(
            (a, b) =>
              toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
          );

        if (nextCandidates.length === 0) break;
        const preferred = nextCandidates.find((n) => n !== prev);
        const nextIdx = preferred ?? nextCandidates[0];
        prev = current;
        current = nextIdx;
      }

      if (orderedComponent.length < componentIndices.length) {
        const remains = sortedByTooth.filter((idx) => !componentVisited.has(idx));
        orderedComponent.push(...remains);
      }

      orderedComponent.forEach((idx) => {
        if (emitted.has(idx)) return;
        orderedIndices.push(idx);
        emitted.add(idx);
      });
    }

    return orderedIndices.map((originalIndex, orderedIndex, arr) => {
      const row = rows[originalIndex].row;
      const key = componentKeyByIdx.get(originalIndex) || "";
      const prevIdx = orderedIndex > 0 ? arr[orderedIndex - 1] : -1;
      const nextIdx = orderedIndex < arr.length - 1 ? arr[orderedIndex + 1] : -1;
      const linkPrev =
        key.length > 0 && prevIdx >= 0 && componentKeyByIdx.get(prevIdx) === key;
      const linkNext =
        key.length > 0 && nextIdx >= 0 && componentKeyByIdx.get(nextIdx) === key;

      return { row, originalIndex, linkPrev, linkNext };
    });
  }, [toothWorks]);
};
