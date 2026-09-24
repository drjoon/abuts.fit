// change-log:
// - 2026-09-24: 기공소 배포는 start.cmd(PowerShell). Node app.js는 개발용.
// - 2026-09-24: 기공소 로컬 CAD 열기 — 웹「열기」→ temp 저장 → 설정 SW(3Shape/ExoCAD/…)로 launch.
// related files:
// - bg/lab-cad-helper/start.cmd
// - bg/lab-cad-helper/lab-cad-helper.ps1
// - bg/lab-cad-helper/rules.md
// - bg/lab-cad-helper/config.example.json
// - web/frontend/src/shared/files/labCadHelperClient.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
process.env.TZ = "Asia/Seoul";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CONFIG_PATH = path.resolve(__dirname, "config.json");
const EXAMPLE_PATH = path.resolve(__dirname, "config.example.json");

function loadConfig() {
  const fallback = {
    port: 8010,
    allowOrigin: "*",
    sharedSecret: "",
    exePaths: { "3Shape": "", ExoCAD: "", custom: "" },
  };
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      if (fs.existsSync(EXAMPLE_PATH)) {
        fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
      } else {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(fallback, null, 2), "utf8");
      }
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return {
      port: Number(raw.port || fallback.port) || 8010,
      allowOrigin: String(raw.allowOrigin || fallback.allowOrigin || "*"),
      sharedSecret: String(raw.sharedSecret || "").trim(),
      exePaths: {
        "3Shape": String(raw.exePaths?.["3Shape"] || "").trim(),
        ExoCAD: String(raw.exePaths?.ExoCAD || "").trim(),
        custom: String(raw.exePaths?.custom || "").trim(),
      },
    };
  } catch (err) {
    console.error("[lab-cad-helper] config load failed, using defaults", err);
    return fallback;
  }
}

const config = loadConfig();
const PORT = Number(process.env.LAB_CAD_HELPER_PORT || config.port || 8010);
const ALLOW_ORIGIN =
  process.env.LAB_CAD_HELPER_ORIGIN || config.allowOrigin || "*";
const SHARED_SECRET = String(
  process.env.LAB_CAD_HELPER_SHARED_SECRET || config.sharedSecret || "",
).trim();
const WORK_ROOT = path.resolve(
  process.env.LAB_CAD_HELPER_WORK_DIR ||
    path.join(os.tmpdir(), "abuts-lab-cad-helper"),
);

/** @type {Map<string, { dir: string, files: string[], createdAt: number }>} */
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function log(message, extra) {
  const stamp = new Date().toISOString();
  if (extra !== undefined) {
    console.log(`[lab-cad-helper] ${stamp} ${message}`, extra);
  } else {
    console.log(`[lab-cad-helper] ${stamp} ${message}`);
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-abuts-cad-secret",
  );
}

function sendJson(res, status, body) {
  setCors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limitBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("요청 본문이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authorize(req) {
  if (!SHARED_SECRET) return true;
  const got = String(req.headers["x-abuts-cad-secret"] || "").trim();
  return got === SHARED_SECRET;
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || "model.stl").trim() || "model.stl");
  return base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180);
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      fs.promises.rm(session.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function resolveExe(designSoftware) {
  const key = String(designSoftware || "").trim();
  if (key === "3Shape") return config.exePaths["3Shape"] || "";
  if (key === "ExoCAD") return config.exePaths.ExoCAD || "";
  if (key) return config.exePaths.custom || config.exePaths[key] || "";
  return "";
}

function launchFiles(designSoftware, filePaths) {
  const exe = resolveExe(designSoftware);
  if (exe && fs.existsSync(exe)) {
    const child = spawn(exe, filePaths, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return { ok: true, mode: "exe", exe, count: filePaths.length };
  }

  // 개발용(Mac): Windows 설치 폴더 탐색은 PS1 SSOT. 여기선 명시 실패.
  const sw = String(designSoftware || "").trim() || "디자인 프로그램";
  return {
    ok: false,
    code: "EXE_NOT_FOUND",
    mode: "not_found",
    exe: null,
    count: 0,
    message: `${sw} 실행 파일을 찾지 못했습니다. PC에서 ${sw}을(를) 실행한 뒤, 웹에서 설치를 다시 진행해 주세요.`,
  };
}

async function ensureWorkRoot() {
  await fs.promises.mkdir(WORK_ROOT, { recursive: true });
}

async function createSession() {
  pruneSessions();
  const sessionId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const dir = path.join(WORK_ROOT, sessionId);
  await fs.promises.mkdir(dir, { recursive: true });
  const session = { dir, files: [], createdAt: Date.now() };
  sessions.set(sessionId, session);
  return { sessionId, dir };
}

async function handleRequest(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "abuts-lab-cad-helper",
      port: PORT,
      exeConfigured: {
        "3Shape": Boolean(config.exePaths["3Shape"]),
        ExoCAD: Boolean(config.exePaths.ExoCAD),
        custom: Boolean(config.exePaths.custom),
      },
    });
    return;
  }

  if (!authorize(req)) {
    sendJson(res, 401, { ok: false, message: "권한이 없습니다." });
    return;
  }

  if (pathname === "/sessions" && req.method === "POST") {
    const session = await createSession();
    sendJson(res, 200, { ok: true, sessionId: session.sessionId });
    return;
  }

  const uploadMatch = pathname.match(/^\/sessions\/([^/]+)\/files\/([^/]+)$/);
  if (uploadMatch && req.method === "PUT") {
    const sessionId = decodeURIComponent(uploadMatch[1]);
    const fileName = sanitizeFileName(decodeURIComponent(uploadMatch[2]));
    const session = sessions.get(sessionId);
    if (!session) {
      sendJson(res, 404, { ok: false, message: "세션이 없습니다." });
      return;
    }
    const dest = path.join(session.dir, fileName);
    const chunks = [];
    let size = 0;
    const maxBytes = 500 * 1024 * 1024;
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error("파일이 너무 큽니다(최대 500MB)."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", resolve);
      req.on("error", reject);
    });
    await fs.promises.writeFile(dest, Buffer.concat(chunks));
    if (!session.files.includes(dest)) session.files.push(dest);
    sendJson(res, 200, { ok: true, fileName, bytes: size });
    return;
  }

  const openMatch = pathname.match(/^\/sessions\/([^/]+)\/open$/);
  if (openMatch && req.method === "POST") {
    const sessionId = decodeURIComponent(openMatch[1]);
    const session = sessions.get(sessionId);
    if (!session) {
      sendJson(res, 404, { ok: false, message: "세션이 없습니다." });
      return;
    }
    const raw = await readBody(req, 64 * 1024);
    let body = {};
    try {
      body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      sendJson(res, 400, { ok: false, message: "JSON 본문이 필요합니다." });
      return;
    }
    const designSoftware = String(body.designSoftware || "").trim();
    if (!session.files.length) {
      sendJson(res, 400, { ok: false, message: "열린 파일이 없습니다." });
      return;
    }
    const result = launchFiles(designSoftware, session.files);
    log("opened", {
      sessionId,
      designSoftware: designSoftware || "(default)",
      ...result,
      files: session.files.map((f) => path.basename(f)),
    });
    if (!result.ok) {
      sendJson(res, 422, {
        ok: false,
        code: result.code || "EXE_NOT_FOUND",
        message: result.message,
        designSoftware: designSoftware || null,
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      designSoftware: designSoftware || null,
      mode: result.mode,
      exe: result.exe,
      count: result.count,
    });
    return;
  }

  sendJson(res, 404, { ok: false, message: "not found" });
}

async function main() {
  await ensureWorkRoot();
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log("request error", err?.message || err);
      try {
        sendJson(res, 500, {
          ok: false,
          message: err instanceof Error ? err.message : "서버 오류",
        });
      } catch {
        // ignore
      }
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    log(`listening on http://127.0.0.1:${PORT}`);
    log(`work dir: ${WORK_ROOT}`);
    log(
      `exePaths: 3Shape=${config.exePaths["3Shape"] || "(shell)"} ExoCAD=${
        config.exePaths.ExoCAD || "(shell)"
      }`,
    );
  });

  server.on("error", (err) => {
    console.error("[lab-cad-helper] server error:", err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[lab-cad-helper] fatal:", err);
  process.exit(1);
});
