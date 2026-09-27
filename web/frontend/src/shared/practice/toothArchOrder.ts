// FDI 치아 번호의 악궁 순서. 브리지 스팬·커넥터·삽입축 키가 같은 순서를 쓴다.

/** `#26`, `26번` → `26`. FDI 영구치가 아니면 빈 문자열. */
export function fdiToothDigits(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return /^[1-4][1-8]$/.test(digits) ? digits : "";
}

/**
 * 악궁을 따라 한쪽 끝에서 다른 끝까지 센 위치.
 * 상악 18→11→21→28, 하악 48→41→31→38. 문자열 순서로는 11 다음이 12라 정중선에서 끊긴다.
 */
export function archPosition(toothNumber: string): number {
  const digits = fdiToothDigits(toothNumber);
  if (!digits) return 999;
  const quadrant = Number(digits[0]);
  const pos = Number(digits[1]);
  if (quadrant === 1) return 9 - pos;
  if (quadrant === 2) return 8 + pos;
  if (quadrant === 4) return 100 + 9 - pos;
  return 100 + 8 + pos;
}

export function compareArch(a: string, b: string): number {
  return archPosition(a) - archPosition(b) || a.localeCompare(b);
}

export function sortByArch(toothNumbers: readonly string[]): string[] {
  return [...toothNumbers].sort(compareArch);
}

/** 삽입축 키. 같은 치아 묶음이면 입력 순서와 상관없이 같은 키다. */
export function insertionAxisKey(toothNumbers: readonly string[]): string {
  const digits = [...new Set(toothNumbers.map(fdiToothDigits).filter(Boolean))];
  return sortByArch(digits).join(",");
}

export function insertionAxisTeeth(key: string): string[] {
  return String(key || "")
    .split(",")
    .map(fdiToothDigits)
    .filter(Boolean);
}
