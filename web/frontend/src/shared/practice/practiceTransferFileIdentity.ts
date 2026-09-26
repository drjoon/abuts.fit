/** 같은 파일명·용량이면 재업로드 복사본으로 본다. 크기 0은 구분하지 않는다. */
export function practiceTransferFileContentKey(
  name: string | null | undefined,
  size: number | null | undefined,
): string {
  const normalized = String(name || "").trim().normalize("NFC").toLowerCase();
  const bytes = Number(size || 0) || 0;
  if (!normalized || bytes <= 0) return "";
  return `${normalized}\0${bytes}`;
}
