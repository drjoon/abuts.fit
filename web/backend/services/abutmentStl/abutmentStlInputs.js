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

function implantProfileOf(ci) {
  return {
    implantManufacturer: String(ci?.implantManufacturer || "").trim(),
    implantBrand: String(ci?.implantBrand || "").trim(),
    implantFamily: String(ci?.implantFamily || "").trim(),
    implantType: String(ci?.implantType || "").trim(),
  };
}

export async function resolveAbutmentStlInputs(caseInfos) {
  const ci = caseInfos || {};
  let connectionPrcFileName = String(ci.connectionPrcFileName || "").trim();
  if (!connectionPrcFileName) {
    try {
      connectionPrcFileName =
        (await resolvePrcFileNames(ci))?.connectionPrcFileName || "";
    } catch {
      connectionPrcFileName = "";
    }
  }
  let targetDiameter = null;
  try {
    targetDiameter = await resolveConnectionTargetDiameter(ci, {
      connectionPrcFileName,
    });
  } catch {
    targetDiameter = null;
  }
  const profile = implantProfileOf(ci);
  if (!(Number(targetDiameter) > 0)) {
    const key = [
      profile.implantManufacturer,
      profile.implantBrand,
      profile.implantFamily,
      profile.implantType,
    ].join("/");
    targetDiameter = STATIC_CONNECTION_DIAMETER_MAP[key] ?? null;
  }
  return {
    targetDiameter: Number(targetDiameter) > 0 ? Number(targetDiameter) : null,
    implantProfile: profile,
  };
}
