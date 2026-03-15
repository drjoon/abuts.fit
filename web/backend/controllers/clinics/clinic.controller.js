import Clinic from "../../models/clinic.model.js";
import ClinicImplantPreset from "../../models/clinicImplantPreset.model.js";

function getBusinessAnchorId(req) {
  return String(req.user?.businessAnchorId || "").trim();
}

// GET /api/clinics
export async function getClinics(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const clinics = await Clinic.find({
      businessId: businessAnchorId,
      isActive: true,
    })
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, data: clinics });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "거래 치과 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// POST /api/clinics
export async function createClinic(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { name, memo } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "거래 치과 이름은 필수입니다.",
      });
    }

    const trimmed = name.trim();

    const exists = await Clinic.findOne({
      businessId: businessAnchorId,
      name: trimmed,
      isActive: true,
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "이미 동일한 이름의 거래 치과가 존재합니다.",
        data: exists,
      });
    }

    const clinic = await Clinic.create({
      businessId: businessAnchorId,
      name: trimmed,
      memo: memo || "",
    });

    res.status(201).json({ success: true, data: clinic });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "거래 치과 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// PATCH /api/clinics/:id
export async function updateClinic(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { id } = req.params;
    const { name, memo } = req.body || {};

    const clinic = await Clinic.findOne({
      _id: id,
      businessId: businessAnchorId,
    });

    if (!clinic || !clinic.isActive) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    if (typeof name === "string" && name.trim()) {
      const trimmed = name.trim();
      const exists = await Clinic.findOne({
        _id: { $ne: clinic._id },
        businessId: businessAnchorId,
        name: trimmed,
        isActive: true,
      });
      if (exists) {
        return res.status(409).json({
          success: false,
          message: "이미 동일한 이름의 거래 치과가 존재합니다.",
        });
      }
      clinic.name = trimmed;
    }

    if (typeof memo === "string") {
      clinic.memo = memo;
    }

    await clinic.save();

    res.json({ success: true, data: clinic });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "거래 치과 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// DELETE /api/clinics/:id
export async function deleteClinic(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { id } = req.params;

    const clinic = await Clinic.findOne({
      _id: id,
      businessId: businessAnchorId,
    });

    if (!clinic || !clinic.isActive) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    clinic.isActive = false;
    await clinic.save();

    await ClinicImplantPreset.deleteMany({
      businessId: businessAnchorId,
      clinicName: clinic.name,
    });

    res.json({
      success: true,
      message: "거래 치과가 비활성화되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "거래 치과 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// GET /api/clinics/:clinicId/implant-presets
export async function getImplantPresets(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { clinicId } = req.params;

    const clinic = await Clinic.findOne({
      _id: clinicId,
      businessId: businessAnchorId,
      isActive: true,
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    const presets = await ClinicImplantPreset.find({
      businessId: businessAnchorId,
      clinicName: clinic.name,
    })
      .sort({ useCount: -1, lastUsedAt: -1, manufacturer: 1, brand: 1 })
      .lean();

    res.json({ success: true, data: presets });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "임플란트 프리셋 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// POST /api/clinics/:clinicId/implant-presets
export async function createImplantPreset(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { clinicId } = req.params;
    const { manufacturer, brand, family, type } = req.body || {};

    const clinic = await Clinic.findOne({
      _id: clinicId,
      businessId: businessAnchorId,
      isActive: true,
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    if (!manufacturer || !brand || !family || !type) {
      return res.status(400).json({
        success: false,
        message: "제조사, 브랜드, 패밀리, 유형은 모두 필수입니다.",
      });
    }

    const exists = await ClinicImplantPreset.findOne({
      businessId: businessAnchorId,
      clinicName: clinic.name,
      manufacturer,
      brand,
      family,
      type,
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "이미 동일한 거래 치과 프리셋이 존재합니다.",
      });
    }

    const preset = await ClinicImplantPreset.create({
      businessId: businessAnchorId,
      clinicName: clinic.name,
      manufacturer,
      brand,
      family,
      type,
    });

    res.status(201).json({ success: true, data: preset });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "임플란트 프리셋 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// PATCH /api/implant-presets/:presetId
export async function updateImplantPreset(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { presetId } = req.params;
    const { manufacturer, brand, family, type } = req.body || {};

    const preset = await ClinicImplantPreset.findOne({
      _id: presetId,
      businessId: businessAnchorId,
    });

    if (!preset) {
      return res.status(404).json({
        success: false,
        message: "임플란트 프리셋을 찾을 수 없습니다.",
      });
    }

    if (typeof manufacturer === "string" && manufacturer.trim()) {
      preset.manufacturer = manufacturer.trim();
    }
    if (typeof brand === "string" && brand.trim()) {
      preset.brand = brand.trim();
    }
    if (typeof family === "string" && family.trim()) {
      preset.family = family.trim();
    }
    if (typeof type === "string" && type.trim()) {
      preset.type = type.trim();
    }

    await preset.save();

    res.json({ success: true, data: preset });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "임플란트 프리셋 수정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// DELETE /api/implant-presets/:presetId
export async function deleteImplantPreset(req, res) {
  try {
    const businessAnchorId = getBusinessAnchorId(req);
    if (!businessAnchorId) {
      return res.status(403).json({
        success: false,
        message: "사업자 정보가 설정되지 않았습니다.",
      });
    }

    const { presetId } = req.params;

    const preset = await ClinicImplantPreset.findOne({
      _id: presetId,
      businessId: businessAnchorId,
    });

    if (!preset) {
      return res.status(404).json({
        success: false,
        message: "임플란트 프리셋을 찾을 수 없습니다.",
      });
    }

    await preset.deleteOne();

    res.json({ success: true, message: "임플란트 프리셋이 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "임플란트 프리셋 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getClinics,
  createClinic,
  updateClinic,
  deleteClinic,
  getImplantPresets,
  createImplantPreset,
  updateImplantPreset,
  deleteImplantPreset,
};
