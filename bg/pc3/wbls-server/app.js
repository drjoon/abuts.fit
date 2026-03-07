const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { log } = require("./utils/logger");

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

const PORT = Number(process.env.PRINT_SERVER_PORT || 8005);
const ALLOW_ORIGIN = process.env.PRINT_SERVER_ORIGIN || "*";
const DEFAULT_MEDIA_PROFILE = String(
  process.env.WBL_MEDIA_DEFAULT || "FS",
).trim();
const DEFAULT_PRINTER = String(
  process.env.PRINT_SERVER_DEFAULT_PRINTER || "",
).trim();
const ALLOW_IPS = String(
  process.env.ALLOW_IPS || process.env.WBL_ALLOW_IPS || "",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isWindows = process.platform === "win32";

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

const normalizeIp = (ip) => {
  let v = String(ip || "").trim();
  if (!v) return "";
  if (v.startsWith("::ffff:")) v = v.slice(7);
  if (v === "::1") return "127.0.0.1";
  return v;
};

const getClientIp = (req) => {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const raw = xf || req.socket?.remoteAddress || "";
  return normalizeIp(raw);
};

const isIpAllowed = (req) => {
  if (!ALLOW_IPS.length || ALLOW_IPS.includes("*")) return true;
  const ip = getClientIp(req);
  return ALLOW_IPS.includes(ip);
};

const requireIpAllowed = (req, res) => {
  if (isIpAllowed(req)) return true;
  log("blocked:ip", { ip: getClientIp(req) });
  jsonResponse(res, 403, {
    success: false,
    message: "Forbidden (IP not allowed)",
  });
  return false;
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
    if (isWindows) {
      const psScript = [
        "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {",
        "  Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name",
        "} elseif (Get-Command Get-WmiObject -ErrorAction SilentlyContinue) {",
        "  Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name",
        "} else {",
        '  throw "No printer query cmdlets available"',
        "}",
      ].join("; ");

      const psArgs = ["-NoProfile", "-Command", psScript];

      execFile(
        "powershell.exe",
        psArgs,
        { windowsHide: true },
        (err, stdout) => {
          if (err) return reject(err);
          const printers = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          return resolve(printers);
        },
      );
      return;
    }

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
  if (DEFAULT_PRINTER) return DEFAULT_PRINTER;
  const printers = await listPrinters().catch(() => []);
  if (Array.isArray(printers) && printers.length > 0) {
    return printers[0];
  }
  return "";
};

const toPsSingleQuoted = (value) => {
  const raw = String(value ?? "");
  return `'${raw.replace(/'/g, "''")}'`;
};

const printRawZplWindows = ({ filePath, printer, title }) =>
  new Promise((resolve, reject) => {
    const targetPrinter = String(printer || DEFAULT_PRINTER || "").trim();
    if (!targetPrinter) {
      return reject(new Error("Printer is required"));
    }

    const escapedPrinter = toPsSingleQuoted(targetPrinter);
    const escapedFilePath = toPsSingleQuoted(filePath);
    const escapedJobTitle = toPsSingleQuoted(String(title || "Hanjin Label"));

    const psScript = [
      `$printerName = ${escapedPrinter}`,
      `$filePath = ${escapedFilePath}`,
      `$jobTitle = ${escapedJobTitle}`,
      'Add-Type -TypeDefinition @"',
      "using System;",
      "using System.Runtime.InteropServices;",
      "public static class RawPrinterHelper {",
      "  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]",
      "  public class DOCINFOA {",
      "    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;",
      "    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;",
      "    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;",
      "  }",
      '  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]',
      "  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);",
      '  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]',
      "  public static extern bool ClosePrinter(IntPtr hPrinter);",
      '  [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]',
      "  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);",
      '  [DllImport("winspool.drv", SetLastError=true)]',
      "  public static extern bool EndDocPrinter(IntPtr hPrinter);",
      '  [DllImport("winspool.drv", SetLastError=true)]',
      "  public static extern bool StartPagePrinter(IntPtr hPrinter);",
      '  [DllImport("winspool.drv", SetLastError=true)]',
      "  public static extern bool EndPagePrinter(IntPtr hPrinter);",
      '  [DllImport("winspool.drv", SetLastError=true)]',
      "  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);",
      "}",
      '"@',
      "$bytes = [System.IO.File]::ReadAllBytes($filePath)",
      "$docInfo = New-Object RawPrinterHelper+DOCINFOA",
      "$docInfo.pDocName = $jobTitle",
      '$docInfo.pDataType = "RAW"',
      "$handle = [IntPtr]::Zero",
      "$opened = [RawPrinterHelper]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)",
      'if (-not $opened) { throw "OpenPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
      "$ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)",
      "try {",
      "  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)",
      '  if (-not [RawPrinterHelper]::StartDocPrinter($handle, 1, $docInfo)) { throw "StartDocPrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
      "  try {",
      '    if (-not [RawPrinterHelper]::StartPagePrinter($handle)) { throw "StartPagePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
      "    try {",
      "      $written = 0",
      '      if (-not [RawPrinterHelper]::WritePrinter($handle, $ptr, $bytes.Length, [ref]$written)) { throw "WritePrinter failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }',
      '      if ($written -ne $bytes.Length) { throw "Incomplete RAW write: $written / $($bytes.Length)" }',
      "    } finally {",
      "      [void][RawPrinterHelper]::EndPagePrinter($handle)",
      "    }",
      "  } finally {",
      "    [void][RawPrinterHelper]::EndDocPrinter($handle)",
      "  }",
      "} finally {",
      "  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }",
      "  if ($handle -ne [IntPtr]::Zero) { [void][RawPrinterHelper]::ClosePrinter($handle) }",
      "}",
      "if (-not [RawPrinterHelper]::ClosePrinter($handle)) { }",
    ].join("\r\n");

    const psArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      psScript,
    ];

    log("print-zpl:windows", { printer: targetPrinter, filePath });

    execFile(
      "powershell.exe",
      psArgs,
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      },
    );
  });

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

const MEDIA_PROFILE_MAP = {
  NS: "NS",
  NL: "NL",
  FS: "FS",
};

const resolveMediaProfile = (paperProfile) => {
  const key = typeof paperProfile === "string" ? paperProfile.trim() : "";
  if (key && MEDIA_PROFILE_MAP[key]) return MEDIA_PROFILE_MAP[key];
  if (key) return key;
  return DEFAULT_MEDIA_PROFILE || "";
};

const buildLpArgs = ({ filePath, printer, title, paperProfile, raw }) => {
  const args = [];
  if (printer) args.push("-d", printer);
  if (title) args.push("-t", title);
  const media = resolveMediaProfile(paperProfile);
  if (media) {
    args.push("-o", `media=${media}`);
  }
  if (raw) {
    args.push("-o", "raw");
  }
  args.push(filePath);
  return args;
};

const printFile = ({ filePath, printer, title, paperProfile, raw = false }) =>
  new Promise((resolve, reject) => {
    if (isWindows && raw) {
      printRawZplWindows({ filePath, printer, title })
        .then(resolve)
        .catch(reject);
      return;
    }

    const args = buildLpArgs({ filePath, printer, title, paperProfile, raw });
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

  if (!requireIpAllowed(req, res)) return;

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
    return jsonResponse(res, 410, {
      success: false,
      message: "Legacy PDF printing is disabled. Use /print-zpl.",
    });
  }

  if (req.url === "/print-zpl" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const zpl = payload.zpl;
      const printer = await resolvePrinter(payload.printer);
      const title = payload.title || "Hanjin Label";
      const paperProfile =
        typeof payload.paperProfile === "string"
          ? payload.paperProfile.trim()
          : "";

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
        await printFile({
          filePath: tempPath,
          printer,
          title,
          paperProfile,
          raw: true,
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
