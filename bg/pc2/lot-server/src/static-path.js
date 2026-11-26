// change-log:
// - 2026-11-26: 정적 파일 경로 해석. Windows에서 path.normalize("/index.html")이 "\index.html"(드라이브 루트 절대 경로)이 되어
//   PUBLIC_DIR 밖으로 해석되고 400이 나던 문제를 막는다. 점(.)으로 시작하는 파일·*.env는 내보내지 않는다.
// related files:
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/test/static-path.test.js
import path from "path";

/**
 * URL 경로를 public 폴더 안의 실제 파일 경로로 바꾼다.
 * @param {string} publicDir
 * @param {string} urlPath 예: "/", "/index.html", "/station.js"
 * @param {typeof path} [p] 테스트용(path.win32 / path.posix)
 * @returns {{ ok: true, full: string } | { ok: false }}  ok=false면 public 밖(400)
 */
export function resolvePublicPath(publicDir, urlPath, p = path) {
  let decoded = String(urlPath || "/");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return { ok: false };
  }
  if (decoded.includes("\0")) return { ok: false };
  // 앞의 / 와 \ 를 모두 떼어 상대 경로로 만든다(Windows에서 "\x"는 드라이브 루트 절대 경로).
  let rel = p.normalize(decoded).replace(/^[/\\]+/, "");
  if (!rel || rel === ".") rel = "index.html";
  if (rel.split(/[/\\]/).includes("..") || p.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return { ok: false };
  // 비밀값이 들어갈 수 있는 파일(local.env 등)·숨김 파일은 public에 있어도 내보내지 않는다.
  if (rel.split(/[/\\]/).some((part) => part.startsWith(".") || /\.env$/i.test(part))) return { ok: false };
  const root = p.resolve(publicDir);
  const full = p.resolve(root, rel);
  if (full !== root && !full.startsWith(root + p.sep)) return { ok: false };
  return { ok: true, full };
}
