const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), "local.env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    if (typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PACK_PRINT_SERVER_PORT || 5788);
const ALLOW_ORIGIN = process.env.PACK_PRINT_SERVER_ORIGIN || "*";
const DEFAULT_PRINTER = process.env.PACK_PRINT_SERVER_DEFAULT_PRINTER || "";
const SHARED_SECRET = String(process.env.PACK_PRINT_SERVER_SHARED_SECRET || "").trim();

const log = (message, meta) => {
  const stamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[pack-server] ${stamp} ${message}${suffix}`);
};

const jsonResponse = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-pack-secret",
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
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
        .map((line) => line.split(" ")[1])
        .filter(Boolean);
      resolve(printers);
    });
  });

const safeText = (value, maxLen = 36) => {
  const s = String(value || "")
    .replace(/[\^~\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const buildPackingLabelZpl = (payload) => {
  const requestId = safeText(payload.requestId, 40);
  const lotNumber = safeText(payload.lotNumber, 20).toUpperCase();
  const patientName = safeText(payload.patientName, 32);
  const toothNumber = safeText(payload.toothNumber, 18);
  const material = safeText(payload.material, 20);
  const caseType = safeText(payload.caseType || "Custom Abutment", 28);
  const printedAt = safeText(payload.printedAt || new Date().toISOString(), 26);

  const qrData = safeText(
    JSON.stringify({ requestId, lotNumber, toothNumber, printedAt }),
    180,
  );

  return [
    "^XA",
    "^PW812",
    "^LL406",
    "^LH0,0",
    "^CI28",
    "^FO24,20^A0N,36,36^FDABUTS PACKING LABEL^FS",
    "^FO24,64^GB764,2,2^FS",
    `^FO24,82^A0N,30,30^FDReq: ${requestId || "-"}^FS`,
    `^FO24,122^A0N,42,42^FDLOT: ${lotNumber || "-"}^FS`,
    `^FO24,172^A0N,30,30^FDPatient: ${patientName || "-"}^FS`,
    `^FO24,210^A0N,30,30^FDTooth: ${toothNumber || "-"}^FS`,
    `^FO24,248^A0N,30,30^FDMaterial: ${material || "-"}^FS`,
    `^FO24,286^A0N,30,30^FDType: ${caseType || "-"}^FS`,
    `^FO24,324^A0N,24,24^FDPrinted: ${printedAt || "-"}^FS`,
    "^FO620,110^BQN,2,6",
    `^FDLA,${qrData || "-"}^FS`,
    "^XZ",
  ].join("\n");
};

const writeZplToTemp = async (zpl) => {
  const tempPath = path.join(
    os.tmpdir(),
    `abuts-pack-${Date.now()}-${Math.random().toString(16).slice(2)}.zpl`,
  );
  await fs.promises.writeFile(tempPath, zpl, "utf8");
  return tempPath;
};

const printRawZpl = ({ filePath, printer, title, copies }) =>
  new Promise((resolve, reject) => {
    const args = ["-o", "raw"];
    if (printer) args.push("-d", printer);
    if (title) args.push("-t", title);
    if (Number.isFinite(copies) && copies > 1) {
      args.push("-n", String(Math.floor(copies)));
    }
    args.push(filePath);

    execFile("lp", args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });

const requireSecret = (req, res) => {
  if (!SHARED_SECRET) return true;
  if (req.url === "/health") return true;

  const incoming = String(req.headers["x-pack-secret"] || "").trim();
  if (!incoming || incoming !== SHARED_SECRET) {
    jsonResponse(res, 401, {
      success: false,
      message: "Unauthorized",
    });
    return false;
  }
  return true;
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    return jsonResponse(res, 400, { success: false, message: "Invalid URL" });
  }

  if (req.method === "OPTIONS") {
    return jsonResponse(res, 204, { success: true });
  }

  if (!requireSecret(req, res)) return;

  log("request", { method: req.method, url: req.url });

  if (req.url === "/health" && req.method === "GET") {
    return jsonResponse(res, 200, {
      success: true,
      status: "ok",
      defaultPrinter: DEFAULT_PRINTER || null,
    });
  }

  if (req.url === "/printers" && req.method === "GET") {
    try {
      const printers = await listPrinters();
      return jsonResponse(res, 200, {
        success: true,
        printers,
        defaultPrinter: DEFAULT_PRINTER || null,
      });
    } catch (error) {
      log("printers:error", { message: error.message });
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
      const zpl = String(payload.zpl || "").trim();
      const printer = String(payload.printer || DEFAULT_PRINTER || "").trim();
      const title = String(payload.title || "Packing Label").trim();
      const copiesRaw = Number(payload.copies);
      const copies = Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;

      if (!zpl) {
        return jsonResponse(res, 400, {
          success: false,
          message: "zpl 필드가 필요합니다.",
        });
      }

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({ filePath: tempPath, printer, title, copies });
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

  if (req.url === "/print-packing-label" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};

      const printer = String(payload.printer || DEFAULT_PRINTER || "").trim();
      const title = String(payload.title || "Custom Abutment Packing").trim();
      const copiesRaw = Number(payload.copies);
      const copies = Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;
      const zpl = buildPackingLabelZpl(payload);

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({ filePath: tempPath, printer, title, copies });
      } finally {
        fs.unlink(tempPath, () => undefined);
      }

      return jsonResponse(res, 200, {
        success: true,
        generated: {
          requestId: safeText(payload.requestId, 40),
          lotNumber: safeText(payload.lotNumber, 20).toUpperCase(),
        },
      });
    } catch (error) {
      log("print-packing-label:error", { message: error.message });
      return jsonResponse(res, 500, {
        success: false,
        message: error.message,
      });
    }
  }

  return jsonResponse(res, 404, { success: false, message: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`Pack print server running on http://localhost:${PORT}`);
});
