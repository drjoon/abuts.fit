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
const SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();

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

const resolvePrinter = async ({ requestedPrinter }) => {
  const direct = String(requestedPrinter || "").trim();
  if (direct) return direct;

  const fallback = String(DEFAULT_PRINTER || "").trim();
  if (fallback) return fallback;

  const printers = await listPrinters().catch(() => []);
  if (Array.isArray(printers) && printers.length > 0) {
    return printers[0];
  }

  return "";
};

const safeText = (value, maxLen = 36) => {
  const s = String(value || "")
    .replace(/[\^~\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const mmToDots = (mm, dpi) => {
  const mmNum = Number(mm);
  const dpiNum = Number(dpi);
  if (!Number.isFinite(mmNum) || !Number.isFinite(dpiNum) || dpiNum <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((mmNum / 25.4) * dpiNum));
};

const resolvePackZplSize = (payload) => {
  const zplPW = Number(payload?.zplPW);
  const zplLL = Number(payload?.zplLL);
  if (
    Number.isFinite(zplPW) &&
    zplPW > 0 &&
    Number.isFinite(zplLL) &&
    zplLL > 0
  ) {
    return { pw: Math.floor(zplPW), ll: Math.floor(zplLL) };
  }

  const paperProfile = String(payload?.paperProfile || "").trim();
  const dpi = Number(payload?.dpi) || 203;
  if (paperProfile === "PACK_80x65") {
    return { pw: mmToDots(80, dpi), ll: mmToDots(65, dpi) };
  }

  return { pw: 812, ll: 520 };
};

const buildPackingLabelZpl = (payload) => {
  const requestId = safeText(payload.requestId, 40);
  const lotNumber = safeText(payload.lotNumber, 20).toUpperCase();
  const mailboxCode = safeText(payload.mailboxCode || "-", 12).toUpperCase();
  const businessName = safeText(payload.businessName || "-", 28);
  const screwType = safeText(payload.screwType || "-", 4).toUpperCase();
  const patientName = safeText(payload.patientName, 32);
  const toothNumber = safeText(payload.toothNumber, 18);
  const material = safeText(payload.material, 20);
  const caseType = safeText(payload.caseType || "Custom Abutment", 28);
  const printedAt = safeText(payload.printedAt || new Date().toISOString(), 26);

  const { pw, ll } = resolvePackZplSize(payload);

  const qrData = safeText(
    JSON.stringify({ requestId, lotNumber, toothNumber, printedAt }),
    180,
  );

  return [
    "^XA",
    `^PW${pw || 812}`,
    `^LL${ll || 520}`,
    "^LH0,0",
    "^CI28",
    `^FO20,18^A0N,44,44^FD${mailboxCode}^FS`,
    `^FO620,10^A0N,72,72^FD${screwType}^FS`,
    "^FO20,70^A0N,28,28^FDBIZ:^FS",
    `^FO95,70^A0N,32,32^FD${businessName}^FS`,
    "^FO20,110^GB772,2,2^FS",
    `^FO20,124^A0N,26,26^FDLOT: ${lotNumber || "-"}^FS`,
    `^FO20,156^A0N,24,24^FDReq: ${requestId || "-"}^FS`,
    `^FO20,186^A0N,24,24^FDPatient: ${patientName || "-"}^FS`,
    `^FO20,216^A0N,24,24^FDTooth: ${toothNumber || "-"}^FS`,
    `^FO20,246^A0N,24,24^FDMaterial: ${material || "-"}^FS`,
    `^FO20,276^A0N,24,24^FDType: ${caseType || "-"}^FS`,
    `^FO20,306^A0N,22,22^FDPrinted: ${printedAt || "-"}^FS`,
    "^FO600,240^BQN,2,4",
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

const printRawZpl = ({ filePath, printer, title, copies, paperProfile }) =>
  new Promise((resolve, reject) => {
    const args = ["-o", "raw"];
    if (printer) args.push("-d", printer);
    if (title) args.push("-t", title);
    const media = typeof paperProfile === "string" ? paperProfile.trim() : "";
    if (media) args.push("-o", `media=${media}`);
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
      const printer = await resolvePrinter({
        requestedPrinter: payload.printer,
      });
      const title = String(payload.title || "Packing Label").trim();
      const copiesRaw = Number(payload.copies);
      const copies =
        Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";

      if (!zpl) {
        return jsonResponse(res, 400, {
          success: false,
          message: "zpl 필드가 필요합니다.",
        });
      }

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({
          filePath: tempPath,
          printer,
          title,
          copies,
          paperProfile,
        });
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

      const printer = await resolvePrinter({
        requestedPrinter: payload.printer,
      });
      const title = String(payload.title || "Custom Abutment Packing").trim();
      const copiesRaw = Number(payload.copies);
      const copies =
        Number.isFinite(copiesRaw) && copiesRaw > 0 ? copiesRaw : 1;
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";
      const zpl = buildPackingLabelZpl(payload);

      if (!printer) {
        return jsonResponse(res, 400, {
          success: false,
          message:
            "사용 가능한 프린터가 없습니다. 프린터를 OS(CUPS)에 등록하거나 printer 값을 지정해주세요.",
        });
      }

      const tempPath = await writeZplToTemp(zpl);
      try {
        await printRawZpl({
          filePath: tempPath,
          printer,
          title,
          copies,
          paperProfile,
        });
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
