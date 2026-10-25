// related files:
// - web/backend/services/eventVisitLog.service.js
// - web/backend/models/marketingEvent.model.js
// - web/backend/models/marketingEventVisit.model.js
import MarketingEvent from "../../models/marketingEvent.model.js";
import MarketingEventVisit from "../../models/marketingEventVisit.model.js";
import {
  ingestEventVisit,
  loadEventVisitReport,
  markEventVisitConverted,
} from "../../services/eventVisitLog.service.js";
import { kstParts } from "../../services/eventVisitCore.js";

const SESSION = "550e8400-e29b-41d4-a716-446655440000";

function req(type, dwellMs) {
  return {
    params: { slug: "visit-test" },
    headers: {
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    },
    ip: "175.223.0.1",
    body: {
      sessionId: SESSION,
      type,
      dwellMs,
      scrollPct: 40,
      path: "/events/visit-test",
      referrer: "https://www.google.com/search?q=abuts",
      lang: "ko-KR",
    },
  };
}

describe("eventVisitLog", () => {
  test("stores session metadata and rolls up a KST day", async () => {
    await MarketingEvent.create({
      slug: "visit-test",
      title: "방문 테스트",
      status: "open",
    });

    const entered = await ingestEventVisit(req("enter", 0));
    expect(entered.ok).toBe(true);
    const step = req("progress", 4000);
    step.body.reachedApply = true;
    step.body.pageStep = true;
    step.body.pages = [
      { label: "시작", index: 0 },
      { label: "가공", index: 1 },
    ];
    expect((await ingestEventVisit(step)).ok).toBe(true);
    const further = req("progress", 8000);
    further.body.pageStep = true;
    further.body.pages = [
      { label: "시작", index: 0 },
      { label: "신청", index: 4 },
      { label: "가공", index: 1 },
    ];
    expect((await ingestEventVisit(further)).ok).toBe(true);
    const stayed = await ingestEventVisit(req("leave", 12500));
    expect(stayed.ok).toBe(true);

    const saved = await MarketingEventVisit.findOne({ sessionId: SESSION }).lean();
    expect(saved.pageViews).toBe(1);
    expect(saved.dwellMs).toBe(12500);
    expect(saved.reachedApply).toBe(true);
    expect(saved.pages.map((page) => page.label)).toEqual(["시작", "가공", "신청"]);
    expect(saved.regionName).toBe("서울");
    expect(saved.device).toBe("mobile");
    expect(saved.referrerHost).toBe("google.com");
    expect(saved.ipHash).toEqual(expect.any(String));
    expect(saved.ipHash.length).toBeGreaterThan(8);

    await markEventVisitConverted(saved.eventId, SESSION);
    const converted = await MarketingEventVisit.findOne({ sessionId: SESSION }).lean();
    expect(converted.converted).toBe(true);
    expect(converted.formStarted).toBe(true);

    const { kstDate } = kstParts(saved.startedAt);
    const report = await loadEventVisitReport(saved.eventId, {
      from: kstDate,
      to: kstDate,
    });
    expect(report.summary.sessions).toBe(1);
    expect(report.summary.pageViews).toBe(1);
    expect(report.summary.avgDwellMs).toBe(12500);
    expect(report.funnel.reachedApply).toBe(1);
    expect(report.pages.map((page) => page.label)).toEqual(["시작", "가공", "신청"]);
    expect(report.pages[0].sessions).toBe(1);
    expect(report.recent[0].pages).toEqual(["시작", "가공", "신청"]);
    const moved = req("progress", 9000);
    moved.body.routeStep = true;
    moved.body.routes = [{ path: "/offer/platform" }, { path: "/" }];
    expect((await ingestEventVisit(moved)).ok).toBe(true);
    const withRoutes = await MarketingEventVisit.findOne({ sessionId: SESSION }).lean();
    expect(withRoutes.routes.map((route) => route.path)).toEqual([
      "/offer/platform",
      "/",
    ]);
    const routed = await loadEventVisitReport(saved.eventId, {
      from: kstDate,
      to: kstDate,
    });
    expect(routed.routes.map((route) => route.label)).toEqual(["플랫폼", "홈"]);
    expect(routed.recent[0].routes).toEqual(["플랫폼", "홈"]);
    expect(report.funnel.converted).toBe(1);
    expect(report.regions[0].label.startsWith("서울")).toBe(true);
    expect(report.sources[0].label).toBe("google.com");
    expect(report.hours[saved.kstHour].sessions).toBe(1);
    expect(report.hours[saved.kstHour].applications).toBe(0);
    expect(report.hours[saved.kstHour].rate).toBe(0);
    expect(report.daily.at(-1)?.applications).toBe(0);
  });
});