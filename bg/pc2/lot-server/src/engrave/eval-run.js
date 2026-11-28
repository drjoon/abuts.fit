// change-log:
// - 2026-11-28: 모델 게이트 평가. 맞힌 수·틀린 확정(다른 코드를 성공으로 낸 것)을 센다.
//   자동 학습은 이 결과로만 승격하고, 매칭·출력은 하지 않는다.
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/scripts/eval-engrave.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { recognizeEngraving } from "./recognize.js";
import { datasetDir, listSamples } from "./dataset.js";
import { normalizeProfile } from "../jig-profiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadFixtureCases({ skipWashed = true, annotationsPath } = {}) {
  const annFile = annotationsPath || path.join(__dirname, "../../test/fixtures/engrave-annotations.json");
  if (!fs.existsSync(annFile)) return [];
  const ann = JSON.parse(fs.readFileSync(annFile, "utf8"));
  const out = [];
  for (const f of ann.frames || []) {
    if (skipWashed && (f.evalOnly || /washed|b255/i.test(f.file))) continue;
    const file = path.resolve(path.dirname(annFile), f.file);
    if (!fs.existsSync(file)) continue;
    out.push({
      id: f.file,
      code: f.code,
      profile: normalizeProfile(ann.profiles[f.profile]),
      frame: () => fs.readFileSync(file),
      source: "fixture",
    });
  }
  return out;
}

export function loadDatasetCases({ root = datasetDir(), holdoutDirs = null } = {}) {
  const hold = holdoutDirs ? new Set([...holdoutDirs].map((d) => path.resolve(d))) : null;
  const out = [];
  for (const { dir, meta } of listSamples(root)) {
    if (!meta.boxes || !/^[A-Z]{3}$/.test(meta.code || "")) continue;
    if (hold && !hold.has(path.resolve(dir))) continue;
    const framePath = path.join(dir, "frame.jpg");
    if (!fs.existsSync(framePath)) continue;
    out.push({
      id: `dataset:${path.basename(dir)}`,
      code: meta.code,
      profile: normalizeProfile({
        id: meta.profileId || "jig-1",
        name: meta.profileName,
        roi: meta.roi,
        letterH: meta.letterH,
        rotations: meta.rotation != null ? [meta.rotation, 0, 90, 180, 270] : undefined,
      }),
      frame: () => fs.readFileSync(framePath),
      source: "dataset",
    });
  }
  return out;
}

/** 코드당 표본이 2장 이상이면 가장 최근 1장을 홀드아웃. */
export function pickHoldoutDirs(root = datasetDir()) {
  const byCode = new Map();
  for (const s of listSamples(root)) {
    if (!s.meta.boxes) continue;
    const list = byCode.get(s.meta.code) || [];
    list.push(s);
    byCode.set(s.meta.code, list);
  }
  const dirs = [];
  for (const list of byCode.values()) {
    if (list.length < 2) continue;
    dirs.push(list[list.length - 1].dir);
  }
  return dirs;
}

export function emptyReport() {
  return { n: 0, ok: 0, wrongConfirm: 0, miss: 0, accuracy: 0, byCode: {}, cases: [] };
}

/**
 * @param {object} model
 * @param {{ id: string, code: string, profile: object, frame: () => Buffer }[]} cases
 * @param {{ queue?: string[] }} [opts]
 */
export async function evaluateCases(model, cases, { queue = null } = {}) {
  const report = emptyReport();
  for (const c of cases) {
    const allowed = queue || null;
    const r = await recognizeEngraving(c.frame(), { profile: c.profile, allowed, model });
    const truth = c.code;
    const hit = Boolean(r.success && r.lot === truth);
    const wrong = Boolean(r.success && r.lot && r.lot !== truth);
    report.n += 1;
    if (hit) report.ok += 1;
    if (wrong) report.wrongConfirm += 1;
    if (!r.success) report.miss += 1;
    const row = report.byCode[truth] || { n: 0, ok: 0, wrongConfirm: 0 };
    row.n += 1;
    if (hit) row.ok += 1;
    if (wrong) row.wrongConfirm += 1;
    report.byCode[truth] = row;
    report.cases.push({
      id: c.id,
      code: truth,
      success: r.success,
      lot: r.lot || "",
      top: r.top || "",
      reason: r.reason || "",
      hit,
      wrong,
    });
  }
  report.accuracy = report.n ? report.ok / report.n : 0;
  return report;
}

/** 새 모델이 지금 모델 이상이고, 틀린 확정이 없을 때만 승격. */
export function shouldPromote(candidate, baseline) {
  const candAcc = candidate?.accuracy ?? 0;
  const baseAcc = baseline?.accuracy ?? 0;
  const wrong = candidate?.wrongConfirm ?? 99;
  const n = candidate?.n ?? 0;
  if (n <= 0) return { ok: false, reason: "no-eval" };
  if (wrong > 0) return { ok: false, reason: "wrong-confirm", wrong, accuracy: candAcc };
  if (candAcc < baseAcc) return { ok: false, reason: "worse-accuracy", accuracy: candAcc, baseline: baseAcc };
  return { ok: true, reason: candAcc >= 0.999 ? "perfect" : "improved-or-equal", accuracy: candAcc, baseline: baseAcc };
}

export function letterGaps(letters = {}, min = 1) {
  const missing = [];
  const low = [];
  for (let i = 0; i < 26; i += 1) {
    const ch = String.fromCharCode(65 + i);
    const n = Number(letters[ch] || 0);
    if (n <= 0) missing.push(ch);
    else if (n < min) low.push(ch);
  }
  return { missing, low, min };
}
