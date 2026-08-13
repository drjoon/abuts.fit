export type ToothWorkSelection = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  bridgeLinkedTeeth: string[];
  /** 커스텀어벗일 때만 의미 있음. 동기화/임시저장 memo에 포함 */
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  /** 커스텀어벗 규격 (제조사/직경/높이) */
  abutmentManufacturer?: string;
  abutmentDiameter?: string;
  abutmentHeight?: string;
};

export type PracticeImplantFavorite = {
  id: string;
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
};

export type PracticeAbutmentFavorite = {
  id: string;
  manufacturer: string;
  diameter: string;
  height: string;
};

export const emptyToothWorkImplant = () => ({
  implantManufacturer: "",
  implantBrand: "",
  implantFamily: "",
  implantType: "",
});

export const emptyToothWorkAbutment = () => ({
  abutmentManufacturer: "",
  abutmentDiameter: "",
  abutmentHeight: "",
});

export const emptyToothWorkCustomSpecs = () => ({
  ...emptyToothWorkImplant(),
  ...emptyToothWorkAbutment(),
});

export const pickToothWorkImplant = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkImplant();
  return {
    implantManufacturer: String(row?.implantManufacturer || "").trim(),
    implantBrand: String(row?.implantBrand || "").trim(),
    implantFamily: String(row?.implantFamily || "").trim(),
    implantType: String(row?.implantType || "").trim(),
  };
};

export const pickToothWorkAbutment = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkAbutment();
  return {
    abutmentManufacturer: String(row?.abutmentManufacturer || "").trim(),
    abutmentDiameter: String(row?.abutmentDiameter || "").trim(),
    abutmentHeight: String(row?.abutmentHeight || "").trim(),
  };
};

export const pickToothWorkCustomSpecs = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkCustomSpecs();
  return {
    ...pickToothWorkImplant(row, true),
    ...pickToothWorkAbutment(row, true),
  };
};

export const customSpecsKey = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const specs = pickToothWorkCustomSpecs(row, true);
  return [
    specs.implantManufacturer,
    specs.implantBrand,
    specs.implantFamily,
    specs.implantType,
    specs.abutmentManufacturer,
    specs.abutmentDiameter,
    specs.abutmentHeight,
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");
};

export const formatCustomSpecsSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const implantLabel = formatImplantSummary(row);
  const abutmentLabel = formatAbutmentSummary(row);
  return [implantLabel, abutmentLabel ? `어벗 ${abutmentLabel}` : ""]
    .filter(Boolean)
    .join(" · ");
};

export const formatImplantSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) =>
  [
    row?.implantManufacturer,
    row?.implantBrand,
    row?.implantFamily,
    row?.implantType,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ");

/** 카드용 짧은 표시: 제조사 앞 3글자 / 패밀리 첫 글자 */
export const formatImplantCompact = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const manufacturer = String(row?.implantManufacturer || "").trim();
  const family = String(row?.implantFamily || "").trim();
  const manufacturerShort = [...manufacturer].slice(0, 3).join("");
  const familyShort = [...family].slice(0, 1).join("");
  if (manufacturerShort && familyShort) return `${manufacturerShort} / ${familyShort}`;
  return manufacturerShort || familyShort || "";
};

export const formatAbutmentSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) =>
  [
    String(row?.abutmentManufacturer || "").trim(),
    String(row?.abutmentDiameter || "").trim(),
    String(row?.abutmentHeight || "").trim(),
  ]
    .filter(Boolean)
    .join(" / ");

/** 카드용 짧은 표시: 직경×높이 */
export const formatAbutmentCompact = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const diameter = String(row?.abutmentDiameter || "").trim();
  const height = String(row?.abutmentHeight || "").trim();
  if (diameter && height) return `${diameter}×${height}`;
  return diameter || height || "";
};
const serializeImplantSuffix = (row: ToothWorkSelection) => {
  const manufacturer = String(row.implantManufacturer || "").trim();
  const brand = String(row.implantBrand || "").trim();
  const family = String(row.implantFamily || "").trim();
  const type = String(row.implantType || "").trim();
  if (!manufacturer && !brand && !family && !type) return "";
  return `{${manufacturer}/${brand}/${family}/${type}}`;
};

const serializeAbutmentSuffix = (row: ToothWorkSelection) => {
  const manufacturer = String(row.abutmentManufacturer || "").trim();
  const diameter = String(row.abutmentDiameter || "").trim();
  const height = String(row.abutmentHeight || "").trim();
  if (!manufacturer && !diameter && !height) return "";
  return `[${manufacturer}/${diameter}/${height}]`;
};

const serializeCustomSpecsSuffix = (row: ToothWorkSelection) =>
  `${serializeImplantSuffix(row)}${serializeAbutmentSuffix(row)}`;

const parseCustomSpecsSuffix = (value: string) => {
  let source = String(value || "").trim();
  let abutmentManufacturer = "";
  let abutmentDiameter = "";
  let abutmentHeight = "";
  let implantManufacturer = "";
  let implantBrand = "";
  let implantFamily = "";
  let implantType = "";

  const abutMatch = source.match(/\[([^\]]*)\]\s*$/);
  if (abutMatch) {
    const parts = String(abutMatch[1] || "").split("/");
    abutmentManufacturer = String(parts[0] || "").trim();
    abutmentDiameter = String(parts[1] || "").trim();
    abutmentHeight = parts.slice(2).join("/").trim();
    source = source.replace(/\[[^\]]*\]\s*$/, "").trim();
  }

  const implantMatch = source.match(/\{([^}]*)\}\s*$/);
  if (implantMatch) {
    const parts = String(implantMatch[1] || "").split("/");
    implantManufacturer = String(parts[0] || "").trim();
    implantBrand = String(parts[1] || "").trim();
    implantFamily = String(parts[2] || "").trim();
    implantType = parts.slice(3).join("/").trim();
    source = source.replace(/\{[^}]*\}\s*$/, "").trim();
  }

  return {
    without: source,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
    abutmentManufacturer,
    abutmentDiameter,
    abutmentHeight,
  };
};

export const normalizeImplantFavorites = (items: unknown): PracticeImplantFavorite[] => {
  if (!Array.isArray(items)) return [];
  const out: PracticeImplantFavorite[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const brand = String(row.brand || "").trim();
    const family = String(row.family || "").trim();
    const type = String(row.type || "").trim();
    if (!manufacturer && !brand && !family && !type) continue;
    const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = String(row.id || "").trim() || `imp-${out.length + 1}-${key.slice(0, 24)}`;
    out.push({ id, manufacturer, brand, family, type });
    if (out.length >= 40) break;
  }
  return out;
};

export const normalizeAbutmentFavorites = (items: unknown): PracticeAbutmentFavorite[] => {
  if (!Array.isArray(items)) return [];
  const out: PracticeAbutmentFavorite[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const diameter = String(row.diameter || "").trim();
    const height = String(row.height || "").trim();
    if (!manufacturer && !diameter && !height) continue;
    const key = `${manufacturer}|${diameter}|${height}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = String(row.id || "").trim() || `abt-${out.length + 1}-${key.slice(0, 24)}`;
    out.push({ id, manufacturer, diameter, height });
    if (out.length >= 40) break;
  }
  return out;
};

export type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName: string;
  memo: string;
  /** 의뢰건별 「디자인 컨펌 생략」. 계정 세팅이 아님 */
  skipDesignConfirm: boolean;
};

export const DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS = 7;

/** 브리지 스팬에서 작업하지 않는 칸. 표시·저장 SSOT */
export const NO_WORK_PROSTHESIS_TYPE = "작업X";
export const NO_WORK_PROSTHESIS_TOOLTIP =
  "작업하지 않으며, 크레딧도 소비되지 않습니다.";

export const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === NO_WORK_PROSTHESIS_TYPE ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

export const toCanonicalProsthesisType = (prosthesisType: string) =>
  isMissingToothProsthesisType(prosthesisType)
    ? NO_WORK_PROSTHESIS_TYPE
    : String(prosthesisType || "").trim();

export const normalizeArrivalDefaultDays = (value: number) =>
  Math.max(0, Math.floor(Number(value || 0)));

export const normalizeProsthesisTypes = (items: string[]) => {
  const canonical = items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      const lowered = item.toLowerCase();
      if (lowered === "pontic") return "Pontic";
      if (lowered === "브릿지") return "브리지";
      if (
        lowered === "작업x" ||
        lowered === "상실치" ||
        lowered === "missing" ||
        lowered === "missing tooth"
      ) {
        return NO_WORK_PROSTHESIS_TYPE;
      }
      const compact = item.replace(/\s+/g, "");
      if (/^(?:커스텀)?어벗디자인$/i.test(compact)) return "어벗 디자인";
      if (/^missing(?:tooth)?$/i.test(compact)) return NO_WORK_PROSTHESIS_TYPE;
      return item;
    });

  const deduped = Array.from(new Set(canonical));
  if (!deduped.some((item) => /^pontic$/i.test(item))) deduped.push("Pontic");
  if (!deduped.some((item) => isMissingToothProsthesisType(item))) {
    deduped.push(NO_WORK_PROSTHESIS_TYPE);
  }
  return deduped;
};

export const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" ||
  prosthesisType === "Pontic" ||
  isMissingToothProsthesisType(prosthesisType);

export const isAbutmentDesignProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return /^(?:커스텀)?어벗디자인$/i.test(compact);
};

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

export const toToothMemoSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);

  if (tens === 1) return 9 - ones; // 18..11
  if (tens === 2) return 8 + ones; // 21..28
  if (tens === 4) return 16 + (9 - ones); // 48..41
  if (tens === 3) return 24 + ones; // 31..38

  return Number.MAX_SAFE_INTEGER;
};

export const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisType = toCanonicalProsthesisType(
        String(row?.prosthesisType || "").trim(),
      );
      const customAbutment = isCustomAbutmentSupportedProsthesisType(prosthesisType)
        ? Boolean(row?.customAbutment)
        : false;
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isBridgeLikeProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(row, customAbutment),
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

/** 공동 작성 동기화용: 치아번호 미입력 행도 유지(전송 검증용 normalizeToothWorks와 분리) */
export const EMPTY_TOOTH_SYNC_TOKEN = "-";

export const normalizeToothWorksForSync = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const rawTooth = String(row?.toothNumber || "").trim();
      const toothNumber =
        !rawTooth || rawTooth === EMPTY_TOOTH_SYNC_TOKEN
          ? ""
          : rawTooth;
      // 형태 미선택이어도 치아번호는 동료에게 전달. 직렬화 시 기본 형태로 채운다.
      const prosthesisType = toCanonicalProsthesisType(
        String(row?.prosthesisType || "").trim() || (toothNumber ? "크라운" : ""),
      );
      const customAbutment = isCustomAbutmentSupportedProsthesisType(prosthesisType)
        ? Boolean(row?.customAbutment)
        : false;
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isBridgeLikeProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(row, customAbutment),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

export const parseToothWorks = (value: string) =>
  String(value || "")
    .split("|")
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [toothRaw, ...rest] = chunk.split("=");
      const rawTooth = String(toothRaw || "").trim();
      const toothNumber =
        !rawTooth || rawTooth === EMPTY_TOOTH_SYNC_TOKEN ? "" : rawTooth;
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: toothNumber ? "크라운" : "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
          ...emptyToothWorkCustomSpecs(),
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;
      const specsParsed = parseCustomSpecsSuffix(withoutLinked);
      withoutLinked = specsParsed.without;

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }
      if (
        specsParsed.implantManufacturer ||
        specsParsed.implantBrand ||
        specsParsed.implantFamily ||
        specsParsed.implantType ||
        specsParsed.abutmentManufacturer ||
        specsParsed.abutmentDiameter ||
        specsParsed.abutmentHeight
      ) {
        customAbutment = true;
      }

      const prosthesisType = toCanonicalProsthesisType(
        withoutLinked || (toothNumber ? "크라운" : ""),
      );
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber && v !== EMPTY_TOOTH_SYNC_TOKEN)
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(specsParsed, customAbutment),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

export const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber))
    .map((row) => {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        isBridgeLikeProsthesisType(row.prosthesisType) && orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? `+커스텀어벗${serializeCustomSpecsSuffix(row)}`
          : "";
      return `${row.toothNumber}=${row.prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

/** 공동 작성용: 치아번호 빈 행도 `-` 토큰으로 직렬화해 동료 화면에 행 수를 맞춘다. */
export const serializeToothWorksForSync = (rows: ToothWorkSelection[]) =>
  normalizeToothWorksForSync(rows)
    .map((row) => {
      const toothToken = row.toothNumber || EMPTY_TOOTH_SYNC_TOKEN;
      const prosthesisType = row.prosthesisType || "크라운";
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        row.toothNumber &&
        isBridgeLikeProsthesisType(prosthesisType) &&
        orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const custom =
        isCustomAbutmentSupportedProsthesisType(prosthesisType) && row.customAbutment
          ? `+커스텀어벗${serializeCustomSpecsSuffix(row)}`
          : "";
      return `${toothToken}=${prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

/**
 * 브리지 연결 성분에서 양끝 지대치(브리지) 사이 안쪽 Pontic은 표시에서 생략하고,
 * 바깥쪽 Pontic은 유지한 채 연결을 연장한다.
 *
 * 예) 43(브리지)-42(P)-41(P)-31(P)-32(P)-33(브리지)
 *  → 43 연결 43-33 / 33 연결 33-43 (안쪽 Pontic 생략)
 *
 * 예) 44(P)-43(브리지)-…-33(브리지)
 *  → 44 유지, 43 연결에 44와 33 포함
 */
export const collapseInnerBridgePonticsForDisplay = (
  rows: ToothWorkSelection[],
): ToothWorkSelection[] => {
  const normalized = normalizeToothWorks(rows);
  if (normalized.length === 0) return [];

  const byTooth = new Map<string, ToothWorkSelection>();
  for (const row of normalized) {
    if (!byTooth.has(row.toothNumber)) byTooth.set(row.toothNumber, row);
  }

  const bridgeLikeTeeth = normalized.filter((row) =>
    isBridgeLikeProsthesisType(row.prosthesisType),
  );
  if (bridgeLikeTeeth.length === 0) return normalized;

  const adjacency = new Map<string, Set<string>>();
  const ensure = (tooth: string) => {
    if (!adjacency.has(tooth)) adjacency.set(tooth, new Set());
    return adjacency.get(tooth)!;
  };

  for (const row of bridgeLikeTeeth) {
    ensure(row.toothNumber);
    for (const linked of row.bridgeLinkedTeeth) {
      if (!byTooth.has(linked)) continue;
      if (!isBridgeLikeProsthesisType(byTooth.get(linked)!.prosthesisType)) continue;
      ensure(row.toothNumber).add(linked);
      ensure(linked).add(row.toothNumber);
    }
  }

  const visited = new Set<string>();
  const omitPontics = new Set<string>();
  const collapsedLinks = new Map<string, string[]>();

  const walkComponent = (seed: string) => {
    const stack = [seed];
    const component: string[] = [];
    visited.add(seed);

    while (stack.length > 0) {
      const cur = stack.pop() as string;
      component.push(cur);
      for (const next of adjacency.get(cur) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    // 경로 정렬: degree≤1 끝점에서 BFS 경로 우선, 실패 시 악궁 정렬
    const degree = (tooth: string) => (adjacency.get(tooth)?.size || 0);
    const endpoints = component.filter((t) => degree(t) <= 1);
    const start =
      endpoints.sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      )[0] ||
      component.slice().sort((a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b))[0];

    const ordered: string[] = [];
    const pathVisited = new Set<string>();
    let cursor: string | null = start;
    let prev: string | null = null;
    while (cursor && !pathVisited.has(cursor)) {
      ordered.push(cursor);
      pathVisited.add(cursor);
      const neighbors = [...(adjacency.get(cursor) || [])].filter((n) => n !== prev);
      const nextInComponent = neighbors.find((n) => component.includes(n) && !pathVisited.has(n));
      prev = cursor;
      cursor = nextInComponent || null;
    }
    // 분기/누락분: 악궁 순으로 남은 치아 추가
    for (const tooth of component
      .slice()
      .sort((a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b))) {
      if (!pathVisited.has(tooth)) ordered.push(tooth);
    }

    const abutmentIndexes = ordered
      .map((tooth, idx) => ({ tooth, idx, type: byTooth.get(tooth)?.prosthesisType || "" }))
      .filter((row) => row.type === "브리지")
      .map((row) => row.idx);

    if (abutmentIndexes.length >= 2) {
      const left = Math.min(...abutmentIndexes);
      const right = Math.max(...abutmentIndexes);
      for (let i = left + 1; i < right; i += 1) {
        const tooth = ordered[i];
        if (byTooth.get(tooth)?.prosthesisType === "Pontic") {
          omitPontics.add(tooth);
        }
      }
    }

    const kept = ordered.filter((tooth) => !omitPontics.has(tooth));
    const keptSet = new Set(kept);

    // 생략 Pontic을 통과해 다음 유지 치아로 연결 연장
    const resolveNextKept = (from: string, via: string): string | null => {
      let prevTooth = from;
      let cur: string | null = via;
      const seen = new Set<string>([from]);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (keptSet.has(cur)) return cur;
        const nexts = [...(adjacency.get(cur) || [])].filter((n) => n !== prevTooth);
        prevTooth = cur;
        cur = nexts[0] || null;
      }
      return null;
    };

    for (const tooth of kept) {
      const rawNeighbors = [...(adjacency.get(tooth) || [])];
      const nextNeighbors = new Set<string>();
      for (const neighbor of rawNeighbors) {
        if (keptSet.has(neighbor)) {
          nextNeighbors.add(neighbor);
          continue;
        }
        if (omitPontics.has(neighbor)) {
          const resolved = resolveNextKept(tooth, neighbor);
          if (resolved) nextNeighbors.add(resolved);
        }
      }
      collapsedLinks.set(
        tooth,
        [...nextNeighbors].sort(
          (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
        ),
      );
    }
  };

  for (const row of bridgeLikeTeeth) {
    if (visited.has(row.toothNumber)) continue;
    walkComponent(row.toothNumber);
  }

  return normalized
    .filter((row) => !omitPontics.has(row.toothNumber))
    .map((row) => {
      if (!collapsedLinks.has(row.toothNumber)) return row;
      return {
        ...row,
        bridgeLinkedTeeth: collapsedLinks.get(row.toothNumber) || [],
      };
    });
};

export const formatToothWorksForDisplay = (
  rows: ToothWorkSelection[],
  options?: { multiline?: boolean },
) => {
  const normalizedRows = collapseInnerBridgePonticsForDisplay(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber));
  if (!normalizedRows.length) return "";

  const formattedRows = normalizedRows.map((row) => {
    const details = [row.prosthesisType];
    if (row.customAbutment) {
      details.push("커스텀어벗");
      const specsSummary = formatCustomSpecsSummary(row);
      if (specsSummary) details.push(specsSummary);
    }
    if (isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length > 0) {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      details.push(`연결 ${[row.toothNumber, ...orderedLinks].join("-")}`);
    }
    return `${row.toothNumber}번: ${details.join(" · ")}`;
  });

  return options?.multiline ? formattedRows.join("\n") : formattedRows.join(" / ");
};

const parseLegacyToothWorksSummary = (value: string): ToothWorkSelection[] => {
  const serialized = String(value || "")
    .split(/\s*[,|]\s*/)
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = chunk.match(/^([1-4][1-8])\s*[:=]\s*(.+)$/);
      if (!match) return "";
      return `${match[1]}=${String(match[2] || "").trim()}`;
    })
    .filter(Boolean)
    .join(" | ");

  if (!serialized) return [];
  return parseToothWorks(serialized);
};

export const formatTransferMemoForDisplay = (rawMemo: string) => {
  const memo = String(rawMemo || "").trim();
  if (!memo) return "";

  if (memo.includes("\n")) return memo;

  const compactParts = memo
    .split(/\s*·\s*(?=(?:주문일|도착일|치아별|형태|보철물\s*형태)\b)/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (compactParts.length <= 1) return memo;

  const sections: string[] = [];
  for (const part of compactParts) {
    const toothPart = part.match(/^치아별\s*(.+)$/);
    if (toothPart) {
      const parsed = parseLegacyToothWorksSummary(toothPart[1]);
      const toothText = formatToothWorksForDisplay(parsed, { multiline: true }) || toothPart[1];
      sections.push(`치아보철\n${toothText}`);
      continue;
    }

    const prosthesisPart = part.match(/^(?:형태|보철물\s*형태)\s*(.+)$/);
    if (prosthesisPart) {
      sections.push(`보철물 형태\n${prosthesisPart[1]}`);
      continue;
    }

    sections.push(part);
  }

  return sections.join("\n\n").trim();
};

export const parsePracticeTransferMemoMeta = (rawMemo: string): ParsedPracticeTransferMemoMeta => {
  const source = String(rawMemo || "").trim();
  const lines = source.split(/\r?\n/);
  const memoLines: string[] = [];
  let orderDate = "";
  let arrivalDate = "";
  let arrivalDefaultDays = DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS;
  let prosthesisTypes: string[] = [];
  let toothWorks: ToothWorkSelection[] = [];
  let patientName = "";
  let skipDesignConfirm = false;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      memoLines.push("");
      continue;
    }

    const orderMatch = trimmed.match(/^\[\s*주문일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (orderMatch) {
      orderDate = orderMatch[1];
      continue;
    }

    const arrivalMatch = trimmed.match(/^\[\s*도착일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (arrivalMatch) {
      arrivalDate = arrivalMatch[1];
      continue;
    }

    const defaultDaysMatch = trimmed.match(/^\[\s*도착기본일수\s*:\s*(\d{1,3})\s*\]$/);
    if (defaultDaysMatch) {
      arrivalDefaultDays = normalizeArrivalDefaultDays(Number(defaultDaysMatch[1]));
      continue;
    }

    const patientNameMatch = trimmed.match(/^\[\s*환자명\s*:\s*(.*)\]$/);
    if (patientNameMatch) {
      patientName = String(patientNameMatch[1] || "").trim();
      continue;
    }

    const prosthesisCatalogMatch = trimmed.match(/^\[\s*보철물형태목록\s*:\s*(.+)\]$/);
    if (prosthesisCatalogMatch) {
      prosthesisTypes = String(prosthesisCatalogMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const legacyProsthesisMatch = trimmed.match(/^\[\s*보철물형태\s*:\s*(.+)\]$/);
    if (legacyProsthesisMatch) {
      prosthesisTypes = String(legacyProsthesisMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const toothWorksMatch = trimmed.match(/^\[\s*치아보철\s*:\s*(.+)\]$/);
    if (toothWorksMatch) {
      toothWorks = parseToothWorks(String(toothWorksMatch[1] || ""));
      continue;
    }

    const skipDesignConfirmMatch = trimmed.match(/^\[\s*디자인컨펌생략\s*:\s*(.+)\]$/);
    if (skipDesignConfirmMatch) {
      const flag = String(skipDesignConfirmMatch[1] || "").trim().toLowerCase();
      skipDesignConfirm =
        flag === "y" ||
        flag === "yes" ||
        flag === "true" ||
        flag === "1" ||
        flag === "생략" ||
        flag === "예";
      continue;
    }

    memoLines.push(line);
  }

  return {
    orderDate,
    arrivalDate,
    arrivalDefaultDays,
    prosthesisTypes: normalizeProsthesisTypes(prosthesisTypes),
    toothWorks: normalizeToothWorksForSync(toothWorks),
    patientName,
    memo: memoLines.join("\n").replace(/^\s+|\s+$/g, ""),
    skipDesignConfirm,
  };
};

export const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName?: string;
  skipDesignConfirm?: boolean;
}) => {
  const lines = [
    `[주문일: ${String(params.orderDate || "").trim()}]`,
    `[도착일: ${String(params.arrivalDate || "").trim()}]`,
    `[도착기본일수: ${normalizeArrivalDefaultDays(params.arrivalDefaultDays)}]`,
    `[환자명: ${String(params.patientName || "").trim()}]`,
    `[보철물형태목록: ${normalizeProsthesisTypes(params.prosthesisTypes).join(", ")}]`,
    `[치아보철: ${serializeToothWorksForSync(params.toothWorks)}]`,
    `[디자인컨펌생략: ${params.skipDesignConfirm === true ? "Y" : "N"}]`,
  ];
  const memo = String(params.memo || "").trim();
  return memo ? `${lines.join("\n")}\n${memo}` : lines.join("\n");
};

export const formatPracticeTransferMemoDetail = (
  rawMemo: string,
  options?: {
    includeDateSummary?: boolean;
    includeToothWorks?: boolean;
    includePatientName?: boolean;
  },
) => {
  const source = String(rawMemo || "").trim();
  if (!source) return "";

  const hasKnownMeta =
    /\[\s*(주문일|도착일|도착기본일수|환자명|보철물형태목록|보철물형태|치아보철|디자인컨펌생략)\s*:/i.test(source);
  if (!hasKnownMeta) return formatTransferMemoForDisplay(source);

  const parsed = parsePracticeTransferMemoMeta(source);
  const summarySections: string[] = [];
  const includeDateSummary = options?.includeDateSummary !== false;
  const includeToothWorks = options?.includeToothWorks !== false;
  const includePatientName = options?.includePatientName !== false;

  if (includeDateSummary) {
    const dateSummaryParts: string[] = [];
    if (parsed.orderDate) dateSummaryParts.push(`주문일 ${parsed.orderDate}`);
    if (parsed.arrivalDate) dateSummaryParts.push(`도착일 ${parsed.arrivalDate}`);
    if (dateSummaryParts.length > 0) {
      summarySections.push(dateSummaryParts.join(" · "));
    }
  }

  if (includePatientName && parsed.patientName) {
    summarySections.push(`환자명 ${parsed.patientName}`);
  }

  if (includeToothWorks) {
    const toothSummary = formatToothWorksForDisplay(parsed.toothWorks, { multiline: true });
    if (toothSummary) {
      summarySections.push(`치아보철\n${toothSummary}`);
    } else if (parsed.prosthesisTypes.length > 0) {
      summarySections.push(`보철물 형태\n${parsed.prosthesisTypes.join(", ")}`);
    }
  }

  const freeMemo = String(parsed.memo || "").trim();
  if (freeMemo) summarySections.push(freeMemo);

  return formatTransferMemoForDisplay(summarySections.join("\n\n").trim());
};

export const stripPracticeTransferMessageEnvelope = (message: string) => {
  const raw = String(message || "").trim();
  if (!raw) return "";

  return raw
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/\[\s*기공소\s*:[^\]]*\]/gi, "")
        .replace(/\[\s*전송ID\s*:[^\]]*\]/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

export const extractTransferMemoFromMessage = (
  message: string,
  options?: { includeDateSummary?: boolean },
) => {
  const stripped = stripPracticeTransferMessageEnvelope(message);
  return formatPracticeTransferMemoDetail(stripped, options);
};
