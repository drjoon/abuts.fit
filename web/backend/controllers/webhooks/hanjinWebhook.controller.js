import { syncHanjinTrackingPayload } from "../requests/shipping.Tracking.helpers.js";

export async function handleHanjinTrackingWebhook(req, res) {
  try {
    const result = await syncHanjinTrackingPayload({
      payload: req.body || {},
      headers: req.headers || {},
      enforceSecret: true,
    });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "hanjin webhook 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
