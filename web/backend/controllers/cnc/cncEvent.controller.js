import CncEvent from "../../models/cncEvent.model.js";

const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export async function getCncEventsByRequestId(req, res) {
  try {
    const requestId = String(req.params.requestId || "").trim();
    if (!requestId) {
      return res.status(400).json({ success: false, message: "requestId is required" });
    }

    const limit = Math.min(200, toInt(req.query.limit, 50));
    const skip = Math.max(0, toInt(req.query.skip, 0));

    const items = await CncEvent.find({ requestId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getCncEventsByMachineId(req, res) {
  try {
    const machineId = String(req.params.machineId || "").trim();
    if (!machineId) {
      return res.status(400).json({ success: false, message: "machineId is required" });
    }

    const limit = Math.min(200, toInt(req.query.limit, 50));
    const skip = Math.max(0, toInt(req.query.skip, 0));

    const items = await CncEvent.find({ machineId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({ success: true, data: { items } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
