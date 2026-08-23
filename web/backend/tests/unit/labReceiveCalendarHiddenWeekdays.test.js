// related files:
// - web/backend/utils/labReceiveCalendarHiddenWeekdays.util.js
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts
import {
  DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS,
  normalizeLabReceiveCalendarHiddenWeekdays,
} from "../../utils/labReceiveCalendarHiddenWeekdays.util.js";

describe("labReceiveCalendarHiddenWeekdays", () => {
  test("missing preference defaults to Sun+Sat hidden", () => {
    expect(normalizeLabReceiveCalendarHiddenWeekdays(undefined)).toEqual([
      ...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS,
    ]);
  });

  test("empty array means show all weekdays", () => {
    expect(normalizeLabReceiveCalendarHiddenWeekdays([])).toEqual([]);
  });

  test("preserves explicit hidden subset", () => {
    expect(normalizeLabReceiveCalendarHiddenWeekdays([6])).toEqual([6]);
    expect(normalizeLabReceiveCalendarHiddenWeekdays([0])).toEqual([0]);
    expect(normalizeLabReceiveCalendarHiddenWeekdays([0, 6])).toEqual([0, 6]);
  });

  test("invalid-only input falls back to default", () => {
    expect(normalizeLabReceiveCalendarHiddenWeekdays([99, "x"])).toEqual([
      ...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS,
    ]);
  });

  test("all seven hidden is rejected to default", () => {
    expect(
      normalizeLabReceiveCalendarHiddenWeekdays([0, 1, 2, 3, 4, 5, 6]),
    ).toEqual([...DEFAULT_LAB_RECEIVE_CALENDAR_HIDDEN_WEEKDAYS]);
  });
});
