// change-log:
// - 2026-11-26: UM LED 켜기/끄기(시리얼) 설정·스크립트·연결 확인.
// related files:
// - bg/pc2/lot-server2/src/um-serial.js
// - bg/pc2/lot-server2/src/um-serial.ps1
// - bg/pc2/lot-server2/src/watch.js
// - bg/pc2/lot-server2/src/index.js
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ledLevelFromEnv, umLedOffSync } from "../src/um-serial.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../src", f), "utf8");

test("LOT_LED_LEVEL은 1–12만 받고 나머지는 현재 단계 유지(0)", () => {
  assert.equal(ledLevelFromEnv("3"), 3);
  assert.equal(ledLevelFromEnv(" 12 "), 12);
  assert.equal(ledLevelFromEnv(""), 0);
  assert.equal(ledLevelFromEnv(undefined), 0);
  assert.equal(ledLevelFromEnv("0"), 0);
  assert.equal(ledLevelFromEnv("13"), 0);
  assert.equal(ledLevelFromEnv("abc"), 0);
});

test("um-serial.ps1 LED 동작: 토글 키 0x19, 단계 키 0x1A/0x1B, STAFLAG bit1, 원격 제어 해제", () => {
  const ps1 = src("um-serial.ps1");
  assert.ok(!/[^\x00-\x7F]/.test(ps1), "ASCII only");
  assert.match(ps1, /"ledon", "ledoff"/);
  assert.match(ps1, /W0159/);
  assert.match(ps1, /Step-Led 0x1A/);
  assert.match(ps1, /Step-Led 0x1B/);
  assert.match(ps1, /-band 0x02/);
  assert.match(ps1, /if \(-not \$KeepRemote\) \{ \[void\]\(Set-Remote \$false\) \}/);
});

test("감시 시작=LED 켬, 중지·종료=LED 끔으로 연결돼 있다", () => {
  const watch = src("watch.js");
  assert.match(watch, /setLed\(true, "watch-start"\)/);
  assert.match(watch, /setLed\(false, "watch-stop"\)/);
  assert.match(watch, /shutdownSync\(\)/);
  const index = src("index.js");
  assert.match(index, /SIGINT/);
  assert.match(index, /watcher\.shutdownSync\(\)/);
});

test("Windows가 아니거나 LOT_UM_SERIAL=0이면 종료용 LED 끄기는 아무것도 하지 않는다", () => {
  const prev = process.env.LOT_UM_SERIAL;
  process.env.LOT_UM_SERIAL = "0";
  try {
    assert.equal(umLedOffSync().ok, false);
  } finally {
    if (prev === undefined) delete process.env.LOT_UM_SERIAL;
    else process.env.LOT_UM_SERIAL = prev;
  }
});

test("AF는 LED가 꺼져 있으면 건너뛰고, 시리얼 작업은 줄을 세우며, 중지 때 라이브 프레임을 비운다", () => {
  const ps1 = src("um-serial.ps1");
  assert.match(ps1, /reason = "led-off"/);
  assert.match(ps1, /"port-busy"/);
  const js = src("um-serial.js");
  assert.match(js, /queue = job\.catch/);
  const watch = src("watch.js");
  assert.match(watch, /af\?\.reason === "led-off"/);
  assert.match(watch, /liveFrame = null;/);
  const html = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.ok(!html.includes('live.classList.toggle("dim"'), "dim 토글이 refreshLive와 싸우지 않는다");
  assert.match(html, /clearLive\(\)/);
});

test("시리얼 작업은 겹치지 않고 순서대로 돈다", async () => {
  const prevSerial = process.env.LOT_UM_SERIAL;
  process.env.LOT_UM_SERIAL = "0";
  try {
    const { runUmSerial } = await import("../src/um-serial.js");
    const order = [];
    await Promise.all([1, 2, 3].map((n) => runUmSerial({ action: "status" }).then(() => order.push(n))));
    assert.deepEqual(order, [1, 2, 3]);
  } finally {
    if (prevSerial === undefined) delete process.env.LOT_UM_SERIAL;
    else process.env.LOT_UM_SERIAL = prevSerial;
  }
});
