// 프리뷰 저장명. 공정 파일 종류에 맞는 확장자만 붙인다.
// NC URL이 fileName을 비우면 클라이언트가 `.stl`로 저장하던 문제를 막는다.

export type PreviewDownloadKind = "nc" | "stl" | "image";

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const MODEL_EXT = /\.(stl|ply|obj|dcm|3mf)$/i;

function basename(raw?: string) {
  return String(raw || "")
    .trim()
    .split(/[/\\]/)
    .pop() || "";
}

function hasExt(name: string) {
  return /\.[A-Za-z0-9]{1,8}$/.test(name);
}

function stripExt(name: string) {
  return hasExt(name) ? name.replace(/\.[^.]+$/, "") : name;
}

export function extensionFromMime(mime?: string | null) {
  const type = String(mime || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (type === "image/png") return ".png";
  if (type === "image/jpeg" || type === "image/jpg") return ".jpg";
  if (type === "image/webp") return ".webp";
  if (type === "image/bmp" || type === "image/x-ms-bmp") return ".bmp";
  if (type === "image/gif") return ".gif";
  if (
    type === "model/stl" ||
    type === "application/sla" ||
    type === "application/vnd.ms-pki.stl"
  ) {
    return ".stl";
  }
  return "";
}

export function resolveNcDownloadName(rawName: string, requestId?: string) {
  const base = basename(rawName);
  if (/\.nc$/i.test(base)) return base;
  const rid = String(requestId || "").trim();
  if (/^[A-Za-z0-9_-]{1,80}$/.test(rid)) return `${rid}.nc`;
  const stem = stripExt(base);
  return `${stem || "program"}.nc`;
}

export function resolveDownloadFileName(opts: {
  preferredName?: string;
  apiName?: string;
  kind: PreviewDownloadKind;
  /** null이면 이미지 확장자를 아직 정하지 않는다. */
  mime?: string | null;
  requestId?: string;
}) {
  const preferred = basename(opts.preferredName);
  const api = basename(opts.apiName);

  if (opts.kind === "nc") {
    return resolveNcDownloadName(preferred || api, opts.requestId);
  }

  if (opts.kind === "stl") {
    const named = [preferred, api].find((name) => MODEL_EXT.test(name));
    if (named) return named;
    const stem = stripExt(preferred || api) || "model";
    return `${stem}.stl`;
  }

  const named = [preferred, api].find((name) => IMAGE_EXT.test(name));
  if (named) return named;
  const fromMime = extensionFromMime(opts.mime);
  if (!fromMime && opts.mime == null) {
    return preferred || api;
  }
  const stem = stripExt(preferred || api) || "image";
  return `${stem}${fromMime || ".png"}`;
}
