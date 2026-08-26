// related files:
// - web/backend/services/integrations/threeShape/syncLabInbox.js
// - docs/integrations/3shape-partner-application.md
/**
 * 3Shape Communicate Inbox client.
 *
 * Live endpoints are partner-gated. Until docs/credentials arrive:
 * - THREE_SHAPE_CLIENT_MODE=fixture → deterministic sample cases
 * - THREE_SHAPE_CLIENT_MODE=live → requires THREE_SHAPE_API_BASE_URL (+ tokens)
 */

function clientMode() {
  const raw = String(process.env.THREE_SHAPE_CLIENT_MODE || "live")
    .trim()
    .toLowerCase();
  return raw === "fixture" ? "fixture" : "live";
}

/**
 * @typedef {object} ThreeShapeCaseAsset
 * @property {string} fileName
 * @property {string} [contentType]
 * @property {Buffer} buffer
 * @property {string} [patientName]
 * @property {string} [tooth]
 */

/**
 * @typedef {object} ThreeShapeInboxCase
 * @property {string} externalCaseId
 * @property {string} [memo]
 * @property {{ name?: string, email?: string, communicateId?: string }} [practice]
 * @property {ThreeShapeCaseAsset[]} assets
 */

export function getThreeShapeClientMode() {
  return clientMode();
}

export function isThreeShapeLiveConfigured() {
  return Boolean(String(process.env.THREE_SHAPE_API_BASE_URL || "").trim());
}

/**
 * @param {{ email: string, password?: string, accessToken?: string }} credentials
 */
export async function validateThreeShapeCredentials(credentials) {
  const email = String(credentials?.email || "").trim().toLowerCase();
  if (!email) {
    const err = new Error("3Shape Communicate 이메일이 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  if (clientMode() === "fixture") {
    return {
      ok: true,
      externalAccountId: `fixture:${email}`,
      externalAccountEmail: email,
      scopes: ["inbox.read", "assets.download"],
    };
  }

  if (!isThreeShapeLiveConfigured()) {
    // Credentials stored as pending until partner API is wired.
    return {
      ok: false,
      pending: true,
      externalAccountId: "",
      externalAccountEmail: email,
      scopes: [],
      message:
        "3Shape 파트너 API가 아직 연결되지 않았습니다. 계정은 저장되며 승인 후 자동으로 활성화됩니다.",
    };
  }

  // Partner docs placeholder — replace with OAuth / token exchange.
  const base = String(process.env.THREE_SHAPE_API_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const res = await fetch(`${base}/v1/auth/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email,
      password: credentials?.password || undefined,
      accessToken: credentials?.accessToken || undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `3Shape 계정 검증 실패 (${res.status}): ${text.slice(0, 200)}`,
    );
    err.statusCode = 400;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  return {
    ok: true,
    externalAccountId: String(data?.accountId || data?.id || email).trim(),
    externalAccountEmail: email,
    scopes: Array.isArray(data?.scopes) ? data.scopes.map(String) : [],
  };
}

/**
 * @param {{ credentials: Record<string, unknown>, since?: Date|null }} args
 * @returns {Promise<ThreeShapeInboxCase[]>}
 */
export async function listNewThreeShapeCases({ credentials, since } = {}) {
  if (clientMode() === "fixture") {
    const email = String(credentials?.email || "lab@example.com")
      .trim()
      .toLowerCase();
    const stamp = since ? new Date(since).getTime() : 0;
    // One stable sample case per lab email (idempotent by externalCaseId).
    return [
      {
        externalCaseId: `fixture-case-${email}`,
        memo: "3Shape fixture inbox case",
        practice: {
          name: "Fixture Dental Clinic",
          email: "clinic-fixture@example.com",
          communicateId: `comm-clinic-${email}`,
        },
        assets: [
          {
            fileName: "upper.stl",
            contentType: "model/stl",
            patientName: "Fixture Patient",
            tooth: "",
            buffer: Buffer.from(
              `solid fixture\nendsolid fixture\n# ${stamp}\n`,
              "utf8",
            ),
          },
        ],
      },
    ];
  }

  if (!isThreeShapeLiveConfigured()) {
    return [];
  }

  const base = String(process.env.THREE_SHAPE_API_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const token = String(
    credentials?.accessToken || credentials?.password || "",
  ).trim();
  const url = new URL(`${base}/v1/inbox/cases`);
  if (since) url.searchParams.set("since", new Date(since).toISOString());

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "X-3Shape-Account": String(credentials?.email || ""),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`3Shape inbox list failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.cases) ? data.cases : Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    externalCaseId: String(row?.id || row?.caseId || "").trim(),
    memo: String(row?.memo || row?.notes || "").trim(),
    practice: {
      name: String(row?.clinicName || row?.practice?.name || "").trim(),
      email: String(row?.clinicEmail || row?.practice?.email || "")
        .trim()
        .toLowerCase(),
      communicateId: String(
        row?.clinicId || row?.practice?.communicateId || "",
      ).trim(),
    },
    // Assets downloaded separately via downloadThreeShapeCaseAssets.
    assets: [],
    _raw: row,
  }));
}

/**
 * @param {{ credentials: Record<string, unknown>, externalCaseId: string, caseRow?: object }} args
 * @returns {Promise<ThreeShapeCaseAsset[]>}
 */
export async function downloadThreeShapeCaseAssets({
  credentials,
  externalCaseId,
  caseRow,
} = {}) {
  if (clientMode() === "fixture") {
    if (Array.isArray(caseRow?.assets) && caseRow.assets.length) {
      return caseRow.assets;
    }
    return [];
  }

  if (!isThreeShapeLiveConfigured()) {
    return [];
  }

  const base = String(process.env.THREE_SHAPE_API_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const token = String(
    credentials?.accessToken || credentials?.password || "",
  ).trim();
  const caseId = String(externalCaseId || "").trim();
  const res = await fetch(`${base}/v1/inbox/cases/${encodeURIComponent(caseId)}/assets`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      "X-3Shape-Account": String(credentials?.email || ""),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `3Shape asset list failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.assets) ? data.assets : [];
  const out = [];
  for (const item of items) {
    const downloadUrl = String(item?.downloadUrl || item?.url || "").trim();
    const fileName = String(item?.fileName || item?.name || "scan.stl").trim();
    if (!downloadUrl) continue;
    const fileRes = await fetch(downloadUrl, {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    });
    if (!fileRes.ok) continue;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    out.push({
      fileName,
      contentType: String(item?.contentType || "application/octet-stream"),
      patientName: String(item?.patientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      buffer,
    });
  }
  return out;
}

/**
 * @param {{ credentials: Record<string, unknown>, externalCaseId: string }} args
 */
export async function ackThreeShapeCase({ credentials, externalCaseId } = {}) {
  if (clientMode() === "fixture") {
    return { ok: true };
  }
  if (!isThreeShapeLiveConfigured()) {
    return { ok: false, skipped: true };
  }
  const base = String(process.env.THREE_SHAPE_API_BASE_URL || "").replace(
    /\/$/,
    "",
  );
  const token = String(
    credentials?.accessToken || credentials?.password || "",
  ).trim();
  const caseId = String(externalCaseId || "").trim();
  const res = await fetch(
    `${base}/v1/inbox/cases/${encodeURIComponent(caseId)}/ack`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
        "X-3Shape-Account": String(credentials?.email || ""),
      },
      body: JSON.stringify({ status: "received" }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`3Shape ack failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { ok: true };
}
