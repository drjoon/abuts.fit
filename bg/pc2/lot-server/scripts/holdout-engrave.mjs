// change-log:
// - 2026-11-27: 홀드아웃 정확도 측정.
//   · --codes BYV,BYW: 해당 코드를 학습에서 제외(leave-one-code). 실측이 없는 글자(V/W/T…)는 합성에 의존.
//   · --lof: 표본이 2장↑인 코드에서 프레임 1장을 남겨 두고(학습 exclude는 코드 단위가 아니라
//     임시 데이터셋에서 그 표본 폴더만 제외) leave-one-frame. 같은 글자의 다른 장 일반화 측정.
// usage: node scripts/holdout-engrave.mjs [--codes BYV,BYW,BYT] [--lof] [--synth 1500] [--epochs 10]
//        [--hidden 96] [--mine 2] [--out-dir D:\tmp\engrave-holdout] [--queue ...]
// related files:
// - bg/pc2/lot-server/scripts/train-engrave.mjs
// - bg/pc2/lot-server/scripts/eval-engrave.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { datasetDir, listSamples } from "../src/engrave/dataset.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name, d = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const has = (name) => args.includes(name);

const samples = listSamples(datasetDir());
const counts = new Map();
for (const s of samples) counts.set(s.meta.code, (counts.get(s.meta.code) || 0) + 1);

const outDir = flag("--out-dir", path.join("D:", "tmp", "engrave-holdout"));
fs.mkdirSync(outDir, { recursive: true });
const synth = flag("--synth", "1500");
const epochs = flag("--epochs", "10");
const hidden = flag("--hidden", "96");
const mine = flag("--mine", "2");
const queue = flag("--queue", "BYZ,BZA,BZB,BZC,BYY,BYW,BYX,BYV,BYT,BYK,BYU,BDZ");
const summary = [];

function runTrain(extraArgs, modelPath) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "train-engrave.mjs"),
      "--synth",
      synth,
      "--epochs",
      epochs,
      "--hidden",
      hidden,
      "--mine",
      mine,
      "--out",
      modelPath,
      ...extraArgs,
    ],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );
}

function runEval(modelPath, only) {
  const evalArgs = [
    path.join(root, "scripts", "eval-engrave.mjs"),
    "--model",
    modelPath,
    "--only",
    only,
    "--queue",
    queue,
    "--skip-washed",
  ];
  const ev = spawnSync(process.execPath, evalArgs, { cwd: root, encoding: "utf8" });
  process.stdout.write(ev.stdout || "");
  process.stderr.write(ev.stderr || "");
  const m = /정답 확정 (\d+)\/(\d+)/.exec(ev.stdout || "");
  return { ok: m ? Number(m[1]) : 0, n: m ? Number(m[2]) : 0 };
}

if (has("--lof")) {
  // leave-one-frame: 코드당 표본 ≥2인 것에서 마지막 표본 1장을 임시 데이터셋에서 빼고 학습
  const byCode = new Map();
  for (const s of samples) {
    if (!byCode.has(s.meta.code)) byCode.set(s.meta.code, []);
    byCode.get(s.meta.code).push(s);
  }
  const targets = [...byCode.entries()].filter(([, list]) => list.length >= 2);
  console.log(`[holdout-lof] ${targets.map(([c, list]) => `${c}×${list.length}`).join(", ")}`);
  for (const [code, list] of targets) {
    const held = list[list.length - 1];
    const tmpRoot = path.join(outDir, `lof-ds-${code}`);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    for (const s of list.slice(0, -1)) {
      const day = path.basename(path.dirname(s.dir));
      const name = path.basename(s.dir);
      const dest = path.join(tmpRoot, "samples", day, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(s.dir, dest, { recursive: true });
    }
    const modelPath = path.join(outDir, `lof-${code}.json`);
    console.log(`\n=== lof ${code} hold=${path.basename(held.dir)} ===`);
    const train = runTrain(["--dataset", tmpRoot, "--focus", [...code].join(",")], modelPath);
    if (train.status !== 0) {
      summary.push({ mode: "lof", code, ok: 0, n: 0, error: "train-failed" });
      continue;
    }
    // 홀드 프레임만 fixtures에서 같은 코드로 평가(시드 파일명이 meta.extra.seedFile에 있으면 그걸 only로는 못 씀 → 코드 단위)
    const r = runEval(modelPath, code);
    summary.push({ mode: "lof", code, ...r, hold: path.basename(held.dir), error: null });
  }
} else {
  let codes = (flag("--codes", "") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) {
    codes = [...counts.entries()].filter(([, n]) => n > 0 && n <= 2).map(([c]) => c).sort();
    if (!codes.length) codes = [...counts.keys()].sort();
  }
  console.log(`[holdout] codes=${codes.join(",")} samples=${JSON.stringify(Object.fromEntries(counts))}`);
  for (const code of codes) {
    const modelPath = path.join(outDir, `holdout-${code}.json`);
    console.log(`\n=== holdout ${code} → ${modelPath} ===`);
    const train = runTrain(["--exclude", code, "--focus", [...code].join(",")], modelPath);
    if (train.status !== 0) {
      summary.push({ mode: "loc", code, ok: 0, n: 0, error: "train-failed" });
      continue;
    }
    const r = runEval(modelPath, code);
    summary.push({ mode: "loc", code, ...r, error: null });
  }
}

console.log("\n=== holdout summary ===");
let ok = 0;
let n = 0;
for (const row of summary) {
  console.log(`  ${row.mode || "loc"} ${row.code}: ${row.ok}/${row.n}${row.error ? ` (${row.error})` : ""}`);
  ok += row.ok;
  n += row.n;
}
console.log(`합계 ${ok}/${n}`);
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ at: new Date().toISOString(), summary, ok, n }, null, 2));
if (n > 0 && ok < n) process.exitCode = 1;
