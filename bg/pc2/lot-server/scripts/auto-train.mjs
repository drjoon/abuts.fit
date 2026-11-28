// change-log:
// - 2026-11-28: 유휴 자동 학습 자식 프로세스. 학습·평가만 하고 매칭·출력 API는 부르지 않는다.
//   지금 모델보다 정확도가 낮거나 틀린 확정이 있으면 current.json을 바꾸지 않는다.
// usage: node scripts/auto-train.mjs [--result FILE] [--synth 2000] [--epochs 12]
// related files:
// - bg/pc2/lot-server/src/engrave/auto-train.js
// - bg/pc2/lot-server/scripts/train-engrave.mjs

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { fromJson } from "../src/engrave/mlp.js";
import { currentModelPath, loadModel, modelsDir, promoteModel, writeModelFile } from "../src/engrave/model-store.js";
import { datasetDir, datasetSummary } from "../src/engrave/dataset.js";
import {
  evaluateCases,
  loadDatasetCases,
  loadFixtureCases,
  pickHoldoutDirs,
  shouldPromote,
} from "../src/engrave/eval-run.js";
import { appendTrainLog } from "../src/engrave/auto-train.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name, d = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};

try {
  os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch {}

const resultFile = flag("--result", path.join(modelsDir(), "last-auto-eval.json"));
const synth = flag("--synth", process.env.LOT_TRAIN_SYNTH || "2000");
const epochs = flag("--epochs", process.env.LOT_TRAIN_EPOCHS || "12");
const hidden = flag("--hidden", "96");
const mine = flag("--mine", "3");

function writeResult(obj) {
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  const row = { at: new Date().toISOString(), ...obj };
  fs.writeFileSync(resultFile, JSON.stringify(row, null, 2));
  appendTrainLog(row);
  console.log(JSON.stringify({ event: row.event, message: row.message, accuracy: row.accuracy }));
  return row;
}

function runTrain(outFile, holdoutDirs) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(root, "scripts", "train-engrave.mjs"),
      "--synth",
      String(synth),
      "--epochs",
      String(epochs),
      "--hidden",
      String(hidden),
      "--mine",
      String(mine),
      "--out",
      outFile,
    ];
    if (holdoutDirs?.length) {
      args.push("--holdout-dirs", holdoutDirs.join(path.delimiter));
    }
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => {
      out += b.toString();
      const lines = b.toString().trim().split("\n");
      for (const line of lines) if (line) console.log(line);
    });
    child.stderr.on("data", (b) => {
      err += b.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`train exit ${code}: ${err.slice(-400)}`));
      else resolve({ out, err });
    });
  });
}

const ds = datasetSummary();
const holdoutDirs = pickHoldoutDirs(datasetDir());
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const candPath = path.join(modelsDir(), `model-${stamp}-auto.json`);

try {
  console.log(`[auto-train] boxed=${ds.boxed} holdout=${holdoutDirs.length}`);
  await runTrain(candPath, holdoutDirs);
  if (!fs.existsSync(candPath)) throw new Error("모델 파일이 만들어지지 않았습니다.");
  const candJson = JSON.parse(fs.readFileSync(candPath, "utf8"));
  const candModel = fromJson(candJson);
  // writeModelFile-style name already used; keep this file, do not promote yet
  const fixtures = loadFixtureCases({ skipWashed: true });
  const holdout = holdoutDirs.length ? loadDatasetCases({ holdoutDirs }) : [];
  const datasetAll = loadDatasetCases();
  // 홀드아웃이 없으면 fixtures + 데이터셋(학습에 들어갔을 수 있음 — 틀린 확정 검사용)
  const cases = [...fixtures, ...(holdout.length ? holdout : datasetAll)];
  const queue = [...new Set(cases.map((c) => c.code))];
  const candEval = await evaluateCases(candModel, cases, { queue });
  let baseEval = { n: 0, ok: 0, wrongConfirm: 0, accuracy: 0 };
  const cur = loadModel();
  if (cur?.model) baseEval = await evaluateCases(cur.model, cases, { queue });
  const gate = shouldPromote(candEval, baseEval);
  const perCode = candEval.byCode;
  const perfect = candEval.n > 0 && candEval.ok === candEval.n && candEval.wrongConfirm === 0;
  let promoted = false;
  if (gate.ok) {
    const name = path.basename(candPath);
    // current.json이 model-*-auto.json 을 가리키게
    promoteModel(name);
    promoted = true;
  }
  writeResult({
    event: gate.ok ? "done" : "rejected",
    message: gate.ok
      ? perfect
        ? "평가 100%로 새 모델을 올렸습니다."
        : `새 모델을 올렸습니다(정확도 ${(candEval.accuracy * 100).toFixed(1)}%).`
      : `승격하지 않았습니다: ${gate.reason}`,
    promoted,
    perfect,
    boxed: ds.boxed,
    file: path.basename(candPath),
    accuracy: candEval.accuracy,
    baseline: baseEval.accuracy,
    wrongConfirm: candEval.wrongConfirm,
    baselineWrong: baseEval.wrongConfirm,
    n: candEval.n,
    holdout: holdout.length,
    fixtures: fixtures.length,
    perCode,
    reason: gate.reason,
  });
  process.exit(0);
} catch (e) {
  writeResult({
    event: "error",
    message: String(e?.message || e),
    boxed: ds.boxed,
    file: fs.existsSync(candPath) ? path.basename(candPath) : "",
  });
  process.exit(1);
}
