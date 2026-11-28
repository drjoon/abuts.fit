import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import test from "node:test";
import sharp from "sharp";
import { saveSample, listSamples, datasetSummary } from "../src/engrave/dataset.js";
import { labelPending, listPending, savePending, skipPending } from "../src/engrave/pending.js";
import { letterGaps, shouldPromote } from "../src/engrave/eval-run.js";
import { writeModelFile, promoteModel, currentModelPath } from "../src/engrave/model-store.js";
import { orderRotations, confidentEnough, MIN_P, MARGIN } from "../src/engrave/recognize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("힌트 회전은 맨 앞에 두고, 확신 기준은 엄격 마진 또는 힌트+높은 minP", () => {
  assert.deepEqual(orderRotations([270, 90], 90), [90, 270]);
  assert.deepEqual(orderRotations([90, 270], 180), [90, 270]);
  assert.equal(confidentEnough({ top: "BDZ", minP: 0.99, margin: MARGIN + 0.1 }), true);
  assert.equal(confidentEnough({ top: "BDZ", minP: 0.99, margin: 0.6 }, { hinted: false }), false);
  assert.equal(confidentEnough({ top: "BDZ", minP: 0.99, margin: 0.6 }, { hinted: true }), true);
  assert.equal(confidentEnough({ top: "BDZ", minP: MIN_P - 0.1, margin: 9 }, { hinted: true }), false);
});

test("승격 게이트: 틀린 확정이 있거나 정확도가 떨어지면 올리지 않는다", () => {
  const base = { n: 10, ok: 8, wrongConfirm: 0, accuracy: 0.8 };
  assert.equal(shouldPromote({ n: 10, ok: 9, wrongConfirm: 0, accuracy: 0.9 }, base).ok, true);
  assert.equal(shouldPromote({ n: 10, ok: 8, wrongConfirm: 0, accuracy: 0.8 }, base).ok, true);
  assert.equal(shouldPromote({ n: 10, ok: 10, wrongConfirm: 1, accuracy: 1 }, base).ok, false);
  assert.equal(shouldPromote({ n: 10, ok: 7, wrongConfirm: 0, accuracy: 0.7 }, base).ok, false);
  assert.equal(shouldPromote({ n: 0, ok: 0, wrongConfirm: 0, accuracy: 0 }, base).ok, false);
});

test("글자 표본 빈칸", () => {
  const g = letterGaps({ A: 3, B: 1 }, 2);
  assert.ok(g.missing.includes("C"));
  assert.ok(g.missing.includes("Z"));
  assert.deepEqual(g.low, ["B"]);
  assert.ok(!g.missing.includes("A"));
});

test("미확정 표본은 데이터셋에 안 들어가고, 라벨하면 들어가며, 건너뛰기는 파일을 남긴다", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "engrave-pending-"));
  const pendingRoot = path.join(tmp, "pending");
  const datasetRoot = path.join(tmp, "dataset");
  const skipped = path.join(tmp, "skipped");
  const frame = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 40, g: 40, b: 40 } },
  }).jpeg().toBuffer();
  const profile = { id: "jig-t", name: "t", roi: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, letterH: { min: 0.08, max: 0.16 } };
  const saved = await savePending({ frame, profile, guess: "BDZ", reason: "not_in_queue" }, pendingRoot);
  assert.equal(listSamples(datasetRoot).length, 0);
  assert.equal(listPending(pendingRoot).length, 1);
  assert.equal(saved.meta.guess, "BDZ");
  const labeled = await labelPending(saved.id, "BDZ", { profile, datasetRoot, root: pendingRoot });
  assert.equal(labeled.sample.meta.code, "BDZ");
  assert.equal(labeled.sample.meta.source, "operator-label");
  assert.equal(listSamples(datasetRoot).length, 1);
  assert.equal(listPending(pendingRoot).length, 0);
  const second = await savePending({ frame, profile, guess: "BZE", reason: "not_in_queue" }, pendingRoot);
  const moved = skipPending(second.id, { root: pendingRoot, dest: skipped });
  assert.equal(listPending(pendingRoot).length, 0);
  assert.ok(fs.existsSync(path.join(moved.dir, "meta.json")));
});

test("writeModelFile은 current를 바꾸지 않고, promote만 바꾼다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engrave-models-"));
  const prev = path.join(dir, "model-prev.json");
  fs.writeFileSync(prev, JSON.stringify({ meta: { tag: "prev" }, weights: [] }));
  fs.writeFileSync(path.join(dir, "current.json"), JSON.stringify({ file: "model-prev.json", previous: null, at: "x" }));
  const { name } = writeModelFile({ meta: { tag: "cand" }, hidden: 1, outDim: 1, w1: [], b1: [], w2: [], b2: [] }, dir);
  const cur = JSON.parse(fs.readFileSync(path.join(dir, "current.json"), "utf8"));
  assert.equal(cur.file, "model-prev.json");
  assert.ok(fs.existsSync(path.join(dir, name)));
  promoteModel(name, dir);
  const after = JSON.parse(fs.readFileSync(path.join(dir, "current.json"), "utf8"));
  assert.equal(after.file, name);
  assert.equal(after.previous, "model-prev.json");
  assert.ok(fs.existsSync(prev));
});
