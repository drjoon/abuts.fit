// change-log:
// - 2026-11-27: 각인 전용 인식·지그 프로필·데이터셋·모델 버전 테스트. 실측 프레임: BYU(지그 1), BYK(지그 1), BDZ(11-26 배치).
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/src/engrave/dataset.js
// - bg/pc2/lot-server/src/engrave/model-store.js
// - bg/pc2/lot-server/src/jig-profiles.js
// - bg/pc2/lot-server/test/fixtures/engrave-annotations.json

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { rotateBox, rotateGray, rotatePoint } from "../src/engrave/crops.js";
import { boxesToRoi } from "../src/engrave/annotations.js";
import { datasetSummary, listSamples, saveSample } from "../src/engrave/dataset.js";
import { DEFAULT_MODEL, currentModelPath, listModelVersions, saveModelVersion } from "../src/engrave/model-store.js";
import { createMlp, toJson } from "../src/engrave/mlp.js";
import { locateCode, recognizeEngraving } from "../src/engrave/recognize.js";
import { DEFAULT_PROFILE, duplicateProfile, loadProfiles, normalizeProfile, selectProfile, upsertProfile } from "../src/jig-profiles.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => path.join(here, "fixtures", name);
const ann = JSON.parse(fs.readFileSync(fx("engrave-annotations.json"), "utf8"));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
// 2026-11-27 14:2x 세척.패킹 대기 목록(BYU는 이미 포장.발송).
const QUEUE = ["BYZ", "BZA", "BZB", "BZC", "BYY", "BYW", "BYX", "BYV", "BYT", "BYK"];

test("회전: rotateGray와 rotatePoint/rotateBox가 같은 규칙", () => {
  const w = 5;
  const h = 3;
  const g = Uint8Array.from({ length: w * h }, (_, i) => i);
  for (const a of [0, 90, 180, 270]) {
    const r = rotateGray(g, w, h, a);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const [nx, ny] = rotatePoint(x, y, w, h, a);
        assert.equal(r.gray[ny * r.width + nx], g[y * w + x], `a=${a} (${x},${y})`);
      }
    }
  }
  assert.deepEqual(rotateBox([1, 0, 3, 2], w, h, 90), [0, 1, 2, 3]);
});

test("지그 프로필: 정규화·저장·복제·선택", () => {
  const file = path.join(tmp("jig-"), "jig-profiles.json");
  const s0 = loadProfiles(file);
  assert.equal(s0.active, DEFAULT_PROFILE.id);
  const n = normalizeProfile({ id: "a b!", roi: { x: 0.9, y: -1, w: 0.5, h: 2 }, letterH: { min: 0.3, max: 0.1 } });
  assert.equal(n.id, "ab");
  assert.ok(n.roi.x + n.roi.w <= 1 && n.roi.y === 0 && n.roi.h <= 1);
  assert.ok(n.letterH.min <= n.letterH.max);
  const { profile } = upsertProfile({ id: "jig-2", name: "지그 2", roi: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }, { activate: true }, file);
  assert.equal(loadProfiles(file).active, "jig-2");
  assert.deepEqual(profile.roi, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  const dup = duplicateProfile("jig-2", "지그 3", file).profile;
  assert.notEqual(dup.id, "jig-2");
  assert.deepEqual(dup.roi, profile.roi);
  assert.equal(loadProfiles(file).active, dup.id);
  selectProfile(DEFAULT_PROFILE.id, file);
  assert.equal(loadProfiles(file).active, DEFAULT_PROFILE.id);
  assert.throws(() => selectProfile("nope", file));
});

test("데이터셋: 라벨 → ROI 상대 상자 → 글자 크롭·meta 저장(지그와 무관한 좌표)", async () => {
  const root = tmp("eds-");
  const f = ann.frames.find((x) => x.code === "BYK");
  const frame = fs.readFileSync(fx(f.file));
  const md = await sharp(frame).metadata();
  const profile = normalizeProfile(ann.profiles[f.profile]);
  const boxes = boxesToRoi(f.boxesRotated, f.rotation, { width: md.width, height: md.height }, profile.roi);
  for (const b of boxes) for (const v of b) assert.ok(v >= 0 && v <= 1, `box ${b}`);
  const { dir, meta } = await saveSample({ frame, code: f.code, profile, rotation: f.rotation, boxes, source: "test" }, root);
  assert.equal(meta.code, "BYK");
  assert.equal(meta.letters.length, 3);
  for (const l of meta.letters) {
    const m = await sharp(path.join(dir, l.file)).metadata();
    assert.equal(m.width, 32);
    assert.equal(m.height, 48);
  }
  assert.ok(fs.existsSync(path.join(dir, "roi.jpg")) && fs.existsSync(path.join(dir, "frame.jpg")));
  assert.equal(listSamples(root).length, 1);
  assert.equal(datasetSummary(root).letters.K, 1);
  await assert.rejects(saveSample({ frame, code: "B1", profile, rotation: 0, boxes: null }, root));
});

test("모델 버전: 새 버전을 쌓고 이전 파일은 남긴다", () => {
  const dir = tmp("models-");
  const json = toJson(createMlp(240, 4, 27, 1), { test: true });
  const a = saveModelVersion(json, dir);
  const prev = process.env.LOT_ENGRAVE_MODELS;
  process.env.LOT_ENGRAVE_MODELS = dir;
  try {
    assert.equal(currentModelPath(dir), a);
    const wait = Date.now() + 1100;
    while (Date.now() < wait);
    const b = saveModelVersion(json, dir);
    assert.equal(currentModelPath(dir), b);
    assert.ok(fs.existsSync(a));
    assert.equal(listModelVersions(dir).length, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "current.json"), "utf8")).previous, path.basename(a));
  } finally {
    if (prev === undefined) delete process.env.LOT_ENGRAVE_MODELS;
    else process.env.LOT_ENGRAVE_MODELS = prev;
  }
});

test("기본 모델이 들어 있다", () => {
  assert.ok(fs.existsSync(DEFAULT_MODEL));
});

test("실측 프레임: 목록에 있으면 맞는 코드, 목록에 없으면 어떤 코드로도 확정하지 않는다", { timeout: 240000 }, async () => {
  const cases = ["um20-byu-b128-a.jpg", "um20-byk-a.jpg", "um20-bdz-focused.jpg", "umviewer-byu-a.jpg"];
  for (const name of cases) {
    const f = ann.frames.find((x) => x.file === name);
    const frame = fs.readFileSync(fx(name));
    const profile = normalizeProfile(ann.profiles[f.profile]);
    const hit = await recognizeEngraving(frame, { profile, allowed: [...QUEUE, "BYU", "BDZ"] });
    assert.equal(hit.success, true, `${name}: ${hit.reason} top=${hit.top}`);
    assert.equal(hit.lot, f.code, name);
    assert.equal(hit.rotation, f.rotation, name);
    const without = await recognizeEngraving(frame, { profile, allowed: QUEUE.filter((c) => c !== f.code) });
    assert.equal(without.success, false, `${name} -> ${without.lot}`);
  }
});

test("밝기 255로 날아간 BYU: 대기 목록 BYU 없이 성공하지 않는다", { timeout: 60000 }, async () => {
  const profile = normalizeProfile(ann.profiles["jig-1"]);
  const r = await recognizeEngraving(fs.readFileSync(fx("um20-byu-b255-washed.jpg")), { profile, allowed: QUEUE });
  assert.equal(r.success, false, r.lot);
});

test("locateCode: 알려진 코드의 글자 위치(데이터 수집용)", { timeout: 60000 }, async () => {
  const f = ann.frames.find((x) => x.file === "um20-byu-b128-b.jpg");
  const frame = fs.readFileSync(fx(f.file));
  const profile = normalizeProfile(ann.profiles[f.profile]);
  const md = await sharp(frame).metadata();
  const truth = boxesToRoi(f.boxesRotated, f.rotation, { width: md.width, height: md.height }, profile.roi);
  const loc = await locateCode(frame, "BYU", { profile });
  assert.ok(loc && loc.meanP > 0.35);
  assert.equal(loc.rotation, 90);
  for (let i = 0; i < 3; i += 1) {
    const c = (loc.boxes[i][0] + loc.boxes[i][2]) / 2;
    const t = (truth[i][0] + truth[i][2]) / 2;
    assert.ok(Math.abs(c - t) < 0.05, `letter ${i}: ${c} vs ${t}`);
  }
});
