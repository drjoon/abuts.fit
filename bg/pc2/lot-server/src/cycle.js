// change-log:
// - 2026-11-28: 패킹 한 바퀴(꽂기→인식→매칭·출력→제거) 상태와 시간 기록.
//   파일: data/cycle-log.jsonl (LOT_CYCLE_LOG). 작업 화면 HUD·통계 API가 쓴다.
// related files:
// - bg/pc2/lot-server/src/watch.js
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/public/station.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const CYCLE = {
  IDLE: "idle",
  WAITING: "waiting",
  MOVING: "moving",
  FOCUSING: "focusing",
  RECOGNIZING: "recognizing",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  MATCHED: "matched",
  PRINTED: "printed",
  WAIT_REMOVAL: "wait_removal",
  ERROR: "error",
};

const WATCH_TO_CYCLE = {
  idle: CYCLE.WAITING,
  moving: CYCLE.MOVING,
  stable: CYCLE.WAITING,
  focusing: CYCLE.FOCUSING,
  ocr: CYCLE.RECOGNIZING,
  hold: CYCLE.WAIT_REMOVAL,
  error: CYCLE.ERROR,
};

export function cycleFromWatchPhase(phase, extra = {}) {
  if (extra.rejected) return CYCLE.REJECTED;
  if (extra.printed) return CYCLE.PRINTED;
  if (extra.matched) return CYCLE.MATCHED;
  if (extra.confirmed) return CYCLE.CONFIRMED;
  return WATCH_TO_CYCLE[phase] || CYCLE.IDLE;
}

/** 작업자에게 보여줄 다음 행동. */
export function cyclePrompt(state) {
  const code = state.code || "";
  switch (state.stage) {
    case CYCLE.IDLE:
      return { tone: "idle", title: "", message: "감시를 시작하면 부품을 걸 수 있습니다." };
    case CYCLE.WAITING:
      return { tone: "wait", title: "", message: "지그에 다음 제품을 거세요." };
    case CYCLE.MOVING:
      return { tone: "wait", title: "", message: "움직임 · 멈추면 읽습니다." };
    case CYCLE.FOCUSING:
      return { tone: "wait", title: "", message: "초점 맞추는 중…" };
    case CYCLE.RECOGNIZING:
      return { tone: "wait", title: "", message: "인식 중…" };
    case CYCLE.CONFIRMED:
      return { tone: "ok", title: code, message: "인식됨 · 매칭·출력 중…" };
    case CYCLE.REJECTED:
      return { tone: "bad", title: code, message: "대기 목록에 없습니다. 제품을 확인하세요." };
    case CYCLE.MATCHED:
      return { tone: "ok", title: code, message: "포장.발송으로 이동 · 라벨 출력 중…" };
    case CYCLE.PRINTED:
      return { tone: "ok", title: code, message: "라벨 출력됨 · 제거하고 팩에 담으세요." };
    case CYCLE.WAIT_REMOVAL:
      return {
        tone: state.code ? "ok" : "wait",
        title: code,
        message: state.code ? "제거하고 팩에 담은 뒤 다음 제품을 거세요." : "제품을 빼면 다음을 읽습니다.",
      };
    case CYCLE.ERROR:
      return { tone: "bad", title: code, message: state.error || "오류 · 설정 또는 초점 확인." };
    default:
      return { tone: "idle", title: "", message: "" };
  }
}

export function cycleLogFile() {
  return process.env.LOT_CYCLE_LOG || path.join(ROOT, "data", "cycle-log.jsonl");
}

export function appendCycle(event, file = cycleLogFile()) {
  const row = { at: new Date().toISOString(), ...event };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
  return row;
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function summarizeCycles({ file = cycleLogFile(), since = startOfTodayIso(), limit = 4000 } = {}) {
  const rows = [];
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split(/\n/).filter(Boolean);
    const slice = lines.slice(-limit);
    for (const line of slice) {
      try {
        const row = JSON.parse(line);
        if (!since || String(row.at) >= since) rows.push(row);
      } catch {}
    }
  }
  const byKind = {};
  const recognizeMs = [];
  const cycleMs = [];
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    if (r.kind === "recognized" && Number(r.ms) > 0) recognizeMs.push(Number(r.ms));
    if (r.kind === "removed" && Number(r.cycleMs) > 0) cycleMs.push(Number(r.cycleMs));
  }
  const median = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };
  return {
    since,
    events: rows.length,
    counts: byKind,
    recognized: byKind.recognized || 0,
    rejected: byKind.rejected || 0,
    printed: byKind.printed || 0,
    medianRecognizeMs: median(recognizeMs),
    medianCycleMs: median(cycleMs),
  };
}

/** 한 작업 세션의 현재 바퀴. */
export function createCycleTracker({ logFile = cycleLogFile(), write = true } = {}) {
  let stage = CYCLE.IDLE;
  let code = "";
  let error = "";
  let startedAt = 0;
  let recognizedAt = 0;
  const emit = (kind, extra = {}) => {
    const ev = { kind, stage, code, error: error || undefined, ...extra };
    if (write && kind !== "tick") appendCycle(ev, logFile);
    return ev;
  };
  return {
    snapshot() {
      return { stage, code, error, startedAt, recognizedAt, ...cyclePrompt({ stage, code, error }) };
    },
    watchPhase(phase, extra) {
      const next = cycleFromWatchPhase(phase, extra);
      if (next === CYCLE.MOVING && (stage === CYCLE.PRINTED || stage === CYCLE.WAIT_REMOVAL || stage === CYCLE.CONFIRMED || stage === CYCLE.MATCHED || stage === CYCLE.REJECTED)) {
        const cycleMs = startedAt ? Date.now() - startedAt : undefined;
        stage = CYCLE.MOVING;
        const ev = emit("removed", { cycleMs, prevCode: code });
        code = "";
        error = "";
        startedAt = 0;
        return ev;
      }
      if (next === CYCLE.WAITING && !startedAt) startedAt = Date.now();
      if (next === CYCLE.MOVING && !code) startedAt = Date.now();
      stage = next;
      return emit("tick", { phase });
    },
    recognized(lot, { ms } = {}) {
      code = lot;
      error = "";
      recognizedAt = Date.now();
      if (!startedAt) startedAt = recognizedAt;
      stage = CYCLE.CONFIRMED;
      return emit("recognized", { ms });
    },
    rejected(lot, { ms, reason } = {}) {
      code = lot || "";
      error = reason || "대기 목록에 없습니다.";
      stage = CYCLE.REJECTED;
      return emit("rejected", { ms, reason });
    },
    matched(lot) {
      code = lot || code;
      stage = CYCLE.MATCHED;
      return emit("matched");
    },
    printed(lot) {
      code = lot || code;
      stage = CYCLE.PRINTED;
      return emit("printed");
    },
    fail(message) {
      error = message || "오류";
      stage = CYCLE.ERROR;
      return emit("error");
    },
    reset() {
      stage = CYCLE.IDLE;
      code = "";
      error = "";
      startedAt = 0;
      recognizedAt = 0;
      return emit("reset");
    },
  };
}
