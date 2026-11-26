// change-log:
// - 2026-11-26: Windows 정적 경로("/" → index.html) 회귀 테스트.
// related files:
// - bg/pc2/lot-server/src/static-path.js
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolvePublicPath } from "../src/static-path.js";

const W = path.win32;
const PUB = "D:\\bg\\lot-server\\public";

test("Windows: /index.html·/station.js는 public 안 파일로 해석된다", () => {
  assert.deepEqual(resolvePublicPath(PUB, "/index.html", W), { ok: true, full: `${PUB}\\index.html` });
  assert.deepEqual(resolvePublicPath(PUB, "/", W), { ok: true, full: `${PUB}\\index.html` });
  assert.deepEqual(resolvePublicPath(PUB, "/station.js", W), { ok: true, full: `${PUB}\\station.js` });
});

test("Windows: 위로 올라가는 경로는 public 안으로 묶이고, 드라이브 경로·비밀 파일은 막는다", () => {
  assert.deepEqual(resolvePublicPath(PUB, "/../index.html", W), { ok: true, full: `${PUB}\\index.html` });
  assert.deepEqual(resolvePublicPath(PUB, "/%2e%2e/%2e%2e/station.js", W), { ok: true, full: `${PUB}\\station.js` });
  for (const bad of ["/C:/Windows/win.ini", "/local.env", "/../local.env", "/src/../local.env", "/.gitignore", "/.DS_Store", "/%E0%A4%A"]) {
    assert.equal(resolvePublicPath(PUB, bad, W).ok, false, bad);
  }
});

test("POSIX에서도 같은 규칙", () => {
  const P = path.posix;
  assert.deepEqual(resolvePublicPath("/srv/pub", "/index.html", P), { ok: true, full: "/srv/pub/index.html" });
  assert.deepEqual(resolvePublicPath("/srv/pub", "/../etc/passwd", P), { ok: true, full: "/srv/pub/etc/passwd" });
  assert.equal(resolvePublicPath("/srv/pub", "/a/.env", P).ok, false);
});
