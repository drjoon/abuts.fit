const PACK_PRINT_SERVER_BASE = String(
  process.env.PACK_PRINT_SERVER_BASE || "http://localhost:5788",
).trim();
const PACK_PRINT_SERVER_SHARED_SECRET = String(
  process.env.PACK_PRINT_SERVER_SHARED_SECRET || "",
).trim();
const PACK_PRINT_SERVER_TIMEOUT_MS = Number(
  process.env.PACK_PRINT_SERVER_TIMEOUT_MS ||
    process.env.PACK_PRINT_TIMEOUT_MS ||
    15000,
);

const PACK_PAPER_DEFAULT = String(
  process.env.PACK_PAPER_DEFAULT || "PACK_80x65",
).trim();
const PACK_PAPER_OPTIONS = String(
  process.env.PACK_PAPER_OPTIONS || "PACK_80x65",
)
  .split(",")
  .map((v) => String(v || "").trim())
  .filter(Boolean);

const PACK_LABEL_DPI = Number(process.env.PACK_LABEL_DPI || 203);

const mmToDots = (mm, dpi) => {
  const mmNum = Number(mm);
  const dpiNum = Number(dpi);
  if (!Number.isFinite(mmNum) || !Number.isFinite(dpiNum) || dpiNum <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((mmNum / 25.4) * dpiNum));
};

const withTimeout = async (promise, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const value = await promise(controller.signal);
    return value;
  } finally {
    clearTimeout(timer);
  }
};

export async function getPackPrintSettings(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      paper: {
        default: PACK_PAPER_DEFAULT || null,
        options: PACK_PAPER_OPTIONS,
      },
      dpi:
        Number.isFinite(PACK_LABEL_DPI) && PACK_LABEL_DPI > 0
          ? PACK_LABEL_DPI
          : 203,
    },
  });
}

const callPackServer = async ({ path, method, body }) => {
  if (!PACK_PRINT_SERVER_BASE) {
    const error = new Error("pack_print_server_not_configured");
    error.statusCode = 400;
    throw error;
  }

  const url = `${PACK_PRINT_SERVER_BASE.replace(/\/+$/, "")}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (PACK_PRINT_SERVER_SHARED_SECRET) {
    headers["x-pack-secret"] = PACK_PRINT_SERVER_SHARED_SECRET;
  }

  const res = await withTimeout(
    (signal) =>
      fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      }),
    PACK_PRINT_SERVER_TIMEOUT_MS,
  );

  const text = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  return { res, text, body: parsed };
};

/**
 * @route GET /api/requests/packing/printers
 */
export async function getPackPrinters(req, res) {
  try {
    const { res: upstream, body } = await callPackServer({
      path: "/printers",
      method: "GET",
    });

    if (!upstream.ok || !body?.success) {
      return res.status(upstream.status || 502).json({
        success: false,
        message: body?.message || "프린터 목록을 불러올 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      printers: Array.isArray(body.printers) ? body.printers : [],
      defaultPrinter: body.defaultPrinter || null,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({
      success: false,
      message:
        error?.message === "pack_print_server_not_configured"
          ? "PACK_PRINT_SERVER_BASE가 설정되지 않았습니다."
          : error?.message || "프린터 목록 조회 중 오류가 발생했습니다.",
    });
  }
}

/**
 * @route POST /api/requests/packing/print-packing-label
 */
export async function printPackPackingLabel(req, res) {
  try {
    const payload =
      req.body && typeof req.body === "object" ? { ...req.body } : {};

    const requestedPaper = String(payload.paperProfile || "").trim();
    const allowed = Array.isArray(PACK_PAPER_OPTIONS) ? PACK_PAPER_OPTIONS : [];
    const resolvedPaper =
      requestedPaper && allowed.includes(requestedPaper)
        ? requestedPaper
        : String(PACK_PAPER_DEFAULT || "").trim();
    payload.paperProfile = resolvedPaper || undefined;

    const dpi =
      Number.isFinite(PACK_LABEL_DPI) && PACK_LABEL_DPI > 0
        ? PACK_LABEL_DPI
        : 203;
    payload.dpi = dpi;

    if (payload.paperProfile === "PACK_80x65") {
      payload.zplPW = mmToDots(80, dpi);
      payload.zplLL = mmToDots(65, dpi);
    }

    const {
      res: upstream,
      body,
      text,
    } = await callPackServer({
      path: "/print-packing-label",
      method: "POST",
      body: payload,
    });

    if (!upstream.ok || !body?.success) {
      return res.status(upstream.status || 502).json({
        success: false,
        message: body?.message || text || "패킹 라벨 출력에 실패했습니다.",
      });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({
      success: false,
      message:
        error?.message === "pack_print_server_not_configured"
          ? "PACK_PRINT_SERVER_BASE가 설정되지 않았습니다."
          : error?.message || "패킹 라벨 출력 중 오류가 발생했습니다.",
    });
  }
}
