// related files:
// - web/backend/services/eventVisitCore.js
import {
  classifyBrowser,
  classifyDevice,
  isKstDate,
  kstParts,
  placeLabel,
  regionName,
  sanitizeVisitBody,
  shiftKstDate,
} from "../../services/eventVisitCore.js";

const SESSION = "550e8400-e29b-41d4-a716-446655440000";

describe("eventVisitCore", () => {
  test("kst date and hour follow Asia/Seoul", () => {
    const parts = kstParts(new Date("2026-10-25T15:30:00.000Z"));
    expect(parts).toEqual({ kstDate: "2026-10-26", kstHour: 0 });
    expect(shiftKstDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(isKstDate("2026-10-25")).toBe(true);
    expect(isKstDate("2026-1-2")).toBe(false);
  });

  test("device and browser from user agent", () => {
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(
      "mobile",
    );
    expect(
      classifyDevice(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
      ),
    ).toBe("tablet");
    expect(
      classifyBrowser(
        "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("Edge");
  });

  test("korean region code maps to a city name", () => {
    expect(regionName("KR", "11", "")).toBe("서울");
    expect(regionName("KR", "30", "Daejeon")).toBe("Daejeon");
    expect(placeLabel({ country: "KR", regionName: "서울", city: "Seoul" })).toBe(
      "서울 · Seoul",
    );
  });

  test("rejects a visit body without a session id", () => {
    expect(sanitizeVisitBody({ type: "enter" }).ok).toBe(false);
    const ok = sanitizeVisitBody({
      sessionId: SESSION,
      type: "ping",
      dwellMs: 1500,
      scrollPct: 140,
      referrer: "https://www.google.com/search?q=abuts",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.type).toBe("progress");
    expect(ok.value.scrollPct).toBe(100);
    expect(ok.value.referrerHost).toBe("google.com");
    expect(ok.value.dwellMs).toBe(1500);
    expect(ok.value.viewportW).toBeUndefined();
  });
});
