export const parseProgramNoFromName = (name: string): number | null => {
  const str = String(name || "");
  const fanucMatch = str.match(/O(\d{4})/i);
  if (fanucMatch) {
    const n = Number(fanucMatch[1]);
    return Number.isFinite(n) ? n : null;
  }
  const fallbackMatch = str.match(/(\d{1,6})/);
  if (!fallbackMatch) return null;
  const n = Number(fallbackMatch[1]);
  return Number.isFinite(n) ? n : null;
};

export const fixMojibakeFilename = (name: string): string => {
  const raw = String(name || "").trim();
  if (!raw) return raw;

  // 이미 한글이 포함된 정상 문자열은 그대로 둔다.
  if (/[\uAC00-\uD7AF]/.test(raw)) return raw;

  // 흔한 모지박 패턴 (UTF-8 바이트열을 Latin1로 잘못 해석한 경우)
  const looksMojibake = /Ã.|Â.|â€|ì|ë|ê|í|ï|ð|ñ|ò|ó|ô|õ|ö|ø|ù|ú|û|ü/i.test(raw);
  const hasReplacement = raw.includes("�");
  if (!looksMojibake && !hasReplacement) return raw;

  try {
    const bytes = new Uint8Array(
      Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff),
    );
    const fixed = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes)
      .trim();
    if (!fixed) return raw;
    if (fixed === raw) return raw;
    // 복구 결과에 한글이 생기거나, replacement 문자가 줄어들면 복구 성공으로 간주
    const fixedHasHangul = /[\uAC00-\uD7AF]/.test(fixed);
    const fixedHasReplacement = fixed.includes("�");
    if (fixedHasHangul || (hasReplacement && !fixedHasReplacement)) {
      return fixed;
    }
  } catch {
    // ignore
  }

  return raw;
};

export const normalizeProgramFileNameByContentFirst = (
  originalName: string,
  content: string,
): string => {
  const trimmedName = String(originalName || "").trim();
  const upper = trimmedName.toUpperCase();

  const firstLine = String(content || "").split(/\r?\n/)[0] || "";
  const firstLineUpper = firstLine.toUpperCase();
  let programNo: number | null = null;

  const lineMatch = firstLineUpper.match(/O(\d{1,5})/);
  if (lineMatch) {
    programNo = Number(lineMatch[1]);
  }

  if (!Number.isFinite(programNo)) {
    const fanucFileMatch = upper.match(/^O(\d{4})\.NC$/);
    if (fanucFileMatch) {
      programNo = Number(fanucFileMatch[1]);
    }
  }

  if (!Number.isFinite(programNo)) {
    const nameFanucMatch = upper.match(/O(\d{1,5})/);
    if (nameFanucMatch) {
      programNo = Number(nameFanucMatch[1]);
    }
  }

  if (!Number.isFinite(programNo) || programNo === null) {
    const digitsMatch = upper.match(/(\d{1,4})/);
    if (digitsMatch) {
      programNo = Number(digitsMatch[1]);
    }
  }

  if (!Number.isFinite(programNo) || programNo === null) {
    const base = trimmedName.replace(/\.[^.]*$/, "");
    return `${base || "O0001"}.nc`;
  }

  let n = programNo as number;
  if (n < 0) n = 0;
  if (n > 9999) n = 9999;
  const padded = String(n).padStart(4, "0");
  return `O${padded}.nc`;
};

export const applyProgramNoToContent = (
  programNo: number,
  content: string,
): string => {
  if (!Number.isFinite(programNo) || programNo <= 0) {
    return content;
  }

  const padded = String(programNo).padStart(4, "0");
  const oLine = `O${padded}`;

  const raw = String(content ?? "");
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) {
    return `${oLine}`;
  }

  // 1) 내용 전체에서 첫 번째 O번호 라인을 찾아 교체한다.
  let oLineIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (/^O\d{1,5}/i.test(t)) {
      oLineIdx = i;
      break;
    }
  }

  if (oLineIdx >= 0) {
    const replaced = lines[oLineIdx].replace(/O\d{1,5}/i, oLine);
    lines[oLineIdx] = replaced;
    return lines.join("\n");
  }

  // 2) O라인이 전혀 없으면, 첫 번째 비어있지 않은 줄 앞에 O라인을 삽입한다.
  let firstIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") {
      firstIdx = i;
      break;
    }
  }

  // 전부 공백이라면 O라인 하나만 반환
  if (firstIdx === -1) {
    return `${oLine}`;
  }

  const before = lines.slice(0, firstIdx);
  const after = lines.slice(firstIdx);
  return [...before, oLine, ...after].join("\n");
};
