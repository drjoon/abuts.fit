import chokidar from "chokidar";
import dotenv from "dotenv";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

dotenv.config({ path: path.resolve(process.cwd(), "local.env") });

const WATCH_DIR = process.env.LOT_WATCH_DIR || "C:/abuts.fit/images";
const PROCESSED_DIR =
  process.env.LOT_PROCESSED_DIR || path.join(WATCH_DIR, "_processed");
const FAILED_DIR =
  process.env.LOT_FAILED_DIR || path.join(WATCH_DIR, "_failed");

const BACKEND_BASE = (
  process.env.BACKEND_BASE || "http://localhost:8080"
).replace(/\/+$/, "");

const BRIDGE_SECRET = String(process.env.BRIDGE_SHARED_SECRET || "").trim();

const WAIT_STABLE_MS = Number(process.env.LOT_WAIT_STABLE_MS || 800);

const TTL_DAYS = Number(process.env.LOT_LOCAL_TTL_DAYS || 15);

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".jpg", ".jpeg", ".png"].includes(ext);
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
  if (BRIDGE_SECRET) headers["X-Bridge-Secret"] = BRIDGE_SECRET;

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

async function handleNewImage(filePath) {
  if (!isImageFile(filePath)) return;

  const stable = await waitForStableFile(filePath);
  if (!stable) {
    await moveFileSafely(filePath, FAILED_DIR);
    return;
  }

  try {
    const originalName = path.basename(filePath);
    const { buffer, mimeType } = await resizeToOneFifth(filePath);

    const presign = await apiPostJson(`${BACKEND_BASE}/api/bg/presign-upload`, {
      sourceStep: "packaging-capture",
      fileName: originalName.replace(/\s+/g, "_"),
    });

    if (!presign.ok) {
      throw new Error(
        `presign failed (${presign.status}): ${presign.body?.message || presign.text || ""}`.trim(),
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

    const done = await apiPostJson(
      `${BACKEND_BASE}/api/bg/lot-capture/packaging`,
      {
        s3Key,
        s3Url,
        originalName,
        fileSize: buffer.length,
      },
    );

    if (!done.ok) {
      throw new Error(
        `capture register failed (${done.status}): ${done.body?.message || done.text || ""}`.trim(),
      );
    }

    await moveFileSafely(filePath, PROCESSED_DIR);
  } catch (e) {
    await moveFileSafely(filePath, FAILED_DIR);
  }
}

async function main() {
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
    handleNewImage(p).catch(() => {});
  });

  console.log(`[lot-server] watching: ${WATCH_DIR}`);
  console.log(`[lot-server] backend: ${BACKEND_BASE}`);
}

main().catch((e) => {
  console.error("[lot-server] fatal:", e);
  process.exit(1);
});
