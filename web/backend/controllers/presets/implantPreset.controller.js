import ImplantPreset from "../../models/implantPreset.model.js";
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

function getBusinessId(req) {
  return String(req.user?.businessId || "").trim();
}

export async function getImplantPresets(req, res) {
  try {
    const businessId = getBusinessId(req);
    const all = await Connection.find({ isActive: true }).lean();

    const usage = businessId
      ? await Request.aggregate([
          {
            $match: {
              businessId: businessId,
              connection: { $ne: null },
            },
          },
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
        if (b.prcMatchScore !== a.prcMatchScore)
          return b.prcMatchScore - a.prcMatchScore;
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
      message: "임플란트 프리셋 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function findImplantPresetByDiameter(req, res) {
  try {
    const { diameter } = req.query;
    if (!diameter) {
      return res
        .status(400)
        .json({ success: false, message: "Diameter is required" });
    }

    const targetDiameter = parseFloat(diameter);
    const presets = await Connection.find({ isActive: true }).lean();

    if (!presets.length) {
      return res
        .status(404)
        .json({ success: false, message: "No active implant presets found" });
    }

    let closestPreset = null;
    let minDiff = Infinity;

    for (const preset of presets) {
      if (preset.diameter == null) continue;
      const diff = Math.abs(preset.diameter - targetDiameter);
      if (diff < minDiff) {
        minDiff = diff;
        closestPreset = preset;
      }
    }

    if (closestPreset) {
      res.json({ success: true, data: closestPreset });
    } else {
      res
        .status(404)
        .json({ success: false, message: "No suitable implant preset found" });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "임플란트 프리셋 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// Find the most recently used implant preset for a given case
export async function findPreset(req, res) {
  try {
    const { clinicName, patientName, tooth } = req.query;
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    // patientName과 tooth는 필수, clinicName은 선택사항
    if (!patientName || !tooth) {
      return res.status(400).json({
        success: false,
        message: "Patient name and tooth are required.",
      });
    }

    // clinicName이 없거나 빈 문자열이면 null로 처리
    const query = {
      businessId,
      patientName,
      tooth,
    };

    if (clinicName && clinicName.trim()) {
      query.clinicName = clinicName;
    } else {
      query.clinicName = { $in: [null, ""] };
    }

    const preset = await ImplantPreset.findOne(query).sort({ lastUsedAt: -1 });

    if (preset) {
      res.json({ success: true, data: preset });
    } else {
      res
        .status(404)
        .json({ success: false, message: "No preset found for this case." });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error finding implant preset.",
      error: error.message,
    });
  }
}

export default { findPreset, getImplantPresets, findImplantPresetByDiameter };
