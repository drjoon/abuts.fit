// change-log:
// - 2026-11-27: 각인 전용 인식(기본)으로 밝기 128 BYU 프레임은 목록에 BYU가 있으면 반드시 BYU로 읽어야 한다.
// - 2026-11-27: 2026-11-27 실측 BYU 프레임(UVC 밝기 128 / 255). 대기 목록에 없는 코드는 결과로 내지 않는다.
//   이 각인(테두리만 진한 양각)은 아직 안정적으로 못 읽는다. 최소 요구: 엉뚱한 대기 건 코드로 읽지 않는다.
// related files:
// - bg/pc2/lot-server/src/ocr/index.js
// - bg/pc2/lot-server/src/watch.js

import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { disposeOcrWorker, recognizeLot } from "../src/ocr/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => path.join(here, "fixtures", name);
// 2026-11-27 14:2x 세척.패킹 대기 목록(BYU는 이미 포장.발송).
const QUEUE = ["BYZ", "BZA", "BZB", "BZC", "BYY", "BYW", "BYX", "BYV", "BYT", "BYK"];
const FRAMES = ["um20-byu-b128-a.jpg", "um20-byu-b128-b.jpg", "um20-byu-b128-c.jpg", "um20-byu-b255-washed.jpg"];

test("BYU 프레임: 대기 목록이 BYU를 빼면 어떤 코드로도 성공하지 않는다", { timeout: 240000 }, async () => {
  for (const name of FRAMES) {
    const r = await recognizeLot(fx(name), { allowed: QUEUE });
    assert.equal(r.success, false, `${name} -> ${r.lot}`);
  }
});

test("BYU 프레임: 목록에 BYU가 있으면 BYU이거나 실패(다른 코드 금지)", { timeout: 240000 }, async () => {
  for (const name of FRAMES) {
    const r = await recognizeLot(fx(name), { allowed: [...QUEUE, "BYU"] });
    if (r.success) assert.equal(r.lot, "BYU", name);
    if (name.includes("b128")) assert.equal(r.success, true, `${name}: ${r.reason} top=${r.top}`);
  }
  await disposeOcrWorker();
});
