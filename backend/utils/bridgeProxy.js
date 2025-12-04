import { config } from "dotenv";
config();

const BRIDGE_BASE = process.env.BRIDGE_BASE || "http://1.217.31.227:4005";
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;

function buildBridgeUrl(basePath, req) {
  const url = new URL(basePath, BRIDGE_BASE);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value != null) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

export function proxyToBridge(basePath) {
  return async (req, res) => {
    try {
      const url = buildBridgeUrl(basePath, req);
      const headers = {};
      if (BRIDGE_SHARED_SECRET) {
        headers["X-Bridge-Secret"] = BRIDGE_SHARED_SECRET;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        headers["Content-Type"] = "application/json";
      }

      const init = {
        method: req.method,
        headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD") {
        const body =
          req.body && Object.keys(req.body).length > 0 ? req.body : null;
        if (body) {
          init.body = JSON.stringify(body);
        }
      }

      const response = await fetch(url, init);
      const contentType = response.headers.get("content-type") || "";

      // ZIP 등 바이너리 응답은 그대로 스트림/버퍼로 전달
      if (contentType.startsWith("application/zip")) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.status(response.status);
        res.setHeader("Content-Type", contentType);

        const cd = response.headers.get("content-disposition");
        if (cd) {
          res.setHeader("Content-Disposition", cd);
        }

        return res.send(buffer);
      }

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = text;
      }
      res.status(response.status).json(data);
    } catch (error) {
      console.error("proxyToBridge error", error);
      res.status(500).json({
        success: false,
        message: "bridge proxy failed",
        error: String(error?.message || error),
      });
    }
  };
}
