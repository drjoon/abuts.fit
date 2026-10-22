/** 브라우저 빌드용. occt-import-js 의 Node 분기에서만 require 한다. */
export function randomFillSync(view) {
  if (view && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(view);
    return view;
  }
  throw new Error("node crypto is not used in the browser bundle");
}
export default { randomFillSync };
