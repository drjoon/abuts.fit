// change-log:
// - 2026-11-27: 각인 분류기 버전 관리. data/engrave-models/model-<시각>.json으로 쌓고 current.json이 쓸 버전을 가리킨다.
//   이전 버전은 지우지 않는다(되돌리기: current.json의 file만 바꾼다). 데이터 모델이 없으면 src/engrave/model-default.json.
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/scripts/train-engrave.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fromJson } from "./mlp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
export const DEFAULT_MODEL = path.join(__dirname, "model-default.json");

export function modelsDir() {
  return process.env.LOT_ENGRAVE_MODELS || path.join(ROOT, "data", "engrave-models");
}

/** 지금 쓸 모델 파일 경로(없으면 null). */
export function currentModelPath(dir = modelsDir()) {
  const pointer = path.join(dir, "current.json");
  try {
    if (fs.existsSync(pointer)) {
      const j = JSON.parse(fs.readFileSync(pointer, "utf8"));
      const file = path.join(dir, path.basename(String(j.file || "")));
      if (j.file && fs.existsSync(file)) return file;
    }
  } catch {}
  return fs.existsSync(DEFAULT_MODEL) ? DEFAULT_MODEL : null;
}

let cache = { file: "", mtime: 0, model: null, meta: null };

/** 모델 로드(파일이 바뀌면 다시 읽는다). */
export function loadModel() {
  const file = currentModelPath();
  if (!file) return null;
  const mtime = fs.statSync(file).mtimeMs;
  if (cache.model && cache.file === file && cache.mtime === mtime) return cache;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  cache = { file, mtime, model: fromJson(j), meta: j.meta || {} };
  return cache;
}

/** 새 버전 저장 + current.json 갱신. 이전 파일은 그대로 둔다. */
export function saveModelVersion(json, dir = modelsDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const name = `model-${stamp}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(json));
  const pointer = path.join(dir, "current.json");
  const prev = fs.existsSync(pointer) ? JSON.parse(fs.readFileSync(pointer, "utf8")) : null;
  fs.writeFileSync(pointer, JSON.stringify({ file: name, previous: prev?.file || null, at: new Date().toISOString() }, null, 2));
  return file;
}

export function listModelVersions(dir = modelsDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^model-.*\.json$/.test(f))
    .sort();
}
