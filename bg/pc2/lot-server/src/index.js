// change-log:
// - 2026-11-27: 패킹 작업대 SSOT — station-settings(자동 커밋·표본 수집), /api/match 시 촬영본 S3 업로드(presign)+s3Key 전달.
// - 2026-11-27: 각인 인식 지그 프로필 API(GET/PUT /api/jig-profiles, POST /api/jig-profiles/select·duplicate),
//   GET /api/engrave/status, POST /api/engrave/test(미리보기 한 장으로 판독만, 저장·매칭 없음).
//   /api/match 성공 뒤 그 코드로 각인 학습 표본을 data/engrave-dataset에 저장(LOT_ENGRAVE_COLLECT=0이면 끔).
// - 2026-11-27: 화질 설정 API(GET/PUT /api/camera-settings, POST /api/camera-settings/reset, GET /api/camera-preview). data/camera-settings.json에 저장.
// - 2026-11-27: 감시 OCR은 지금 세척.패킹 대기 목록(우편함 배정)에 있는 코드만 결과로 낸다(watcher allowedLots).
// - 2026-11-26: /api/queue는 우편함이 배정된 세척.패킹 건만 돌려준다(packing-queue.js, LOT_QUEUE_REQUIRE_MAILBOX=0이면 끔).
// - 2026-11-26: Windows에서 `/`·`/index.html`이 path.normalize 후 `\…`가 되어 정적 파일 경로 가드에 걸리던(400) 버그 수정(static-path.js).
// - 2026-11-26: GET /api/branding → pack-server /branding (패킹 라벨 미리보기용).
// - 2026-11-26: 공병·패킹 라벨을 같은 PC pack-server(8004)로 프록시 출력.
// - 2026-11-26: 작업자 UI(8012)·백엔드 큐/매칭/스크류 로트 프록시. 어벗츠 FE는 lot-server를 호출하지 않는다.
// - 2026-11-26: SIGINT/SIGTERM/exit 때 감시가 켠 UM LED를 끈다(watcher.shutdownSync).
// - 2026-11-26: POST /focus(하드웨어 AF, UM 시리얼). /health에 시리얼 AF 상태.
// - 2026-11-26: 기동 시 package.json 버전을 로그·/health에 남긴다.
// - 2026-11-23: 기본 자동 감시 off. 상주 스트림으로 부하 완화.
// - 2026-11-23: 카메라 연동(장치 선택·Grab 프로파일)과 /live.
// - 2026-11-23: 페달 없이 영상 감시 → 정지·선명 시 로컬 OCR(영문 3글자).
// - 2026-11-21: 현미경 촬영 저장 서버. 인식 API는 호출하지 않는다.
// related files:
// - bg/pc2/lot-server/src/packing-queue.js
// - bg/pc2/lot-server/src/static-path.js
// - bg/pc2/lot-server/rules.md
// - bg/pc2/lot-server/public/index.html
// - web/backend/controllers/ai/lotCapture.controller.js
// - web/backend/controllers/ai/packingStation.controller.js
// - bg/pc2/lot-server/src/camera.js
// - bg/pc2/lot-server/src/watch.js
// - bg/pc2/lot-server/src/um-serial.js
// - bg/pc2/lot-server/src/ocr/index.js

process.env.TZ = "Asia/Seoul";

import http from "http";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import {
  getSelectedDeviceName,
  resolveDevice,
  resolveFfmpeg,
  setSelectedDeviceName,
} from "./camera.js";
import { captureAndSave } from "./capture.js";
import { DLL_DIR } from "./focus.js";
import { IMAGE_NAME } from "./names.js";
import { disposeOcrWorker } from "./ocr/index.js";
import { createWatcher } from "./watch.js";
import { resolvePublicPath } from "./static-path.js";
import { activeLotSuffixes, filterPackingQueueBody, queueFilterOptionsFromEnv } from "./packing-queue.js";
import { EV_LABELS, LIMITS, loadSettings, recommendedSettings, saveSettings, settingsFile } from "./camera-settings.js";
import {
  loadStationSettings,
  recommendedStationSettings,
  saveStationSettings,
  stationSettingsFile,
} from "./station-settings.js";
import { activeProfile, duplicateProfile, loadProfiles, normalizeProfile, profilesFile, selectProfile, upsertProfile } from "./jig-profiles.js";
import { datasetSummary, saveSample } from "./engrave/dataset.js";
import { listModelVersions, loadModel, modelsDir } from "./engrave/model-store.js";
import { locateCode, locationTrusted, recognizeEngraving } from "./engrave/recognize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const APP_VERSION = String(require("../package.json").version || "0.0.0");
const PUBLIC_DIR = path.join(ROOT, "public");

function loadLocalEnv() {
  const envPath = path.join(ROOT, "local.env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 8012);
const HOST = process.env.HOST || "127.0.0.1";
const CAPTURE_DIR =
  process.env.LOT_CAPTURE_DIR ||
  (process.platform === "win32"
    ? "D:\\bg\\lot-server\\images"
    : path.join(ROOT, "captures"));
// 기본은 수동 시작. 자동 감시+Continuity면 Cursor/머신이 버거울 수 있다.
const AUTO_WATCH = String(process.env.LOT_AUTO_WATCH || "0") === "1";
const BACKEND_BASE = String(
  process.env.BACKEND_BASE || "http://127.0.0.1:8080",
).replace(/\/+$/, "");
const LOT_SHARED_SECRET = String(process.env.LOT_SHARED_SECRET || "").trim();
const PACK_SERVER_BASE = String(
  process.env.PACK_SERVER_BASE || "http://127.0.0.1:8004",
).replace(/\/+$/, "");
const PACK_PRINT_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();

const PUBLIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const LOGS_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOGS_DIR, "latest.txt");
fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  if (logStream.writable) logStream.write(`${line}\n`);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 512_000) {
        reject(new Error("payload"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function jsonFetch(url, { method = "GET", body, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { success: false, message: text.slice(0, 240) };
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function backendFetch(pathname, { method = "GET", body } = {}) {
  const headers = {};
  if (LOT_SHARED_SECRET) headers["X-Bridge-Secret"] = LOT_SHARED_SECRET;
  return jsonFetch(`${BACKEND_BASE}${pathname}`, { method, body, headers });
}

async function packFetch(pathname, { method = "GET", body } = {}) {
  const headers = {};
  if (PACK_PRINT_SECRET) headers["x-pack-secret"] = PACK_PRINT_SECRET;
  return jsonFetch(`${PACK_SERVER_BASE}${pathname}`, { method, body, headers });
}

function servePublic(res, urlPath) {
  const resolved = resolvePublicPath(PUBLIC_DIR, urlPath);
  if (!resolved.ok) {
    json(res, 400, { success: false, message: "잘못된 경로입니다." });
    return true;
  }
  const { full } = resolved;
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return false;
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    "Content-Type": PUBLIC_MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=30",
  });
  fs.createReadStream(full).pipe(res);
  return true;
}

let busy = false;

if (process.env.MICROSCOPE_DEVICE) {
  setSelectedDeviceName(process.env.MICROSCOPE_DEVICE);
}

/** 대기 목록 코드 집합(5초 캐시). 실패하면 null → 감시는 인식 결과를 내지 않는다. */
let lotCache = { at: 0, set: null };
async function fetchAllowedLots() {
  if (lotCache.set && Date.now() - lotCache.at < 5000) return lotCache.set;
  const upstream = await backendFetch("/api/bg/packing/queue");
  if (upstream.status < 200 || upstream.status >= 300) return null;
  const set = activeLotSuffixes(filterPackingQueueBody(upstream.body, queueFilterOptionsFromEnv()));
  if (set) lotCache = { at: Date.now(), set };
  return set;
}

const watcher = createWatcher({
  captureDir: CAPTURE_DIR,
  deviceName: getSelectedDeviceName(),
  log,
  allowedLots: String(process.env.LOT_OCR_QUEUE_ONLY ?? "1") === "0" ? null : fetchAllowedLots,
});

function cameraSettingsPayload() {
  const status = watcher.status();
  return {
    success: true,
    settings: loadSettings(),
    recommended: recommendedSettings(),
    limits: LIMITS,
    evLabels: EV_LABELS,
    file: settingsFile(),
    lastSettings: status.lastSettings || null,
    led: status.led || null,
    running: Boolean(status.running),
    serial: status.serialAf ?? null,
  };
}

function jigPayload() {
  const s = loadProfiles();
  return { success: true, active: s.active, profiles: Object.values(s.profiles), file: profilesFile() };
}

function engraveStatus() {
  let model = null;
  try {
    const m = loadModel();
    if (m) model = { file: path.basename(m.file), meta: m.meta };
  } catch (e) {
    model = { error: String(e?.message || e) };
  }
  return { success: true, model, versions: listModelVersions(), modelsDir: modelsDir(), dataset: datasetSummary() };
}

/** 이 프레임이 언제 찍혔는지 모르면 쓰지 않는다. 마지막 확정 촬영(같은 코드, 10분 안) → 감시 중 라이브. */
async function frameForSample(code) {
  const st = watcher.status();
  const latest = st.latest;
  if (latest?.lot === code && latest.filePath && Date.now() - Date.parse(latest.at || 0) < 10 * 60 * 1000) {
    try {
      return { buffer: fs.readFileSync(latest.filePath), from: "capture", fileName: latest.fileName };
    } catch {}
  }
  const live = st.running ? watcher.getLiveFrame() : null;
  return live ? { buffer: Buffer.from(live), from: "live" } : null;
}

/** 매칭 직전 촬영본을 S3에 올리고 lot-capture용 메타를 돌려준다. 실패해도 매칭은 코드만으로 진행. */
async function uploadCaptureForMatch(code, requestId) {
  const frame = await frameForSample(code);
  if (!frame?.buffer?.length) {
    return { ok: false, reason: "no-frame" };
  }
  const originalName = String(frame.fileName || `lot-${code || "xxx"}.jpg`).replace(/\s+/g, "_");
  const mimeType = "image/jpeg";
  const presign = await backendFetch("/api/bg/presign-upload", {
    method: "POST",
    body: {
      sourceStep: "packing-capture",
      fileName: originalName,
      requestId: requestId || undefined,
    },
  });
  if (presign.status < 200 || presign.status >= 300) {
    return {
      ok: false,
      reason: `presign-${presign.status}`,
      message: presign.body?.message || "",
    };
  }
  const data = presign.body?.data || presign.body || {};
  const uploadUrl = data.url;
  const s3Key = data.key;
  const s3Url = data.s3Url;
  if (!uploadUrl || !s3Key) {
    return { ok: false, reason: "presign-fields" };
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": data.contentType || mimeType },
    body: frame.buffer,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => "");
    return { ok: false, reason: `s3-${put.status}`, message: t.slice(0, 160) };
  }
  return {
    ok: true,
    s3Key,
    s3Url: s3Url || "",
    originalName,
    fileSize: frame.buffer.length,
  };
}

/** 매칭이 된 코드로 학습 표본 저장(비동기, 실패해도 매칭에는 영향 없음). */
async function collectSample(code, source, requestId) {
  if (String(process.env.LOT_ENGRAVE_COLLECT ?? "1") === "0") return;
  if (!loadStationSettings().collectSamples) return;
  if (!/^[A-Z]{3}$/.test(code)) return;
  const frame = await frameForSample(code);
  if (!frame) {
    log(`engrave sample skipped ${code}: no frame`);
    return;
  }
  const profile = activeProfile();
  const loc = await locateCode(frame.buffer, code, { profile }).catch(() => null);
  // 위치가 약하면 상자 없이(ROI만) 저장한다. 학습은 상자 있는 표본만 쓴다.
  const boxed = locationTrusted(loc);
  const { dir } = await saveSample({
    frame: frame.buffer,
    code,
    profile,
    rotation: boxed ? loc.rotation : 0,
    boxes: boxed ? loc.boxes : null,
    settings: loadSettings(),
    source,
    requestId,
    extra: {
      frameFrom: frame.from,
      fileName: frame.fileName || null,
      locateMeanP: loc ? Number(loc.meanP.toFixed(3)) : null,
      letterness: loc ? Number(loc.letterness.toFixed(3)) : null,
    },
  });
  log(`engrave sample ${code} boxed=${Boolean(boxed)} p=${loc ? loc.meanP.toFixed(2) : "-"} → ${dir}`);
}

async function shoot(deviceName) {
  if (busy) {
    const err = new Error("다른 작업이 진행 중입니다.");
    err.code = "busy";
    throw err;
  }
  busy = true;
  try {
    return await captureAndSave({
      captureDir: CAPTURE_DIR,
      deviceName: deviceName || getSelectedDeviceName(),
    });
  } finally {
    busy = false;
  }
}

function statusFor(err) {
  if (err?.code === "busy") return 409;
  if (err?.code === "no-camera" || err?.code === "no-ffmpeg") return 503;
  return 500;
}

async function devicePayload() {
  const { cameras, device } = await resolveDevice(getSelectedDeviceName());
  return {
    devices: cameras.map((cam) => ({
      name: cam.name,
      preferred: Boolean(cam.preferred),
      continuity: Boolean(cam.continuity),
      screen: Boolean(cam.screen),
    })),
    selected: device?.name || "",
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (
      req.method === "GET" &&
      (url.pathname === "/" ||
        url.pathname === "/index.html" ||
        url.pathname === "/station.css" ||
        url.pathname === "/station.js" ||
        url.pathname === "/vialLabel.js")
    ) {
      if (servePublic(res, url.pathname === "/" ? "/index.html" : url.pathname)) {
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/api/camera-settings") {
      json(res, 200, cameraSettingsPayload());
      return;
    }
    if ((req.method === "PUT" || req.method === "POST") && url.pathname === "/api/camera-settings") {
      const body = await readBody(req);
      const saved = saveSettings(body.settings || body);
      log(`settings saved ${JSON.stringify(saved)}`);
      let applied = null;
      if (body.apply !== false) applied = await watcher.applyCameraSettings(saved);
      json(res, 200, { ...cameraSettingsPayload(), applied });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/camera-settings/reset") {
      const saved = saveSettings(recommendedSettings());
      log(`settings reset ${JSON.stringify(saved)}`);
      const applied = await watcher.applyCameraSettings(saved);
      json(res, 200, { ...cameraSettingsPayload(), applied });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/camera-preview") {
      const frame = await watcher.previewFrame();
      if (!frame) {
        json(res, 503, { success: false, message: "미리보기 프레임을 받지 못했습니다." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": frame.length,
      });
      res.end(frame);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/jig-profiles") {
      json(res, 200, jigPayload());
      return;
    }
    if ((req.method === "PUT" || req.method === "POST") && url.pathname === "/api/jig-profiles") {
      const body = await readBody(req);
      const { profile } = upsertProfile(body.profile || body, { activate: body.activate !== false });
      log(`jig profile saved ${JSON.stringify(profile)}`);
      json(res, 200, { ...jigPayload(), saved: profile });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/jig-profiles/select") {
      const body = await readBody(req);
      selectProfile(String(body.id || ""));
      log(`jig profile selected ${body.id}`);
      json(res, 200, jigPayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/jig-profiles/duplicate") {
      const body = await readBody(req);
      const { profile } = duplicateProfile(String(body.id || ""), String(body.name || "").trim());
      log(`jig profile duplicated ${body.id} → ${profile.id}`);
      json(res, 200, { ...jigPayload(), saved: profile });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/engrave/status") {
      json(res, 200, engraveStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/engrave/test") {
      // 판독만 한다. 저장·매칭·백엔드 변경 없음.
      const body = await readBody(req);
      const profile = body.profile ? normalizeProfile(body.profile, activeProfile()) : activeProfile();
      const frame = await watcher.previewFrame();
      if (!frame) {
        json(res, 503, { success: false, message: "미리보기 프레임을 받지 못했습니다." });
        return;
      }
      const allowed = body.queueOnly === false ? null : await fetchAllowedLots().catch(() => null);
      const t = Date.now();
      const result = await recognizeEngraving(frame, { profile, allowed });
      json(res, 200, { success: true, result, ms: Date.now() - t, queue: allowed ? [...allowed] : null });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/queue") {
      const upstream = await backendFetch("/api/bg/packing/queue");
      // 지금 세척.패킹에 들어와 있는 건(우편함 배정)만 카드로 보낸다.
      const body = upstream.status >= 200 && upstream.status < 300
        ? filterPackingQueueBody(upstream.body, queueFilterOptionsFromEnv())
        : upstream.body;
      json(res, upstream.status, body || { success: false });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/match") {
      const body = await readBody(req);
      const codeHint = String(body.recognizedSuffix || body.lotNumber || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(-3);
      let imageMeta = null;
      if (!String(body.s3Key || "").trim() && codeHint.length === 3) {
        imageMeta = await uploadCaptureForMatch(
          codeHint,
          String(body.requestId || body.requestMongoId || ""),
        );
        if (imageMeta.ok) {
          body.s3Key = imageMeta.s3Key;
          body.s3Url = imageMeta.s3Url || "";
          body.originalName = imageMeta.originalName;
          body.fileSize = imageMeta.fileSize;
          log(`match image uploaded ${imageMeta.s3Key} (${imageMeta.fileSize}b)`);
        } else {
          log(`match image skipped ${imageMeta.reason || "?"} ${imageMeta.message || ""}`.trim());
        }
      }
      const upstream = await backendFetch("/api/bg/lot-capture/packing", {
        method: "POST",
        body,
      });
      const out = upstream.body || { success: false };
      if (imageMeta && !imageMeta.ok) {
        out.imageUpload = { ok: false, reason: imageMeta.reason || "failed" };
      } else if (imageMeta?.ok || body.s3Key) {
        out.imageUpload = { ok: true, s3Key: String(body.s3Key || imageMeta?.s3Key || "") };
      }
      json(res, upstream.status, out);
      const result = out.data || {};
      if (upstream.status >= 200 && upstream.status < 300 && result.matched) {
        const code = String(result.suffix || body.recognizedSuffix || "").toUpperCase();
        collectSample(code, String(body.source || "manual"), String(result.requestId || body.requestMongoId || "")).catch((e) =>
          log(`engrave sample error ${e?.message || e}`),
        );
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/station-settings") {
      json(res, 200, {
        success: true,
        settings: loadStationSettings(),
        recommended: recommendedStationSettings(),
        file: stationSettingsFile(),
      });
      return;
    }
    if ((req.method === "PUT" || req.method === "POST") && url.pathname === "/api/station-settings") {
      const body = await readBody(req);
      const saved = saveStationSettings(body.settings || body);
      log(`station settings saved ${JSON.stringify(saved)}`);
      json(res, 200, { success: true, settings: saved, file: stationSettingsFile() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/screw-lot-settings") {
      const upstream = await backendFetch("/api/bg/packing/screw-lot-settings");
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/screw-lot-settings") {
      const body = await readBody(req);
      const upstream = await backendFetch("/api/bg/packing/screw-lot-settings", {
        method: "PUT",
        body,
      });
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/printers") {
      const upstream = await packFetch("/printers");
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/branding") {
      const upstream = await packFetch("/branding");
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/print-packing-label") {
      const body = await readBody(req);
      const upstream = await packFetch("/print-packing-label", {
        method: "POST",
        body,
      });
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/print-zpl") {
      const body = await readBody(req);
      const upstream = await packFetch("/print-zpl", {
        method: "POST",
        body,
      });
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        version: APP_VERSION,
        captureDir: CAPTURE_DIR,
        ffmpeg: resolveFfmpeg(),
        dll: fs.existsSync(path.join(DLL_DIR, "mltcCom.dll")),
        platform: process.platform,
        watch: watcher.status(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/devices") {
      json(res, 200, await devicePayload());
      return;
    }
    if (req.method === "POST" && url.pathname === "/devices") {
      const body = await readBody(req);
      const name = String(body.device || body.name || "").trim();
      const { cameras, device } = await resolveDevice(name);
      if (name && !device) {
        json(res, 404, {
          success: false,
          message: "설정한 카메라를 찾지 못했습니다.",
          devices: cameras.map((cam) => cam.name),
        });
        return;
      }
      const selected = setSelectedDeviceName(device?.name || name);
      watcher.setDeviceName(selected);
      log(`device selected ${selected || "(auto)"}`);
      json(res, 200, {
        success: true,
        selected,
        ...(await devicePayload()),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/watch") {
      json(res, 200, { success: true, ...watcher.status() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/latest") {
      const status = watcher.status();
      json(res, 200, {
        success: true,
        latest: status.latest,
        phase: status.phase,
        lastLot: status.lastLot,
        lastError: status.lastError,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/live") {
      const frame = watcher.getLiveFrame();
      if (!frame) {
        json(res, 404, {
          success: false,
          message: "아직 라이브 프레임이 없습니다. 감시를 시작하세요.",
        });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": frame.length,
      });
      res.end(frame);
      return;
    }
    if (req.method === "GET" && url.pathname === "/image") {
      const name = path.basename(url.searchParams.get("name") || "");
      if (!IMAGE_NAME.test(name)) {
        json(res, 400, { success: false, message: "파일 이름이 올바르지 않습니다." });
        return;
      }
      const full = path.resolve(CAPTURE_DIR, name);
      if (!full.startsWith(path.resolve(CAPTURE_DIR) + path.sep)) {
        json(res, 400, { success: false, message: "파일 이름이 올바르지 않습니다." });
        return;
      }
      if (!fs.existsSync(full)) {
        json(res, 404, { success: false, message: "파일이 없습니다." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(full).pipe(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/watch/start") {
      json(res, 200, { success: true, ...watcher.start() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/focus") {
      const body = await readBody(req);
      const af = await watcher.autoFocus(body.area === "local" ? "local" : "whole");
      json(res, af?.ok ? 200 : 422, { success: Boolean(af?.ok), ...af, watch: watcher.status() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/watch/stop") {
      json(res, 200, { success: true, ...(await watcher.stop()) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/recognize") {
      const result = await watcher.forceRecognize();
      if (!result) {
        const status = watcher.status();
        json(res, 422, {
          success: false,
          message: status.lastError || "로트를 읽지 못했습니다.",
          ...status,
        });
        return;
      }
      json(res, 200, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/capture") {
      const body = await readBody(req);
      const saved = await shoot(body.device);
      log(
        `saved ${saved.fileName} mode=${saved.mode} device=${saved.device} focus=${saved.focus?.reason || saved.focus?.af || ""}`,
      );
      json(res, 200, saved);
      return;
    }
    json(res, 404, { success: false, message: "없는 경로입니다." });
  } catch (err) {
    log(
      `error ${err?.code || ""} ${err?.message || err}${err?.detail ? ` ${err.detail}` : ""}`,
    );
    json(res, statusFor(err), {
      success: false,
      message: err?.message || "요청에 실패했습니다.",
      detail: err?.detail || "",
      code: err?.code || "",
    });
  }
});

let shuttingDown = false;
/** 종료 신호: 감시가 켠 LED를 끄고 나간다(Stop-Process -Force 같은 강제 종료에는 불리지 않는다). */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    watcher.shutdownSync();
  } catch {}
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
  process.on(sig, () => shutdown(0));
}
process.on("exit", () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    watcher.shutdownSync();
  } catch {}
});

async function main() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  if (process.argv.includes("--once")) {
    try {
      const result = await watcher.forceRecognize();
      if (!result) {
        const status = watcher.status();
        throw new Error(status.lastError || "로트를 읽지 못했습니다.");
      }
      console.log(JSON.stringify(result));
      await disposeOcrWorker();
      process.exit(0);
    } catch (err) {
      log(`error ${err?.message || err}`);
      console.error(err?.message || err);
      await disposeOcrWorker();
      process.exit(1);
    }
  }

  server.on("error", (err) => {
    log(`listen error ${err.message}`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    log(
      `lot-server v${APP_VERSION} node=${process.arch} listening http://${HOST}:${PORT}/ dir=${CAPTURE_DIR} backend=${BACKEND_BASE} pack=${PACK_SERVER_BASE}`,
    );
    if (AUTO_WATCH) watcher.start();
  });
}

main();
