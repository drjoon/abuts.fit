// change-log:
// - 2026-11-27: 각인 글자 분류기 다시 학습. 합성 각인 + 데이터셋의 모든 실측 표본을 합쳐 MLP를 학습하고
//   data/engrave-models/model-<시각>.json으로 새 버전을 저장(이전 버전은 남김), current.json을 새 버전으로 바꾼다.
//   어려운 배경 찾기(--mine 회): 학습한 모델로 실측 ROI를 훑어 글자로 잘못 읽힌 배경 칸을 더해 이어서 학습한다.
// usage: npm run train:engrave -- [--synth 2500] [--epochs 14] [--hidden 96] [--mine 3] [--exclude BYK,BDZ]
//        [--focus V,W,T] [--dataset DIR] [--out FILE | --default] [--seed 1]
// related files:
// - bg/pc2/lot-server/src/engrave/train-data.js
// - bg/pc2/lot-server/src/engrave/model-store.js
// - bg/pc2/lot-server/README.md

import fs from "fs";
import path from "path";
import { FEAT_DIM } from "../src/engrave/features.js";
import { CLASSES, createMlp, toJson, train } from "../src/engrave/mlp.js";
import { DEFAULT_MODEL, saveModelVersion, writeModelFile } from "../src/engrave/model-store.js";
import { datasetDir } from "../src/engrave/dataset.js";
import { backgroundPool, bgSourceFrom, mineNegatives, realSet, synthSet } from "../src/engrave/train-data.js";
import { FOCUS_LETTERS } from "../src/engrave/synth.js";

const args = process.argv.slice(2);
const flag = (name, d = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const has = (name) => args.includes(name);
const synthN = Number(flag("--synth", "2000"));
const epochs = Number(flag("--epochs", "12"));
const mineRounds = Number(flag("--mine", "3"));
const hidden = Number(flag("--hidden", "96"));
const seed = Number(flag("--seed", "1"));
const exclude = (flag("--exclude", "") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const excludeDirs = (flag("--holdout-dirs", "") || "").split(path.delimiter).map((s) => s.trim()).filter(Boolean);

const focusFlag = (flag("--focus", "") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
// 홀드아웃·희소 글자 편향(너무 세게 넣지 않음 — 실측 마진 유지).
const focusLetters = [...new Set([...FOCUS_LETTERS, ...focusFlag, ...exclude.join("")])].filter((c) => /[A-Z]/.test(c));
const root = flag("--dataset", datasetDir());
const realWeight = Number(flag("--real-weight", "2.5"));
const log = (m) => console.log(`[train] ${m}`);

const t0 = Date.now();
log(`합성 ${synthN}장 만드는 중… (focus ${focusLetters.join("") || "-"})`);
const pool = has("--no-real-bg") ? [] : await backgroundPool(root, { exclude });
log(`실측 바탕 조각 ${pool.length}`);
const syn = await synthSet(synthN, seed, log, { bgSource: bgSourceFrom(pool), focusLetters });
log(`합성 칸 ${syn.X.length}`);
const real = await realSet(root, { exclude, excludeDirs, log });
const X = [...syn.X, ...real.X];
const Y = [...syn.Y, ...real.Y];
const W = [...syn.X.map(() => 1), ...real.X.map(() => realWeight)];
const m = createMlp(FEAT_DIM, hidden, CLASSES.length, seed + 6);
train(m, X, Y, { epochs, lr: 0.02, momentum: 0.9, decay: 2e-5, weights: W, seed: seed + 10, log });
let mined = 0;
for (let round = 1; round <= mineRounds; round += 1) {
  const neg = await mineNegatives(m, root, { exclude, excludeDirs, seed: seed + round * 31, log });
  if (!neg.X.length) break;
  mined += neg.X.length;
  X.push(...neg.X);
  Y.push(...neg.Y);
  W.push(...neg.X.map(() => realWeight));
  train(m, X, Y, { epochs: Math.max(3, Math.round(epochs / 2)), lr: 0.01, momentum: 0.9, decay: 2e-5, weights: W, seed: seed + 10 + round, log });
}
const meta = {
  trainedAt: new Date().toISOString(),
  synth: synthN,
  synthCells: syn.X.length,
  realSamples: real.used.length,
  realCells: real.X.length,
  minedNegatives: mined,
  realBackgrounds: pool.length,
  mineRounds,
  exclude,
  focusLetters,
  epochs,
  hidden,
  realWeight,
  seconds: Math.round((Date.now() - t0) / 1000),
};
const json = toJson(m, meta);
let file;
if (flag("--out")) {
  file = flag("--out");
  fs.writeFileSync(file, JSON.stringify(json));
} else if (has("--default")) {
  file = DEFAULT_MODEL;
  fs.writeFileSync(file, JSON.stringify(json));
} else if (has("--no-promote")) {
  file = writeModelFile(json).file;
} else {
  file = saveModelVersion(json);
}
log(`저장: ${file} (${meta.seconds}s)`);
