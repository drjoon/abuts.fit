import { useMemo } from "react";

// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - 2026-08-13: 신규 커스텀어벗은 계정 기본 모드(디자인+생산). 기존 커스텀 치아 미설정은 생산만 유지.
// - 2026-08-13: 형태 클릭 순환은 커스텀 플래그·규격을 유지. 어벗 체크 해제만 지운다.
// - 2026-08-13: 연결 형태 토글에 유지장치·임시치아 추가(단독 토글도 유지).
// - 2026-08-13: 유지장치=브리지 계열(2치+). 임시치아=단독 1치부터 연결 n치.
// - 2026-08-13: 연결 스팬의 유지장치·임시치아는 한쪽 변경 시 전체 동일 형태.
// - 2026-08-13: 유지장치·임시치아 스팬 전환 시 커스텀어벗 플래그·규격은 유지. 브리지로 되돌리면 복구.
// - 2026-08-13: 단독 순환(인레이↔크라운↔커스텀어벗↔임시치아)도 커스텀 플래그·규격을 유지.
// - 2026-08-13: 클릭한 치아가 Pontic·작업X를 거쳐도 커스텀을 지우지 않는다.

export type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import {
  ABUTMENT_PRODUCT_MODE,
  CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
  emptyToothWorkCustomSpecs,
  isAbutmentDesignProsthesisType,
  isAbutmentProductMode,
  isBridgeLikeProsthesisType,
  isCustomAbutmentProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  isLinkableProsthesisType,
  isMissingToothProsthesisType,
  isRetainerProsthesisType,
  isTemporaryToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
  normalizeAccountAbutmentProductMode,
  toToothMemoSortNumber,
  type AbutmentProductMode,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";

export {
  CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
  isAbutmentDesignProsthesisType,
  isBridgeLikeProsthesisType,
  isCustomAbutmentProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  isLinkableProsthesisType,
  isMissingToothProsthesisType,
  isRetainerProsthesisType,
  isTemporaryToothProsthesisType,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
};

/** @deprecated 단독 커스텀어벗 형태. CUSTOM_ABUTMENT_PROSTHESIS_TYPE 사용 */
export const ABUTMENT_DESIGN_PROSTHESIS_TYPE = CUSTOM_ABUTMENT_PROSTHESIS_TYPE;

/** 단독 치아 형태 토글 라벨(인레이↔크라운↔커스텀어벗↔임시치아). 유지장치는 브리지 계열(2치+) */
export const STANDALONE_PROSTHESIS_TYPES = [
  "인레이",
  "크라운",
  CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
  "임시치아",
] as const;
export const LINKED_PROSTHESIS_TYPES = [
  "브리지",
  "Pontic",
  NO_WORK_PROSTHESIS_TYPE,
  "유지장치",
  "임시치아",
] as const;

export const isStandaloneProsthesisType = (prosthesisType: string) =>
  prosthesisType === "인레이" ||
  prosthesisType === "크라운" ||
  isTemporaryToothProsthesisType(prosthesisType) ||
  isCustomAbutmentProsthesisType(prosthesisType);

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
  const next = catalog
    .map((type) =>
      type === "가철성 임시치아" || type.replace(/\s+/g, "") === "가철성임시치아"
        ? "임시치아"
        : type,
    )
    .filter((type) => {
      if (allowed.has(type)) return true;
      if (!isLinked && isCustomAbutmentProsthesisType(type)) return true;
      if (!isLinked && isTemporaryToothProsthesisType(type)) return true;
      if (isLinked && /^pontic$/i.test(type)) return true;
      if (isLinked && isMissingToothProsthesisType(type)) return true;
      if (isLinked && isRetainerProsthesisType(type)) return true;
      if (isLinked && isTemporaryToothProsthesisType(type)) return true;
      return false;
    });
  if (!isLinked && !next.some((type) => isCustomAbutmentProsthesisType(type))) {
    next.push(CUSTOM_ABUTMENT_PROSTHESIS_TYPE);
  }
  if (!isLinked && !next.some((type) => isTemporaryToothProsthesisType(type))) {
    next.push("임시치아");
  }
  if (isLinked && !next.some((type) => type === "브리지")) next.unshift("브리지");
  if (isLinked && !next.some((type) => /^pontic$/i.test(type))) next.push("Pontic");
  if (isLinked && !next.some((type) => isMissingToothProsthesisType(type))) {
    next.push(NO_WORK_PROSTHESIS_TYPE);
  }
  if (isLinked && !next.some((type) => isRetainerProsthesisType(type))) next.push("유지장치");
  if (isLinked && !next.some((type) => isTemporaryToothProsthesisType(type))) {
    next.push("임시치아");
  }
  return next;
};

export const resolveProsthesisTypeForLinkState = (
  currentType: string,
  isLinked: boolean,
  catalog: string[],
  customAbutment = false,
) => {
  const options = getProsthesisTypesForLinkState(isLinked, catalog);
  const currentRaw = String(currentType || "").trim();
  const current =
    currentRaw === "가철성 임시치아" ||
    currentRaw.replace(/\s+/g, "") === "가철성임시치아"
      ? "임시치아"
      : currentRaw;
  if (current && options.some((type) => type === current)) return current;
  if (!isLinked && isTemporaryToothProsthesisType(current)) {
    return options.find((type) => isTemporaryToothProsthesisType(type)) || "임시치아";
  }
  if (isLinked && isMissingToothProsthesisType(current)) {
    return (
      options.find((type) => isMissingToothProsthesisType(type)) || NO_WORK_PROSTHESIS_TYPE
    );
  }
  if (isLinked && /^pontic$/i.test(current)) {
    return options.find((type) => /^pontic$/i.test(type)) || "Pontic";
  }
  if (isLinked && isRetainerProsthesisType(current)) {
    return options.find((type) => isRetainerProsthesisType(type)) || "유지장치";
  }
  if (isLinked && isTemporaryToothProsthesisType(current)) {
    return options.find((type) => isTemporaryToothProsthesisType(type)) || "임시치아";
  }
  if (isLinked) {
    return options.find((type) => type === "브리지") || options[0] || "브리지";
  }
  if (isCustomAbutmentProsthesisType(current) || customAbutment) {
    return (
      options.find((type) => isCustomAbutmentProsthesisType(type)) ||
      CUSTOM_ABUTMENT_PROSTHESIS_TYPE
    );
  }
  return options.find((type) => type === "크라운") || options[0] || "크라운";
};

/** 형태 변경. 클릭 순환(Pontic·작업X·인레이·유지장치·임시치아 포함)은 커스텀을 유지.
 * 어벗 체크 해제만 규격을 지운다. */
export const applyProsthesisTypeToRow = (
  row: ToothWorkSelection,
  prosthesisType: string,
  defaultAbutmentProductMode?: AbutmentProductMode,
): ToothWorkSelection => {
  const nextType = String(prosthesisType || "").trim();
  if (isCustomAbutmentProsthesisType(nextType)) {
    const wasCustom =
      row.customAbutment || isCustomAbutmentProsthesisType(row.prosthesisType);
    const abutmentProductMode = isAbutmentProductMode(row.abutmentProductMode)
      ? row.abutmentProductMode
      : wasCustom
        ? ABUTMENT_PRODUCT_MODE.PRODUCTION
        : normalizeAccountAbutmentProductMode(defaultAbutmentProductMode);
    return {
      ...row,
      prosthesisType: CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
      customAbutment: true,
      abutmentProductMode,
    };
  }
  if (nextType === "크라운" || nextType === "브리지") {
    if (row.customAbutment) {
      return { ...row, prosthesisType: nextType };
    }
    return {
      ...row,
      prosthesisType: nextType,
      customAbutment: false,
      abutmentProductMode: undefined,
      ...emptyToothWorkCustomSpecs(),
    };
  }
  return { ...row, prosthesisType: nextType };
};

/** 연결 스팬 전체가 같은 형태여야 하는 보철(유지장치·임시치아) */
export const isSpanUniformProsthesisType = (prosthesisType: string) =>
  isRetainerProsthesisType(prosthesisType) ||
  isTemporaryToothProsthesisType(prosthesisType);

/** 인접 연결로 이어진 치아 집합(자기 포함) */
export const collectLinkedComponentTeeth = (
  rows: ToothWorkSelection[],
  toothNumber: string,
): string[] => {
  const start = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(start)) return start ? [start] : [];
  const known = new Set(
    rows
      .map((row) => String(row.toothNumber || "").trim())
      .filter((tooth) => /^[1-4][1-8]$/.test(tooth)),
  );
  const visited = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur) || !known.has(cur)) continue;
    visited.add(cur);
    for (const linked of collectAdjacentBridgeLinks(rows, cur)) {
      if (!visited.has(linked)) stack.push(linked);
    }
  }
  return [...visited];
};

export const applyProsthesisTypeToLinkedSpan = (
  rows: ToothWorkSelection[],
  toothNumber: string,
  prosthesisType: string,
  defaultAbutmentProductMode?: AbutmentProductMode,
): ToothWorkSelection[] => {
  const component = new Set(collectLinkedComponentTeeth(rows, toothNumber));
  if (component.size === 0) return rows;
  return rows.map((row) => {
    const tooth = String(row.toothNumber || "").trim();
    if (!component.has(tooth)) return row;
    return applyProsthesisTypeToRow(row, prosthesisType, defaultAbutmentProductMode);
  });
};

/** 인접 치아 체크 토글: 양방향 연결 + 연결 여부에 맞게 형태(브리지/Pontic/작업X/유지장치 vs 인레이/크라운/커스텀어벗, 임시치아는 양쪽) 동기화 */
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
    current.customAbutment || isCustomAbutmentProsthesisType(current.prosthesisType),
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
        paired.customAbutment || isCustomAbutmentProsthesisType(paired.prosthesisType),
      );
      next[pairedIdx] = {
        ...applyProsthesisTypeToRow(paired, pairedType),
        bridgeLinkedTeeth: nextPairedLinks,
      };
    } else {
      next.push({
        toothNumber: adjTooth,
        prosthesisType: resolveProsthesisTypeForLinkState("", true, catalog, false),
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
      paired.customAbutment || isCustomAbutmentProsthesisType(paired.prosthesisType),
    );
    next[pairedIdx] = {
      ...applyProsthesisTypeToRow(paired, pairedType),
      bridgeLinkedTeeth: pairedLinks,
    };
  }

  if (checked && currentTooth) {
    const initiator = next[originalIndex];
    const initiatorType = String(initiator?.prosthesisType || "").trim();
    if (initiator && isSpanUniformProsthesisType(initiatorType)) {
      return applyProsthesisTypeToLinkedSpan(next, currentTooth, initiatorType);
    }
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
