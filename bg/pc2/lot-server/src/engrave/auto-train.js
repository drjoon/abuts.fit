// change-log:
// - 2026-11-28: 유휴 자동 학습. 감시가 N분 쉬고 새 라벨 표본이 있으면 낮은 우선순위의 자식 프로세스로 재학습.
//   부품이 들어오거나 인식이 시작되면 중단. 평가(홀드아웃+코드별)에서 지금 모델 이상이고 틀린 확정이 없을 때만 승격.
//   이전 모델 파일은 남긴다. 매칭·라벨 출력은 하지 않는다.
// related files:
// - bg/pc2/lot-server/scripts/auto-train.mjs
// - bg/pc2/lot-server/src/engrave/eval-run.js
// - bg/pc2/lot-server/src/index.js

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { datasetDir, datasetSummary, listSamples } from "./dataset.js";
import { letterGaps } from "./eval-run.js";
import { currentModelPath, listModelVersions, loadModel, modelsDir } from "./model-store.js";
import { listPending, pendingDir } from "./pending.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export function trainLogFile() {
  return process.env.LOT_TRAIN_LOG || path.join(ROOT, "data", "train-log.jsonl");
}

export function appendTrainLog(entry) {
  const file = trainLogFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const row = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  return row;
}

export function lastTrainLog() {
  const file = trainLogFile();
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

export function lastLabeledAt(root = datasetDir()) {
  let latest = 0;
  for (const s of listSamples(root)) {
    const t = Date.parse(s.meta.createdAt || 0);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest;
}

export function idleMsFromEnv() {
  const min = Number(process.env.LOT_TRAIN_IDLE_MIN);
  if (Number.isFinite(min) && min >= 0) return Math.max(0.5, min) * 60 * 1000;
  const sec = Number(process.env.LOT_TRAIN_IDLE_SEC);
  if (Number.isFinite(sec) && sec >= 0) return Math.max(30, sec) * 1000;
  return 3 * 60 * 1000;
}

export function autoTrainEnabled() {
  return String(process.env.LOT_AUTO_TRAIN ?? "1") !== "0";
}

function isBusyPhase(phase, running) {
  if (!running) return false;
  return ["focusing", "ocr", "moving", "stable"].includes(String(phase || ""));
}

export function createIdleTrainer({
  getWatchStatus = () => ({ running: false, phase: "idle" }),
  log = () => {},
  idleMs = idleMsFromEnv(),
} = {}) {
  let child = null;
  let status = {
    state: "idle",
    message: "새 표본이 쌓이면 유휴 시간에 학습합니다.",
    startedAt: 0,
    lastResult: lastTrainLog(),
  };
  let lastBusyAt = Date.now();
  let lastStartedSamples = 0;
  let timer = null;

  function markBusy() {
    lastBusyAt = Date.now();
    if (child && status.state === "training") abort("부품 작업이 시작되어 학습을 멈췄습니다.");
  }

  function snapshot() {
    const ds = datasetSummary();
    const gaps = letterGaps(ds.letters, 2);
    return {
      ...status,
      enabled: autoTrainEnabled(),
      idleMs,
      dataset: ds,
      letters: ds.letters,
      missingLetters: gaps.missing,
      lowLetters: gaps.low,
      pending: listPending(pendingDir()).length,
      lastTrain: status.lastResult || lastTrainLog(),
      model: (() => {
        try {
          const m = loadModel();
          return m ? { file: path.basename(m.file), meta: m.meta || {} } : null;
        } catch (e) {
          return { error: String(e?.message || e) };
        }
      })(),
      versions: listModelVersions(),
    };
  }

  function abort(reason = "중단") {
    if (!child) return;
    try {
      child.kill("SIGTERM");
    } catch {}
    child = null;
    status = { ...status, state: "idle", message: reason, startedAt: 0 };
    appendTrainLog({ event: "abort", reason });
    log(`auto-train abort: ${reason}`);
  }

  function startTrain({ manual = false } = {}) {
    if (child) return { ok: false, reason: "already-running" };
    if (!manual && isBusyPhase(getWatchStatus()?.phase, getWatchStatus()?.running)) {
      return { ok: false, reason: "busy" };
    }
    const ds = datasetSummary();
    if (ds.boxed <= 0) return { ok: false, reason: "no-samples" };
    if (!manual && lastStartedSamples && ds.boxed <= lastStartedSamples) {
      const last = lastTrainLog();
      if (last && (last.event === "done" || last.event === "rejected") && last.boxed === ds.boxed) {
        return { ok: false, reason: "no-new-data" };
      }
    }
    const last = lastTrainLog();
    if (!manual && last?.event === "done" && last.perfect && last.boxed === ds.boxed) {
      return { ok: false, reason: "already-perfect" };
    }
    const resultFile = path.join(modelsDir(), "last-auto-eval.json");
    const script = path.join(ROOT, "scripts", "auto-train.mjs");
    const args = [script, "--result", resultFile];
    lastStartedSamples = ds.boxed;
    status = {
      ...status,
      state: "training",
      message: "유휴 학습을 실행하는 중입니다.",
      startedAt: Date.now(),
    };
    appendTrainLog({ event: "start", boxed: ds.boxed, manual });
    log(`auto-train start boxed=${ds.boxed} manual=${manual}`);
    const env = { ...process.env, LOT_AUTO_TRAIN_CHILD: "1" };
    child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.on("data", (b) => {
      stderr += b.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.stdout?.on("data", (b) => {
      const line = b.toString().trim();
      if (line) log(`auto-train ${line.slice(0, 200)}`);
    });
    child.on("exit", (code, signal) => {
      const ran = child;
      child = null;
      if (status.state !== "training") return;
      let result = null;
      try {
        if (fs.existsSync(resultFile)) result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      } catch {}
      const ev = result?.event || (code === 0 ? "done" : "error");
      status = {
        state: "idle",
        message: result?.message || (signal ? `학습이 중단되었습니다(${signal}).` : ev === "done" ? "학습이 끝났습니다." : "학습이 실패했습니다."),
        startedAt: 0,
        lastResult: result || { event: ev, code, signal, stderr: stderr.slice(-500) },
      };
      if (!result) appendTrainLog({ event: ev, code, signal, stderr: stderr.slice(-500) });
      log(`auto-train exit code=${code} event=${ev} ${result?.message || ""}`.trim());
    });
    return { ok: true };
  }

  function tick() {
    const st = getWatchStatus() || {};
    if (isBusyPhase(st.phase, st.running)) {
      markBusy();
      return;
    }
    if (!autoTrainEnabled()) return;
    if (Date.now() - lastBusyAt < idleMs) return;
    if (child) return;
    startTrain({ manual: false });
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      try {
        tick();
      } catch (e) {
        log(`auto-train tick ${e?.message || e}`);
      }
    }, 15000);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    abort("서버를 멈추며 학습을 중단했습니다.");
  }

  return { start, stop, tick, markBusy, abort, startTrain, snapshot, status: () => status };
}
