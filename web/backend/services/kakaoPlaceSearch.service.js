// related files:
// - web/backend/controllers/events/marketingEvent.controller.js
// - web/backend/controllers/salesTeam/salesTeam.controller.js
/**
 * 공개/이벤트용 카카오 Local 키워드 검색.
 * 영업팀 suggest와 동일 REST 키를 쓰되, 계정·플랫폼 병합 없이 Kakao만 반환한다.
 */

function kakaoRestApiKey() {
  return String(
    process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || "",
  ).trim();
}

function isKakaoLocalAuthError(status, json) {
  if (status === 401 || status === 403) return true;
  const code = String(json?.code || json?.errorType || "").toLowerCase();
  return (
    code.includes("notauthorized") ||
    code.includes("accessdenied") ||
    code.includes("unauthorized")
  );
}

function inferPracticeKind(category, placeName) {
  const hay = `${String(category || "")}\n${String(placeName || "")}`;
  if (/기공|denture|dental\s*lab/i.test(hay)) return "lab";
  if (/치과|치의원|dental|dentist/i.test(hay)) return "practice";
  return null;
}

function looksLikeDealer(category, placeName) {
  const hay = `${String(category || "")}\n${String(placeName || "")}`;
  if (/재료|덴탈|dental\s*supply|의료용품|의료기기|유통/i.test(hay)) return true;
  // 상호만 입력된 일반 업소도 후보로 허용(필터 과다 시 빈 목록)
  return true;
}

function mapDoc(doc, { mode }) {
  const name = String(doc?.place_name || "").trim();
  if (!name) return null;
  const category = String(doc?.category_name || "").trim();
  const phone = String(doc?.phone || "").trim();
  const address = String(
    doc?.road_address_name || doc?.address_name || "",
  ).trim();
  const lat = Number(doc?.y);
  const lng = Number(doc?.x);

  if (mode === "practice") {
    const kind = inferPracticeKind(category, name);
    if (!kind || kind !== "practice") return null;
  } else if (mode === "dealer") {
    if (!looksLikeDealer(category, name)) return null;
  }

  return {
    source: "kakao",
    name,
    kind: mode === "dealer" ? "dealer" : "practice",
    representativeName: "",
    phone,
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    label: mode === "dealer" ? "재료상 · 지도" : "치과 · 지도",
    category,
  };
}

function dedupeKey(row) {
  return `${String(row.name || "")
    .toLowerCase()
    .replace(/\s+/g, "")}|${String(row.address || "")
    .toLowerCase()
    .replace(/\s+/g, "")}`;
}

async function kakaoKeywordPage(query, { page = 1 } = {}) {
  const key = kakaoRestApiKey();
  const q = String(query || "").trim();
  if (!q || !key) return { items: [], authError: false };
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", q);
    url.searchParams.set("size", "15");
    url.searchParams.set("page", String(page));
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        items: [],
        authError: isKakaoLocalAuthError(resp.status, json),
      };
    }
    const docs = Array.isArray(json?.documents) ? json.documents : [];
    return { items: docs, authError: false };
  } catch {
    return { items: [], authError: false };
  }
}

function buildQueries(q, mode) {
  const base = String(q || "").trim();
  if (!base) return [];
  if (mode === "dealer") {
    const out = [base];
    if (!/재료|덴탈|dental/i.test(base)) {
      out.push(`${base} 재료상`, `${base} 치과재료`, `${base} 덴탈`);
    }
    return [...new Set(out)];
  }
  const out = [base];
  if (!/치과|치의원/.test(base)) out.push(`${base} 치과`);
  return [...new Set(out)];
}

/**
 * @param {string} query
 * @param {{ mode?: 'practice'|'dealer', limit?: number }} opts
 */
export async function searchKakaoPlaces(query, { mode = "practice", limit = 20 } = {}) {
  const q = String(query || "").trim();
  const cap = Math.min(40, Math.max(1, Number(limit) || 20));
  if (q.length < 2) {
    return { items: [], authError: false, keyMissing: !kakaoRestApiKey() };
  }
  if (!kakaoRestApiKey()) {
    return { items: [], authError: false, keyMissing: true };
  }

  const queries = buildQueries(q, mode);
  const seen = new Set();
  const items = [];
  let authError = false;

  const pages = await Promise.all(
    queries.flatMap((qq) => [
      kakaoKeywordPage(qq, { page: 1 }),
      kakaoKeywordPage(qq, { page: 2 }),
    ]),
  );

  for (const res of pages) {
    if (res.authError) authError = true;
    for (const doc of res.items || []) {
      const row = mapDoc(doc, { mode });
      if (!row) continue;
      const key = dedupeKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(row);
      if (items.length >= cap) break;
    }
    if (items.length >= cap) break;
  }

  return { items: items.slice(0, cap), authError, keyMissing: false };
}
