import https from "https";
import http from "http";

export async function httpJson({ url, method = "GET", headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const isHttps = target.protocol === "https:";
    const transport = isHttps ? https : http;

    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const status = res.statusCode || 0;
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({ status, data, raw, headers: res.headers });
        });
      }
    );

    req.on("error", reject);

    if (body !== undefined) {
      const payload = typeof body === "string" ? body : JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}
