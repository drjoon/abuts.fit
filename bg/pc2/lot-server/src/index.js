// change-log:
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
  const safe = path
    .normalize(String(urlPath || "/"))
    .replace(/^(\.\.[/\\])+/, "");
  const rel = safe === "/" || safe === "" ? "index.html" : safe.replace(/^\//, "");
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== PUBLIC_DIR) {
    json(res, 400, { success: false, message: "잘못된 경로입니다." });
    return true;
  }
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

const watcher = createWatcher({
  captureDir: CAPTURE_DIR,
  deviceName: getSelectedDeviceName(),
  log,
});

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
    if (req.method === "GET" && url.pathname === "/api/queue") {
      const upstream = await backendFetch("/api/bg/packing/queue");
      json(res, upstream.status, upstream.body || { success: false });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/match") {
      const body = await readBody(req);
      const upstream = await backendFetch("/api/bg/lot-capture/packing", {
        method: "POST",
        body,
      });
      json(res, upstream.status, upstream.body || { success: false });
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
