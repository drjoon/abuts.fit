// change-log:
// - 2026-11-23: 기본 자동 감시 off. 상주 스트림으로 부하 완화.
// - 2026-11-23: 카메라 연동(장치 선택·Grab 프로파일)과 /live.
// - 2026-11-23: 페달 없이 영상 감시 → 정지·선명 시 로컬 OCR(영문 3글자).
// - 2026-11-21: 현미경 촬영 저장 서버. 인식 API는 호출하지 않는다.
// related files:
// - bg/pc2/lot-server2/rules.md
// - bg/pc2/lot-server2/src/camera.js
// - bg/pc2/lot-server2/src/watch.js
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/public/index.html

process.env.TZ = "Asia/Seoul";

import http from "http";
import fs from "fs";
import path from "path";
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
const PAGE = fs.readFileSync(path.join(ROOT, "public", "index.html"));

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
    ? "D:\\bg\\lot-server2\\images"
    : path.join(ROOT, "captures"));
// 기본은 수동 시작. 자동 감시+Continuity면 Cursor/머신이 버거울 수 있다.
const AUTO_WATCH = String(process.env.LOT_AUTO_WATCH || "0") === "1";

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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
      if (size > 64_000) {
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
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
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
    log(`listening http://${HOST}:${PORT}/ dir=${CAPTURE_DIR}`);
    if (AUTO_WATCH) watcher.start();
  });
}

main();
