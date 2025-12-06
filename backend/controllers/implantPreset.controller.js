import ImplantPreset from "../models/implantPreset.model.js";

// Find the most recently used implant preset for a given case
export async function findPreset(req, res) {
  try {
    const { clinicName, patientName, tooth } = req.query;
    const requestor = req.user._id;

    // patientName과 tooth는 필수, clinicName은 선택사항
    if (!patientName || !tooth) {
      return res.status(400).json({
        success: false,
        message: "Patient name and tooth are required.",
      });
    }

    // clinicName이 없거나 빈 문자열이면 null로 처리
    const query = {
      requestor,
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

export default { findPreset };
