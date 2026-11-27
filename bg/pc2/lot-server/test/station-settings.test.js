// related files:
// - bg/pc2/lot-server/src/station-settings.js
// - bg/pc2/lot-server/public/index.html
// - bg/pc2/lot-server/public/station.js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  loadStationSettings,
  normalizeStationSettings,
  recommendedStationSettings,
  saveStationSettings,
} from "../src/station-settings.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("normalizeStationSettings keeps booleans", () => {
  const base = recommendedStationSettings();
  assert.equal(normalizeStationSettings({}, base).autoCommit, base.autoCommit);
  assert.equal(normalizeStationSettings({ autoCommit: false }, base).autoCommit, false);
  assert.equal(normalizeStationSettings({ collectSamples: 0 }, base).collectSamples, false);
  assert.equal(normalizeStationSettings({ collectSamples: 1 }, base).collectSamples, true);
});

test("save and load station settings round-trip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lot-station-"));
  const file = path.join(dir, "station-settings.json");
  const saved = saveStationSettings(
    { autoCommit: false, collectSamples: true },
    file,
  );
  assert.equal(saved.autoCommit, false);
  assert.equal(saved.collectSamples, true);
  assert.equal(saved.saved, true);
  const loaded = loadStationSettings(file);
  assert.equal(loaded.autoCommit, false);
  assert.equal(loaded.collectSamples, true);
  assert.equal(loaded.saved, true);
});

test("work UI keeps station SSOT controls", () => {
  const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  assert.match(html, /id="startWatch"/);
  assert.match(html, /id="stopWatch"/);
  assert.match(html, /id="settingsBtn"/);
  assert.match(html, /id="matchBtn"/);
  assert.match(html, /id="printMatchedBtn"/);
  assert.match(html, /id="errorChip"/);
  assert.match(html, /id="ocrLog"/);
  assert.match(html, /id="requestStrip"/);
  assert.doesNotMatch(html, /id="focusBtn"/);
  assert.doesNotMatch(html, /id="recognizeBtn"/);

  const js = fs.readFileSync(path.join(ROOT, "public/station.js"), "utf8");
  assert.match(js, /\/api\/station-settings/);
  assert.match(js, /autoCommit/);
  assert.match(js, /openErrorHistoryModal/);
  assert.match(js, /autoPrintAfterMatch/);
});
