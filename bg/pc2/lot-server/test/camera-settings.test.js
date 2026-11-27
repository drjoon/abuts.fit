// change-log:
// - 2026-11-27: 화질 설정 저장·범위·UvcTool 인자, 대기 목록 코드 집합, 설정 모달 UI.
// related files:
// - bg/pc2/lot-server/src/camera-settings.js
// - bg/pc2/lot-server/src/packing-queue.js
// - bg/pc2/lot-server/public/station.js

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  EV_AUTO,
  loadSettings,
  normalizeSettings,
  recommendedSettings,
  saveSettings,
  uvcSpec,
} from "../src/camera-settings.js";
import { activeLotSuffixes } from "../src/packing-queue.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("권장값은 UVC 밝기 128(255 아님), EV Auto", () => {
  const prev = process.env.LOT_UVC_BRIGHTNESS;
  delete process.env.LOT_UVC_BRIGHTNESS;
  try {
    const rec = recommendedSettings();
    assert.equal(rec.brightness, 128);
    assert.equal(rec.contrast, 128);
    assert.equal(rec.saturation, 128);
    assert.equal(rec.hue, 0);
    assert.equal(rec.ev, EV_AUTO);
  } finally {
    if (prev !== undefined) process.env.LOT_UVC_BRIGHTNESS = prev;
  }
});

test("범위를 맞추고 FLK(7)는 Auto로, 모르는 키는 버린다", () => {
  const s = normalizeSettings({ brightness: 999, hue: -80, ledLevel: 13, ev: 7, evil: 1 });
  assert.equal(s.brightness, 255);
  assert.equal(s.hue, -32);
  assert.equal(s.ledLevel, 12);
  assert.equal(s.ev, EV_AUTO);
  assert.ok(!("evil" in s));
});

test("저장하면 다시 읽고(재시작 후에도), 깨진 파일은 권장값", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "camset-"));
  const file = path.join(dir, "data", "camera-settings.json");
  assert.equal(loadSettings(file).saved, false);
  const saved = saveSettings({ brightness: 120, ledLevel: 3, ev: 11 }, file);
  assert.equal(saved.brightness, 120);
  const again = loadSettings(file);
  assert.equal(again.saved, true);
  assert.equal(again.brightness, 120);
  assert.equal(again.ledLevel, 3);
  assert.equal(again.ev, 11);
  // 일부만 바꾸면 나머지는 유지
  assert.equal(saveSettings({ contrast: 140 }, file).brightness, 120);
  fs.writeFileSync(file, "{broken");
  assert.equal(loadSettings(file).saved, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("UvcTool 인자", () => {
  assert.equal(
    uvcSpec({ brightness: 128, contrast: 130, saturation: 100, hue: 0 }),
    "brightness=128,contrast=130,saturation=100,hue=0",
  );
});

test("대기 목록 코드 집합: lotSuffix 우선, 없으면 lotNumber 끝 3글자", () => {
  const set = activeLotSuffixes({
    data: { items: [{ lotSuffix: "byz" }, { lotNumber: "CA261126-BZA" }, { lotSuffix: "", lotNumber: "x" }] },
  });
  assert.deepEqual([...set].sort(), ["BYZ", "BZA"]);
  assert.equal(activeLotSuffixes({ success: false }), null);
});

test("설정 모달: 톱니 버튼이 카메라 선택·목록 버튼을 대신하고 Esc로 닫힌다", () => {
  const html = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(html, /id="settingsBtn"/);
  assert.ok(!html.includes('id="device"'));
  assert.ok(!html.includes('id="refreshDevices"'));
  const js = fs.readFileSync(path.join(here, "../public/station.js"), "utf8");
  assert.match(js, /\/api\/camera-settings/);
  assert.match(js, /\/api\/camera-preview/);
  assert.match(js, /ev\.key === "Escape"/);
  assert.match(js, /ev\.target === els\.modal/);
});
