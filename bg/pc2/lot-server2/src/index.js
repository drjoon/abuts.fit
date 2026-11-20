// change-log:
// - 2026-11-21: 현미경 촬영 저장 서버. 인식 API는 호출하지 않는다.
// related files:
// - bg/pc2/lot-server2/rules.md
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/public/index.html

process.env.TZ = "Asia/Seoul";

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { captureAndSave, listCameras, resolveFfmpeg } from "./capture.js";
import { chooseDevice } from "./devices.js";
import { DLL_DIR } from "./focus.js";
import { CAPTURE_NAME } from "./names.js";

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

async function shoot(deviceName) {
  if (busy) {
    const err = new Error("다른 촬영이 진행 중입니다.");
    err.code = "busy";
    throw err;
  }
  busy = true;
  try {
    return await captureAndSave({
      captureDir: CAPTURE_DIR,
      deviceName: deviceName || process.env.MICROSCOPE_DEVICE || "",
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
  const cameras = await listCameras();
  const selected = chooseDevice(cameras, process.env.MICROSCOPE_DEVICE || "");
  return {
    devices: cameras.map((device) => device.name),
    selected: selected?.name || "",
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
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/devices") {
      json(res, 200, await devicePayload());
      return;
    }
    if (req.method === "GET" && url.pathname === "/image") {
      const name = path.basename(url.searchParams.get("name") || "");
      if (!CAPTURE_NAME.test(name)) {
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
      message: err?.message || "촬영에 실패했습니다.",
    });
  }
});

async function main() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  if (process.argv.includes("--once")) {
    try {
      const saved = await shoot("");
      log(`saved ${saved.fileName} mode=${saved.mode}`);
      console.log(JSON.stringify(saved));
      process.exit(0);
    } catch (err) {
      log(`error ${err?.message || err}`);
      console.error(err?.message || err);
      process.exit(1);
    }
  }

  server.on("error", (err) => {
    log(`listen error ${err.message}`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    log(`listening http://${HOST}:${PORT}/ dir=${CAPTURE_DIR}`);
  });
}

main();
