// related files:
// - web/backend/tests/setup.js
// - web/backend/scripts/db/_mongo.js
// - web/backend/rules.md

/**
 * Jest wipe/connect 안전 가드.
 * 공유 Atlas(abuts_fit_test 등)에 MONGODB_URI_TEST를 export한 채 jest를 돌리면
 * afterEach deleteMany가 운영 데이터를 지울 수 있다. 로컬 호스트만 허용한다.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function redactMongoUri(uri) {
  const s = String(uri || "");
  if (!s) return "";
  return s.replace(/\/\/([^/@]+)@/, "//***@");
}

export function getDbNameFromMongoUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw) return "";
  const withoutQuery = raw.split("?")[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function hostsFromMongoUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw) return [];

  // mongodb+srv always remote for our purposes
  if (/^mongodb\+srv:/i.test(raw)) return ["__atlas_srv__"];

  // mongodb://[user:pass@]host[:port][,host2...][/db]
  const withoutScheme = raw.replace(/^mongodb:\/\//i, "");
  const authority = withoutScheme.split("/")[0] || "";
  const hostPortPart = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;

  return hostPortPart
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\[(.*)\]$/, "$1").split(":")[0].toLowerCase())
    .filter(Boolean);
}

export function isLocalHostName(host) {
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  if (!h) return false;
  if (LOCAL_HOSTS.has(h)) return true;
  // reject anything that looks like Atlas / cloud
  if (h.includes("mongodb.net")) return false;
  if (h.includes("mongo.ondigitalocean.com")) return false;
  return false;
}

export function isLocalMongoUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw) return false;
  if (/mongodb\.net/i.test(raw)) return false;
  if (/mongo\.ondigitalocean\.com/i.test(raw)) return false;
  if (/^mongodb\+srv:/i.test(raw)) return false;

  const hosts = hostsFromMongoUri(raw);
  if (!hosts.length) return false;
  return hosts.every((h) => isLocalHostName(h));
}

export function assertLocalJestMongoUri(uri) {
  const raw = String(uri || "").trim();
  if (!isLocalMongoUri(raw)) {
    const dbName = getDbNameFromMongoUri(raw) || "unknown";
    throw new Error(
      [
        "Jest refuses to connect/wipe a non-local MongoDB.",
        `uri=${redactMongoUri(raw)} db=${dbName}`,
        "Use a local URI only (e.g. mongodb://127.0.0.1:27017/abutsFitTest).",
        "Do not export MONGODB_URI_TEST from local.env/test.env (Atlas) into the Jest process.",
      ].join(" "),
    );
  }
}

export function resolveJestMongoUri() {
  return (
    process.env.MONGODB_URI_TEST ||
    process.env.MONGO_URI_TEST ||
    "mongodb://127.0.0.1:27017/abutsFitTest"
  );
}
