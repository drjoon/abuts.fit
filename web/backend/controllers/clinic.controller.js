import Clinic from "../models/clinic.model.js";
import ImplantPreset from "../models/implantPreset.model.js";

// GET /api/clinics
export async function getClinics(req, res) {
  try {
    const clinics = await Clinic.find({
      requestor: req.user._id,
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
    const { name, memo } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "거래 치과 이름은 필수입니다.",
      });
    }

    const trimmed = name.trim();

    const exists = await Clinic.findOne({
      requestor: req.user._id,
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
      requestor: req.user._id,
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
    const { id } = req.params;
    const { name, memo } = req.body || {};

    const clinic = await Clinic.findOne({
      _id: id,
      requestor: req.user._id,
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
        requestor: req.user._id,
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
    const { id } = req.params;

    const clinic = await Clinic.findOne({
      _id: id,
      requestor: req.user._id,
    });

    if (!clinic || !clinic.isActive) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    clinic.isActive = false;
    await clinic.save();

    // 연결된 프리셋도 비활성화 (soft delete 대신 전체 삭제해도 무방)
    await ImplantPreset.updateMany(
      { clinic: clinic._id },
      { $set: { isDefault: false } }
    );

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
    const { clinicId } = req.params;

    const clinic = await Clinic.findOne({
      _id: clinicId,
      requestor: req.user._id,
      isActive: true,
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    const presets = await ImplantPreset.find({ clinic: clinic._id })
      .sort({ isDefault: -1, label: 1 })
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
    const { clinicId } = req.params;
    const { label, manufacturer, system, type, isDefault } = req.body || {};

    const clinic = await Clinic.findOne({
      _id: clinicId,
      requestor: req.user._id,
      isActive: true,
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "거래 치과를 찾을 수 없습니다.",
      });
    }

    if (!label || !label.trim()) {
      return res.status(400).json({
        success: false,
        message: "프리셋 이름은 필수입니다.",
      });
    }

    if (!manufacturer || !system || !type) {
      return res.status(400).json({
        success: false,
        message: "제조사, 시스템, 유형은 모두 필수입니다.",
      });
    }

    const trimmedLabel = label.trim();

    const exists = await ImplantPreset.findOne({
      clinic: clinic._id,
      label: trimmedLabel,
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "이미 동일한 이름의 프리셋이 존재합니다.",
      });
    }

    if (isDefault) {
      await ImplantPreset.updateMany(
        { clinic: clinic._id },
        { $set: { isDefault: false } }
      );
    }

    const preset = await ImplantPreset.create({
      clinic: clinic._id,
      label: trimmedLabel,
      manufacturer,
      system,
      type,
      isDefault: Boolean(isDefault),
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
    const { presetId } = req.params;
    const { label, manufacturer, system, type, isDefault } = req.body || {};

    const preset = await ImplantPreset.findById(presetId).populate({
      path: "clinic",
      match: { requestor: req.user._id, isActive: true },
    });

    if (!preset || !preset.clinic) {
      return res.status(404).json({
        success: false,
        message: "임플란트 프리셋을 찾을 수 없습니다.",
      });
    }

    if (typeof label === "string" && label.trim()) {
      const trimmed = label.trim();
      const exists = await ImplantPreset.findOne({
        _id: { $ne: preset._id },
        clinic: preset.clinic._id,
        label: trimmed,
      });
      if (exists) {
        return res.status(409).json({
          success: false,
          message: "이미 동일한 이름의 프리셋이 존재합니다.",
        });
      }
      preset.label = trimmed;
    }

    if (typeof manufacturer === "string" && manufacturer.trim()) {
      preset.manufacturer = manufacturer.trim();
    }
    if (typeof system === "string" && system.trim()) {
      preset.system = system.trim();
    }
    if (typeof type === "string" && type.trim()) {
      preset.type = type.trim();
    }

    if (typeof isDefault === "boolean") {
      if (isDefault) {
        await ImplantPreset.updateMany(
          { clinic: preset.clinic._id },
          { $set: { isDefault: false } }
        );
      }
      preset.isDefault = isDefault;
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
    const { presetId } = req.params;

    const preset = await ImplantPreset.findById(presetId).populate({
      path: "clinic",
      match: { requestor: req.user._id, isActive: true },
    });

    if (!preset || !preset.clinic) {
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
