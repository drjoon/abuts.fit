/** 브라우저 빌드용. manifold/rhino 의 Node 분기에서만 import 한다. */
export function createRequire() {
  throw new Error("node:module is not used in the browser bundle");
}
