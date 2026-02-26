const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PORT = Number(process.env.PRINT_SERVER_PORT || 5777);
const ALLOW_ORIGIN = process.env.PRINT_SERVER_ORIGIN || "*";

const log = (message, meta) => {
  const stamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[print-server] ${stamp} ${message}${suffix}`);
};

const jsonResponse = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

const listPrinters = () =>
  new Promise((resolve, reject) => {
    execFile("lpstat", ["-p"], (err, stdout) => {
      if (err) return reject(err);
      const printers = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\s+/).filter(Boolean);
          if (!parts.length) return "";
          if (parts[0] === "printer" && parts[1]) return parts[1];
          return parts[0];
        })
        .filter(Boolean);
      resolve(printers);
    });
  });

const resolvePrinter = async (requestedPrinter) => {
  const printer = String(requestedPrinter || "").trim();
  if (printer) return printer;
  const printers = await listPrinters().catch(() => []);
  if (Array.isArray(printers) && printers.length > 0) {
    return printers[0];
  }
  return "";
};

const downloadToTemp = (url) =>
  new Promise((resolve, reject) => {
    const tempPath = path.join(
      os.tmpdir(),
      `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
    );
    const fileStream = fs.createWriteStream(tempPath);
    const client = url.startsWith("https") ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode !== 200) {
        fileStream.close();
        fs.unlink(tempPath, () => undefined);
        return reject(new Error(`Download failed: ${response.statusCode}`));
      }
      response.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        resolve(tempPath);
      });
    });
    request.on("error", (err) => {
      fileStream.close();
      fs.unlink(tempPath, () => undefined);
      reject(err);
    });
  });

const writeBase64ToTemp = async (base64) => {
  const tempPath = path.join(
    os.tmpdir(),
    `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
  );
  const data = Buffer.from(base64, "base64");
  await fs.promises.writeFile(tempPath, data);
  return tempPath;
};

const writeTextToTemp = async (text, ext) => {
  const tempPath = path.join(
    os.tmpdir(),
    `hanjin-label-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`,
  );
  await fs.promises.writeFile(tempPath, text, "utf8");
  return tempPath;
};

const printFile = (filePath, printer, title) =>
  new Promise((resolve, reject) => {
    const args = [];
    if (printer) args.push("-d", printer);
    if (title) args.push("-t", title);
    args.push(filePath);
    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    return jsonResponse(res, 400, { success: false, message: "Invalid URL" });
  }

  log("request", { method: req.method, url: req.url });

  if (req.method === "OPTIONS") {
    return jsonResponse(res, 204, { success: true });
  }

  if (req.url === "/health" && req.method === "GET") {
    return jsonResponse(res, 200, { success: true, status: "ok" });
  }

  if (req.url === "/printers" && req.method === "GET") {
    try {
      const printers = await listPrinters();
      log("printers", { count: printers.length });
      return jsonResponse(res, 200, { success: true, printers });
    } catch (error) {
      log("printers:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  if (req.url === "/print" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const url = payload.url;
      const base64 = payload.base64;
      const printer = await resolvePrinter(payload.printer);
      const title = payload.title || "Hanjin Label";

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      if (!url && !base64) {
        return jsonResponse(res, 400, {
          success: false,
          message: "url 또는 base64가 필요합니다.",
        });
      }

      const tempPath = url
        ? await downloadToTemp(url)
        : await writeBase64ToTemp(base64);

      log("print:queued", { printer, title, source: url ? "url" : "base64" });

      try {
        await printFile(tempPath, printer, title);
        log("print:done", { printer, title });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, { success: true });
    } catch (error) {
      log("print:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  if (req.url === "/print-zpl" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const zpl = payload.zpl;
      const printer = await resolvePrinter(payload.printer);
      const title = payload.title || "Hanjin Label";

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      if (!zpl || typeof zpl !== "string") {
        return jsonResponse(res, 400, {
          success: false,
          message: "zpl 문자열이 필요합니다.",
        });
      }

      const tempPath = await writeTextToTemp(zpl, "zpl");

      log("print-zpl:queued", { printer, title });

      try {
        const args = [];
        if (printer) args.push("-d", printer);
        if (title) args.push("-t", title);
        args.push("-o", "raw");
        args.push(tempPath);
        await new Promise((resolve, reject) => {
          execFile("lp", args, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
          });
        });
        log("print-zpl:done", { printer, title });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, { success: true });
    } catch (error) {
      log("print-zpl:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  return jsonResponse(res, 404, { success: false, message: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`Print server running on http://localhost:${PORT}`);
});
