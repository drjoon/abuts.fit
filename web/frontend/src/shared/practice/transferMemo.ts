export type ToothWorkSelection = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  bridgeLinkedTeeth: string[];
};

export type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName: string;
  memo: string;
};

export const DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS = 7;

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
      return item;
    });

  const deduped = Array.from(new Set(canonical));
  if (!deduped.some((item) => /^pontic$/i.test(item))) deduped.push("Pontic");
  return deduped;
};

export const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" || prosthesisType === "Pontic";

export const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) =>
  prosthesisType === "크라운" || prosthesisType === "브리지";

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
      const prosthesisType = String(row?.prosthesisType || "").trim();
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
      const prosthesisType = String(row?.prosthesisType || "").trim() || (toothNumber ? "크라운" : "");
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
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }

      const prosthesisType = withoutLinked || (toothNumber ? "크라운" : "");
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
          ? "+커스텀어벗"
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
          ? "+커스텀어벗"
          : "";
      return `${toothToken}=${prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

export const formatToothWorksForDisplay = (
  rows: ToothWorkSelection[],
  options?: { multiline?: boolean },
) => {
  const normalizedRows = normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber));
  if (!normalizedRows.length) return "";

  const formattedRows = normalizedRows.map((row) => {
    const details = [row.prosthesisType];
    if (row.customAbutment) details.push("커스텀어벗");
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
}) => {
  const lines = [
    `[주문일: ${String(params.orderDate || "").trim()}]`,
    `[도착일: ${String(params.arrivalDate || "").trim()}]`,
    `[도착기본일수: ${normalizeArrivalDefaultDays(params.arrivalDefaultDays)}]`,
    `[환자명: ${String(params.patientName || "").trim()}]`,
    `[보철물형태목록: ${normalizeProsthesisTypes(params.prosthesisTypes).join(", ")}]`,
    `[치아보철: ${serializeToothWorksForSync(params.toothWorks)}]`,
  ];
  const memo = String(params.memo || "").trim();
  return memo ? `${lines.join("\n")}\n${memo}` : lines.join("\n");
};

export const formatPracticeTransferMemoDetail = (
  rawMemo: string,
  options?: { includeDateSummary?: boolean },
) => {
  const source = String(rawMemo || "").trim();
  if (!source) return "";

  const hasKnownMeta =
    /\[\s*(주문일|도착일|도착기본일수|환자명|보철물형태목록|보철물형태|치아보철)\s*:/i.test(source);
  if (!hasKnownMeta) return formatTransferMemoForDisplay(source);

  const parsed = parsePracticeTransferMemoMeta(source);
  const summarySections: string[] = [];
  const includeDateSummary = options?.includeDateSummary !== false;

  if (includeDateSummary) {
    const dateSummaryParts: string[] = [];
    if (parsed.orderDate) dateSummaryParts.push(`주문일 ${parsed.orderDate}`);
    if (parsed.arrivalDate) dateSummaryParts.push(`도착일 ${parsed.arrivalDate}`);
    if (dateSummaryParts.length > 0) {
      summarySections.push(dateSummaryParts.join(" · "));
    }
  }

  if (parsed.patientName) {
    summarySections.push(`환자명 ${parsed.patientName}`);
  }

  const toothSummary = formatToothWorksForDisplay(parsed.toothWorks, { multiline: true });
  if (toothSummary) {
    summarySections.push(`치아보철\n${toothSummary}`);
  } else if (parsed.prosthesisTypes.length > 0) {
    summarySections.push(`보철물 형태\n${parsed.prosthesisTypes.join(", ")}`);
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
