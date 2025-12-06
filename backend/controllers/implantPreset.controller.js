import ImplantPreset from "../models/implantPreset.model.js";

// Find the most recently used implant preset for a given case
export async function findPreset(req, res) {
  try {
    const { clinicName, patientName, tooth } = req.query;
    const requestor = req.user._id;

    if (!clinicName || !patientName || !tooth) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Clinic, patient, and tooth are required.",
        });
    }

    const preset = await ImplantPreset.findOne({
      requestor,
      clinicName,
      patientName,
      tooth,
    }).sort({ lastUsedAt: -1 });

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
