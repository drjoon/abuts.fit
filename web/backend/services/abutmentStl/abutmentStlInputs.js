// related files:
// - bg/pc1/rhino-server/compute/core/processing.py (fetch_connection_target_diameter)
// - web/backend/controllers/bg/bg.controller.js (getRequestMeta)
// - web/backend/controllers/requests/prcMapping.utils.js
//
// Rhino 서버가 /bg/request-meta로 받아 쓰는 입력과 같은 값을 만든다.
// 커넥션 목표 직경은 DB → 정적 맵 순서. 없으면 null(정렬 모듈이 임플란트 표/기본값을 쓴다).
import {
  resolveConnectionTargetDiameter,
  resolvePrcFileNames,
  STATIC_CONNECTION_DIAMETER_MAP,
} from "../../controllers/requests/prcMapping.utils.js";
import { normalizeImplantFields } from "../../utils/implantCanonical.js";
import Connection from "../../models/connection.model.js";

function implantProfileOf(ci) {
  return {
    implantManufacturer: String(ci?.implantManufacturer || "").trim(),
    implantBrand: String(ci?.implantBrand || "").trim(),
    implantFamily: String(ci?.implantFamily || "").trim(),
    implantType: String(ci?.implantType || "").trim(),
    connectionPrcFileName: String(ci?.connectionPrcFileName || "").trim(),
  };
}

const INPUTS_CACHE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { expires: number, value: object }>} */
const inputsCache = new Map();

function inputsCacheKey(ci) {
  const p = implantProfileOf(ci);
  return [
    p.implantManufacturer,
    p.implantBrand,
    p.implantFamily,
    p.implantType,
    String(ci?.connectionPrcFileName || "").trim(),
  ].join("|");
}

export async function resolveAbutmentStlInputs(caseInfos) {
  const ci = caseInfos || {};
  const cacheKey = inputsCacheKey(ci);
  const cached = inputsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const [targetFromDb, connection, resolvedPrc] = await Promise.all([
    resolveTargetDiameter(ci),
    resolveHexConnection(ci),
    resolveConnectionPrcFileName(ci),
  ]);
  let targetDiameter = targetFromDb;
  const profile = {
    ...implantProfileOf(ci),
    connectionPrcFileName: resolvedPrc || String(ci.connectionPrcFileName || "").trim(),
  };
  if (!(Number(targetDiameter) > 0)) {
    const key = [
      profile.implantManufacturer,
      profile.implantBrand,
      profile.implantFamily,
      profile.implantType,
    ].join("/");
    targetDiameter = STATIC_CONNECTION_DIAMETER_MAP[key] ?? null;
  }
  const value = {
    targetDiameter: Number(targetDiameter) > 0 ? Number(targetDiameter) : null,
    implantProfile: profile,
    connection,
  };
  inputsCache.set(cacheKey, { value, expires: Date.now() + INPUTS_CACHE_TTL_MS });
  return value;
}

async function resolveConnectionPrcFileName(ci) {
  const named = String(ci.connectionPrcFileName || "").trim();
  if (named) return named;
  try {
    return (await resolvePrcFileNames(ci))?.connectionPrcFileName || "";
  } catch {
    return "";
  }
}

async function resolveTargetDiameter(ci) {
  const connectionPrcFileName = await resolveConnectionPrcFileName(ci);
  try {
    return await resolveConnectionTargetDiameter(ci, {
      connectionPrcFileName,
    });
  } catch {
    return null;
  }
}

/** 헥스 대변·L2. 11° 테이퍼를 생략한 긴 헥스에 커넥션을 붙일 때 쓴다. */
async function resolveHexConnection(caseInfos) {
  const normalized = normalizeImplantFields(caseInfos || {});
  const manufacturer = normalized.implantManufacturer;
  const brand = normalized.implantBrand;
  const family = normalized.implantFamily;
  if (!manufacturer || !brand || !family) return null;
  try {
    const connection = await Connection.findOne({
      manufacturer,
      brand,
      family,
      type: "Hex",
      category: "hanhwa-connection",
    })
      .select({ hexSize: 1, l2: 1, diameter: 1 })
      .lean();
    const hexSize = Number(connection?.hexSize);
    const l2 = Number(connection?.l2);
    if (!(hexSize > 0) || !(l2 > 0)) return null;
    const diameter = Number(connection?.diameter);
    return {
      hexSize,
      l2,
      ...(diameter > 0 ? { originDiameter: diameter } : {}),
    };
  } catch {
    return null;
  }
}
