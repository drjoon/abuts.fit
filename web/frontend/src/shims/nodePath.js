/** 브라우저 빌드용. occt-import-js 의 Node 분기에서만 require 한다. */
export function join(...parts) {
  return parts.join("/");
}
export default { join };
