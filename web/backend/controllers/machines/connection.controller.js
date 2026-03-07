import Connection from "../../models/connection.model.js";
import Request from "../../models/request.model.js";
import { normalizeImplantFields } from "../../utils/implantCanonical.js";
import {
  buildExpectedPrcFileName,
  buildPrcFileNamesFromCatalog,
  getPrcTypeCodeByFamily,
} from "../../utils/prcFilenameCatalog.js";

function normalizeTypeLabel(type) {
  if (typeof type !== "string") return "";
  const t = type.trim();
  if (!t) return "";
  if (t.toLowerCase().includes("non")) return "Non-Hex";
  if (t.toLowerCase().includes("hex")) return "Hex";
  return t;
}

function normalizeFamilyLabel(family) {
  const value = String(family || "")
    .trim()
    .toLowerCase();
  if (value === "mini") return "Mini";
  return "Regular";
}

function buildDisplayLabels({ manufacturer, brand, family, type }) {
  return {
    displayManufacturer: String(manufacturer || "").trim(),
    displayBrand: String(brand || "")
      .trim()
      .replace("Hanwha", "HWH")
      .replace("hanwha", "HWH"),
    displayFamily: normalizeFamilyLabel(family),
    displayType: normalizeTypeLabel(type),
  };
}

function buildPrcFileNames({
  manufacturer,
  brand,
  family,
  type,
  legacyFileName,
}) {
  const normalizedType = normalizeTypeLabel(type);
  const normalizedFamily = normalizeFamilyLabel(family);
  const typeCode = getPrcTypeCodeByFamily(normalizedFamily, normalizedType);
  const catalogNames = buildPrcFileNamesFromCatalog(
    manufacturer,
    brand,
    normalizedType,
    normalizedFamily,
  );
  const expectedConnectionFileName = buildExpectedPrcFileName(
    "connection",
    manufacturer,
    brand,
    normalizedType,
    normalizedFamily,
  );

  if (!catalogNames.connectionPrcFileName || !typeCode) {
    return {
      connectionPrcFileName:
        typeof legacyFileName === "string" ? legacyFileName : null,
      faceHolePrcFileName: catalogNames.faceHolePrcFileName || null,
      prcTypeCode: typeCode || null,
      prcBrandCode: String(brand || "").trim() || null,
    };
  }

  return {
    connectionPrcFileName:
      catalogNames.connectionPrcFileName || expectedConnectionFileName,
    faceHolePrcFileName: catalogNames.faceHolePrcFileName || null,
    prcTypeCode: typeCode,
    prcBrandCode: String(brand || "").trim() || null,
  };
}

// 활성화된(한화 등) 커넥션 목록 조회
// GET /api/connections
export async function getConnections(req, res) {
  try {
    // 활성 커넥션 전체 조회 (카테고리 제한 제거)
    const baseFilter = { isActive: true };

    const all = await Connection.find(baseFilter).lean();

    // 사용자별 사용량 계산
    const usage = req.user
      ? await Request.aggregate([
          { $match: { requestor: req.user._id, connection: { $ne: null } } },
          { $group: { _id: "$connection", count: { $sum: 1 } } },
        ])
      : [];

    const usageMap = new Map(usage.map((u) => [u._id.toString(), u.count]));

    const sorted = all
      .map((c) => {
        const normalized = normalizeImplantFields({
          implantManufacturer: c.manufacturer,
          implantBrand: c.brand,
          implantFamily: c.family,
          implantType: c.type,
        });
        const computed = buildPrcFileNames({
          manufacturer: normalized.implantManufacturer,
          brand: normalized.implantBrand,
          family: normalized.implantFamily || c.family,
          type: normalized.implantType,
          legacyFileName: c.fileName,
        });
        const display = buildDisplayLabels({
          manufacturer: normalized.implantManufacturer,
          brand: normalized.implantBrand,
          family: normalized.implantFamily || c.family,
          type: normalized.implantType,
        });
        return {
          ...c,
          manufacturer: normalized.implantManufacturer,
          brand: normalized.implantBrand,
          family: normalized.implantFamily || normalizeFamilyLabel(c.family),
          type: normalized.implantType,
          canonicalKey: `${normalized.implantManufacturer}|${normalized.implantBrand}|${normalized.implantFamily || normalizeFamilyLabel(c.family)}|${normalized.implantType}`,
          prcMatchScore:
            typeof c.fileName === "string" &&
            c.fileName === computed.connectionPrcFileName
              ? 2
              : computed.connectionPrcFileName
                ? 1
                : 0,
          // UI / 저장은 manufacturer/brand/family/type 그대로 사용
          // CAM/ESPRIT용 파일명만 별도 필드로 제공
          connectionPrcFileName: computed.connectionPrcFileName,
          faceHolePrcFileName: computed.faceHolePrcFileName,
          prcTypeCode: computed.prcTypeCode,
          prcBrandCode: computed.prcBrandCode,
          displayManufacturer: display.displayManufacturer,
          displayBrand: display.displayBrand,
          displayFamily: display.displayFamily,
          displayType: display.displayType,
          usageCount: usageMap.get(c._id.toString()) || 0,
        };
      })
      .sort((a, b) => {
        if (b.prcMatchScore !== a.prcMatchScore) {
          return b.prcMatchScore - a.prcMatchScore;
        }
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        if (a.manufacturer !== b.manufacturer)
          return a.manufacturer.localeCompare(b.manufacturer);
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
        if (a.family !== b.family) return a.family.localeCompare(b.family);
        return a.type.localeCompare(b.type);
      })
      .filter((item, index, arr) => {
        return (
          arr.findIndex(
            (candidate) => candidate.canonicalKey === item.canonicalKey,
          ) === index
        );
      })
      .sort((a, b) => {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        if (a.manufacturer !== b.manufacturer)
          return a.manufacturer.localeCompare(b.manufacturer);
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
        if (a.family !== b.family) return a.family.localeCompare(b.family);
        return a.type.localeCompare(b.type);
      });

    // 서버 전체 커넥션 기준 최신 업데이트 시각 계산 (serverUpdatedAt)
    const serverUpdatedAt = all.reduce((max, c) => {
      const updated = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return updated > max ? updated : max;
    }, 0);

    res.json({
      success: true,
      data: sorted,
      serverUpdatedAt: serverUpdatedAt || null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "커넥션 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// 직경으로 가장 근사한 커넥션 찾기
// GET /api/connections/find-by-diameter?diameter=3.3
export async function findConnectionByDiameter(req, res) {
  try {
    const { diameter } = req.query;
    if (!diameter) {
      return res
        .status(400)
        .json({ success: false, message: "Diameter is required" });
    }

    const targetDiameter = parseFloat(diameter);

    // 모든 활성 커넥션 조회
    const connections = await Connection.find({ isActive: true }).lean();

    if (!connections.length) {
      return res
        .status(404)
        .json({ success: false, message: "No active connections found" });
    }

    // 가장 가까운 커넥션 찾기
    let closestConnection = null;
    let minDiff = Infinity;

    for (const conn of connections) {
      if (conn.diameter == null) continue;
      const diff = Math.abs(conn.diameter - targetDiameter);
      if (diff < minDiff) {
        minDiff = diff;
        closestConnection = conn;
      }
    }

    if (closestConnection) {
      res.json({ success: true, data: closestConnection });
    } else {
      res
        .status(404)
        .json({ success: false, message: "No suitable connection found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error finding connection by diameter",
      error: error.message,
    });
  }
}

export default { getConnections, findConnectionByDiameter };
