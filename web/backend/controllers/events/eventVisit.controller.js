// related files:
// - web/backend/services/eventVisitLog.service.js
// - web/backend/services/eventVisitCore.js
// - web/backend/modules/events/event.routes.js
// - web/backend/modules/admin/admin.routes.js
import MarketingEvent from "../../models/marketingEvent.model.js";
import {
  ingestEventVisit,
  loadEventVisitReport,
} from "../../services/eventVisitLog.service.js";
import { kstParts, shiftKstDate } from "../../services/eventVisitCore.js";

/** POST /api/events/:slug/visits */
export async function recordEventVisit(req, res) {
  try {
    const result = await ingestEventVisit(req);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || "방문 기록에 실패했습니다.",
      });
    }
    res.set("Cache-Control", "no-store");
    return res.status(204).end();
  } catch (error) {
    console.error("[events.recordVisit]", error);
    return res.status(500).json({
      success: false,
      message: "방문 기록에 실패했습니다.",
    });
  }
}

/** GET /api/admin/events/:id/visits?days=1|7|30 */
export async function adminGetEventVisits(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const event = await MarketingEvent.findById(id).select("_id slug title").lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "이벤트를 찾을 수 없습니다.",
      });
    }
    const requested = Number(req.query.days);
    const days = requested === 1 || requested === 30 ? requested : 7;
    const to = kstParts(new Date()).kstDate;
    const from = shiftKstDate(to, -(days - 1));
    const report = await loadEventVisitReport(event._id, { from, to });
    return res.json({
      success: true,
      data: {
        eventId: String(event._id),
        slug: event.slug,
        days,
        ...report,
      },
    });
  } catch (error) {
    console.error("[events.adminVisits]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "방문 내역 조회에 실패했습니다.",
    });
  }
}
