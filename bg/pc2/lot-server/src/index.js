import chokidar from "chokidar";
import dotenv from "dotenv";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.resolve(__dirname, "logs.txt");
const logStream = createWriteStream(LOG_FILE, { flags: "w" });
logStream.on("error", (err) => {
  console.error("[lot-server] log stream error", err);
});

dotenv.config({
  path: path.resolve(process.cwd(), "local.env"),
  override: true,
});

const WATCH_DIR = process.env.LOT_WATCH_DIR || "C:/abuts.fit/images";
const PROCESSED_DIR =
  process.env.LOT_PROCESSED_DIR || path.join(WATCH_DIR, "_processed");
const FAILED_DIR =
  process.env.LOT_FAILED_DIR || path.join(WATCH_DIR, "_failed");

const BACKEND_BASE = (
  process.env.BACKEND_BASE || "http://localhost:8080"
).replace(/\/+$/, "");

const LOT_SHARED_SECRET = String(process.env.LOT_SHARED_SECRET || "").trim();

const IP_DISCOVERY_URL = String(
  process.env.LOT_IP_DISCOVERY_URL || "https://api.ipify.org",
).trim();
const IP_DISCOVERY_TIMEOUT_MS = Number(
  process.env.LOT_IP_DISCOVERY_TIMEOUT_MS || 3000,
);
const ALLOW_IPS = String(
  process.env.ALLOW_IPS || process.env.LOT_ALLOW_IPS || "",
)
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

const WAIT_STABLE_MS = Number(process.env.LOT_WAIT_STABLE_MS || 800);

const TTL_DAYS = Number(process.env.LOT_LOCAL_TTL_DAYS || 15);
const PROCESS_ATTEMPTS = Math.max(
  1,
  Number(process.env.LOT_PROCESS_ATTEMPTS || 2),
);
const PROCESS_RETRY_DELAY_MS = Math.max(
  0,
  Number(process.env.LOT_PROCESS_RETRY_DELAY_MS || 1000),
);
const RESCAN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.LOT_RESCAN_INTERVAL_MS || 0),
);

const inflightFiles = new Set();

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function logLine(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  if (logStream.writable) {
    logStream.write(`${line}\n`, (err) => {
      if (err) {
        console.error("[lot-server] failed to write log line", err);
      }
    });
  }
}

function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".jpg", ".jpeg", ".png"].includes(ext);
}

function formatError(err) {
  if (!err) return "unknown error";
  const parts = [];
  if (err?.message) parts.push(err.message);
  if (err?.cause?.message) parts.push(`cause=${err.cause.message}`);
  if (err?.code) parts.push(`code=${err.code}`);
  return parts.length ? parts.join(" ") : String(err);
}

function extractRecognizedSuffixFromFileName(fileName) {
  const base = path.basename(
    String(fileName || ""),
    path.extname(String(fileName || "")),
  );
  const upper = base.toUpperCase();
  const matches = upper.match(/[A-Z]{3}/g) || [];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const token = String(matches[i] || "").trim();
    if (token && token !== "CAP") {
      return token;
    }
  }
  return "";
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForStableFile(filePath, { timeoutMs = 15000 } = {}) {
  const start = Date.now();
  let lastSize = -1;
  while (Date.now() - start < timeoutMs) {
    try {
      const stat = await fs.stat(filePath);
      const size = stat.size;
      if (size > 0 && size === lastSize) {
        return true;
      }
      lastSize = size;
    } catch {
      // ignore
    }
    await sleep(WAIT_STABLE_MS);
  }
  return false;
}

async function resizeToOneFifth(inputPath) {
  const buf = await fs.readFile(inputPath);
  const img = sharp(buf);
  const meta = await img.metadata();
  const width = meta.width || null;
  const height = meta.height || null;
  if (!width || !height) {
    return { buffer: buf, mimeType: "application/octet-stream" };
  }

  const resized = await img
    .resize({
      width: Math.max(1, Math.round(width * 0.2)),
      height: Math.max(1, Math.round(height * 0.2)),
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { buffer: resized, mimeType: "image/jpeg" };
}

async function apiPostJson(url, json) {
  const headers = { "Content-Type": "application/json" };
  if (LOT_SHARED_SECRET) headers["X-Bridge-Secret"] = LOT_SHARED_SECRET;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(json),
  });

  const text = await res.text().catch(() => "");
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  return { ok: res.ok, status: res.status, body, text };
}

async function uploadToPresignedUrl({ uploadUrl, mimeType, buffer }) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed (${res.status}): ${t || ""}`.trim());
  }
}

async function purgeOldFilesInDir(dirPath, days) {
  try {
    const ttlMs = Math.abs(Number(days) || 0) * 24 * 60 * 60 * 1000;
    if (!ttlMs) return;
    const now = Date.now();
    const entries = await fs
      .readdir(dirPath, { withFileTypes: true })
      .catch(() => []);
    for (const ent of entries) {
      try {
        if (!ent.isFile()) continue;
        const full = path.join(dirPath, ent.name);
        const st = await fs.stat(full);
        if (now - st.mtimeMs > ttlMs) {
          await fs.unlink(full).catch(() => {});
        }
      } catch {}
    }
  } catch {}
}

async function moveFileSafely(src, destDir) {
  await ensureDir(destDir);
  const base = path.basename(src);
  const dest = path.join(destDir, base);
  try {
    await fs.rename(src, dest);
  } catch {
    const buf = await fs.readFile(src);
    await fs.writeFile(dest, buf);
    await fs.unlink(src);
  }
}

function getLocalIpv4Addresses() {
  const nets = os.networkInterfaces() || {};
  const ips = new Set();
  for (const list of Object.values(nets)) {
    for (const info of list || []) {
      if (!info || info.internal) continue;
      const family = typeof info.family === "string" ? info.family : "";
      if (family === "IPv4" || info.family === 4) {
        ips.add(info.address);
      }
    }
  }
  return ips;
}

async function fetchPublicIp() {
  if (!IP_DISCOVERY_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IP_DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(IP_DISCOVERY_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const text = (await res.text())?.trim();
    if (!text) return null;
    return text.split(/\s+/)[0];
  } catch (err) {
    console.warn(
      `[lot-server] public IP discovery failed: ${err?.message || err}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enforceIpAllowlist() {
  if (!ALLOW_IPS.length || ALLOW_IPS.includes("*")) {
    return;
  }

  const localIps = getLocalIpv4Addresses();
  localIps.add("127.0.0.1");
  localIps.add("::1");

  let publicIp = null;
  try {
    publicIp = await fetchPublicIp();
    if (publicIp) {
      localIps.add(publicIp);
    }
  } catch {
    // 이미 fetchPublicIp 내에서 로그 남김
  }

  const localList = Array.from(localIps);
  const allowedMatch = ALLOW_IPS.find((ip) => localIps.has(ip));

  if (!allowedMatch) {
    logLine(
      `[lot-server] IP allowlist blocked start. Allowed=${ALLOW_IPS.join(", ")} local/public=${localList.join(", ") || "(none)"}`,
    );
    process.exit(1);
  }

  logLine(
    `[lot-server] IP allowlist passed (match=${allowedMatch}). Local/Public IPs: ${localList.join(", ")}`,
  );
}

async function processImageOnce(filePath) {
  const originalName = path.basename(filePath);
  const recognizedSuffix = extractRecognizedSuffixFromFileName(originalName);
  const { buffer, mimeType } = await resizeToOneFifth(filePath);
  const fileSize = buffer.length;

  const presign = await apiPostJson(`${BACKEND_BASE}/api/bg/presign-upload`, {
    sourceStep: "packing-capture",
    fileName: originalName.replace(/\s+/g, "_"),
  });

  if (!presign?.ok) {
    throw new Error(
      `presign failed (${presign?.status}): ${presign?.body?.message || presign?.text || ""}`.trim(),
    );
  }

  const presignData = presign.body?.data || presign.body;
  const uploadUrl = presignData?.url;
  const s3Key = presignData?.key;
  const bucket = presignData?.bucket;
  const s3Url = presignData?.s3Url;

  if (!uploadUrl || !s3Key || !bucket || !s3Url) {
    throw new Error("presign response missing fields");
  }

  await uploadToPresignedUrl({ uploadUrl, mimeType, buffer });

  const done = await apiPostJson(`${BACKEND_BASE}/api/bg/lot-capture/packing`, {
    s3Key,
    s3Url,
    originalName,
    fileSize,
    recognizedSuffix,
  });

  if (!done?.ok) {
    throw new Error(
      `capture register failed (${done?.status}): ${done?.body?.message || done?.text || ""}`.trim(),
    );
  }

  return { originalName, fileSize };
}

async function handleNewImage(filePath) {
  if (!isImageFile(filePath)) return;
  if (inflightFiles.has(filePath)) {
    logLine(`[lot-server] skip duplicate in-flight file: ${filePath}`);
    return;
  }

  inflightFiles.add(filePath);

  try {
    logLine(`[lot-server] detected new image: ${filePath}`);

    const stable = await waitForStableFile(filePath);
    if (!stable) {
      await moveFileSafely(filePath, FAILED_DIR);
      logLine(
        `[lot-server] failed (unstable file) -> ${FAILED_DIR}: ${filePath}`,
      );
      return;
    }

    let lastError = null;
    for (let attempt = 1; attempt <= PROCESS_ATTEMPTS; attempt += 1) {
      try {
        const { originalName, fileSize } = await processImageOnce(filePath);
        await moveFileSafely(filePath, PROCESSED_DIR);
        logLine(
          `[lot-server] processed -> ${PROCESSED_DIR}: ${originalName} (${fileSize} bytes, attempts=${attempt})`,
        );
        return;
      } catch (err) {
        lastError = err;
        logLine(
          `[lot-server] attempt ${attempt}/${PROCESS_ATTEMPTS} failed for ${filePath}: ${formatError(err)}`,
        );
        if (attempt < PROCESS_ATTEMPTS && PROCESS_RETRY_DELAY_MS) {
          await sleep(PROCESS_RETRY_DELAY_MS * attempt);
        }
      }
    }

    await moveFileSafely(filePath, FAILED_DIR);
    logLine(
      `[lot-server] failed -> ${FAILED_DIR}: ${filePath} (${formatError(lastError)})`,
    );
  } finally {
    inflightFiles.delete(filePath);
  }
}

async function main() {
  logLine(`[lot-server] service starting (watchDir=${WATCH_DIR})`);
  await enforceIpAllowlist();
  // Ensure base watch directory exists to avoid early exit on some environments
  try {
    await ensureDir(WATCH_DIR);
  } catch {}
  await ensureDir(PROCESSED_DIR);
  await ensureDir(FAILED_DIR);

  await purgeOldFilesInDir(PROCESSED_DIR, TTL_DAYS);
  await purgeOldFilesInDir(FAILED_DIR, TTL_DAYS);
  setInterval(
    () => {
      purgeOldFilesInDir(PROCESSED_DIR, TTL_DAYS).catch(() => {});
      purgeOldFilesInDir(FAILED_DIR, TTL_DAYS).catch(() => {});
    },
    6 * 60 * 60 * 1000,
  );

  try {
    const entries = await fs
      .readdir(WATCH_DIR, { withFileTypes: true })
      .catch(() => []);
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const full = path.join(WATCH_DIR, ent.name);
      if (!isImageFile(full)) continue;
      try {
        await handleNewImage(full);
      } catch (err) {
        logLine(
          `[lot-server] initial scan error for ${full}: ${err?.message || err}`,
        );
      }
    }
  } catch {}

  const watcher = chokidar.watch(WATCH_DIR, {
    ignored: (p) =>
      p.includes("_processed") ||
      p.includes("_failed") ||
      p.endsWith(".tmp") ||
      p.endsWith(".crdownload"),
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: WAIT_STABLE_MS,
      pollInterval: 100,
    },
  });

  watcher.on("add", (p) => {
    handleNewImage(p).catch((err) => {
      logLine(
        `[lot-server] watcher add error for ${p}: ${err?.message || err}`,
      );
    });
  });

  watcher.on("change", (p) => {
    handleNewImage(p).catch((err) => {
      logLine(
        `[lot-server] watcher change error for ${p}: ${err?.message || err}`,
      );
    });
  });

  watcher.on("error", (err) => {
    logLine(`[lot-server] watcher error: ${err?.message || err}`);
  });

  watcher.on("ready", () => {
    logLine(`[lot-server] watcher ready (${WATCH_DIR})`);
  });

  // 운영 기본 경로는 watcher + startup scan이다.
  // 전체 디렉토리 재스캔은 네트워크 드라이브/특수 환경에서만 쓰는 진단용 fallback이라
  // 기본값은 비활성화하고, 필요할 때만 env로 켠다.
  if (RESCAN_INTERVAL_MS > 0) {
    setInterval(() => {
      fs.readdir(WATCH_DIR, { withFileTypes: true })
        .then((entries) => {
          for (const ent of entries) {
            if (!ent.isFile()) continue;
            const full = path.join(WATCH_DIR, ent.name);
            handleNewImage(full).catch(() => {});
          }
        })
        .catch((err) => {
          logLine(`[lot-server] rescan failed: ${err?.message || err}`);
        });
    }, RESCAN_INTERVAL_MS);
    logLine(`[lot-server] fallback rescan enabled: ${RESCAN_INTERVAL_MS}ms`);
  }

  logLine(`[lot-server] watching: ${WATCH_DIR}`);
  logLine(`[lot-server] backend: ${BACKEND_BASE}`);
}

process.on("uncaughtException", (err) => {
  logLine(`[lot-server] uncaughtException: ${formatError(err)}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logLine(`[lot-server] unhandledRejection: ${formatError(reason)}`);
  process.exit(1);
});

main().catch((e) => {
  logLine(`[lot-server] fatal: ${formatError(e)}`);
  process.exit(1);
});
