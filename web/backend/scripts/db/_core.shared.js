import Connection from "../../models/connection.model.js";
import FilenameRule from "../../models/filenameRule.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { CONNECTIONS_SEED } from "./data/connections.seed.js";
import { FILENAME_RULES_SEED } from "./data/filenameRules.seed.js";
import { PACK_LABEL_BRANDING_SEED } from "./data/packLabelBranding.seed.js";

async function ensureSystemSettings() {
  await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function upsertPackLabelBranding() {
  const update = {};
  for (const [k, v] of Object.entries(PACK_LABEL_BRANDING_SEED)) {
    update[`packLabelBranding.${k}`] = v;
  }
  await SystemSettings.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { new: true, upsert: true },
  );
  return { updated: Object.keys(update).length };
}

async function upsertConnections() {
  const ops = (Array.isArray(CONNECTIONS_SEED) ? CONNECTIONS_SEED : []).map(
    (c) => {
      const seedDiameter = Number(c.diameter ?? c.connection);
      const diameter = Number.isFinite(seedDiameter) ? seedDiameter : undefined;
      const seedL2 = Number(c.l2);
      const l2 = Number.isFinite(seedL2) ? seedL2 : undefined;
      const seedHexSize = Number(c.hexSize);
      const hexSize = Number.isFinite(seedHexSize) ? seedHexSize : undefined;
      const internalGauge = String(c.internalGauge || "").trim();
      const seedProtrusionLength = Number(c.protrusionLength);
      const protrusionLength = Number.isFinite(seedProtrusionLength)
        ? seedProtrusionLength
        : undefined;

      const {
        diameter: _seedDiameterRaw,
        connection: _seedConnectionRaw,
        l2: _seedL2Raw,
        hexSize: _seedHexSizeRaw,
        internalGauge: _seedInternalGaugeRaw,
        protrusionLength: _seedProtrusionLengthRaw,
        ...insertBase
      } = c;

      return {
        updateOne: {
          filter: {
            manufacturer: c.manufacturer,
            brand: c.brand,
            family: c.family,
            type: c.type,
            category: c.category,
          },
          update: {
            // seed를 실행하면 주요 식별/활성 정책(isActive, fileName 포함)을 SSOT 기준으로 동기화한다.
            // 향후 브랜드 버전 변경(IS2/TS3/UF2 등)이나 Mini 계열 활성/비활성 토글을
            // add-only가 아닌 명시적 업데이트로 반영하기 위함.
            $set: {
              ...insertBase,
              ...(diameter !== undefined ? { diameter } : {}),
              ...(l2 !== undefined ? { l2 } : {}),
              ...(hexSize !== undefined ? { hexSize } : {}),
              internalGauge,
              ...(protrusionLength !== undefined ? { protrusionLength } : {}),
            },
            $setOnInsert: {},
          },
          upsert: true,
        },
      };
    },
  );
  if (ops.length === 0) return { matched: 0, modified: 0, upserted: 0 };
  const result = await Connection.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

async function upsertFilenameRules() {
  const ops = (
    Array.isArray(FILENAME_RULES_SEED) ? FILENAME_RULES_SEED : []
  ).map((r) => ({
    updateOne: {
      filter: { ruleId: r.ruleId },
      update: r,
      upsert: true,
    },
  }));
  if (ops.length === 0) return { matched: 0, modified: 0, upserted: 0 };
  const result = await FilenameRule.bulkWrite(ops, { ordered: false });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: Object.keys(result.upsertedIds || {}).length,
  };
}

export async function seedCoreShared() {
  await ensureSystemSettings();
  const connections = await upsertConnections();
  const filenameRules = await upsertFilenameRules();
  const packLabelBranding = await upsertPackLabelBranding();
  return { connections, filenameRules, packLabelBranding };
}
