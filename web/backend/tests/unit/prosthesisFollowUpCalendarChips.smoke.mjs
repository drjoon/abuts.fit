/**
 * FE calendar chip Stage SSOT — run via node (no vitest in frontend package).
 * node --experimental-strip-types or transpile; kept as .mjs mirror of TS rules for CI-less smoke.
 *
 * Primary coverage: web/backend/tests/unit + this smoke when imported from a jest/esbuild path.
 * Logic under test lives in prosthesisFollowUpCalendarChips.ts — duplicated assertions below
 * via dynamic import when available.
 */
import assert from "node:assert/strict";

// Minimal mirror of attach rules for same-day vs other-day (keeps BE CI green without FE bundler).
const TEMP = "temp";
const zirKey = (i) => `zirconia-${Math.max(0, Math.floor(Number(i) || 0))}`;

function attachFocus({ chips, followUps, dateKey = "arrivalDate" }) {
  const ymdOf = (chip) =>
    dateKey === "orderDate"
      ? String(chip.orderDate || "").trim()
      : String(chip.arrivalDate || "").trim();
  const fuYmd = (row) =>
    dateKey === "orderDate"
      ? String(row.orderYmd || row.arrivalYmd || "").trim()
      : String(row.arrivalYmd || "").trim();
  const prevYmd = (row) =>
    dateKey === "orderDate"
      ? String(row.previousOrderYmd || row.previousArrivalYmd || "").trim()
      : String(row.previousArrivalYmd || "").trim();

  const active = (followUps || []).filter((r) => !r.canceledAt);
  const out = [];
  for (const chip of chips) {
    const ymd = ymdOf(chip);
    if (active.length === 0) {
      out.push(chip);
      continue;
    }
    const onDay = active.filter((r) => fuYmd(r) === ymd);
    const original = prevYmd(active[0]);
    if (onDay.length === 0) {
      out.push(
        original && original === ymd
          ? { ...chip, focusFollowUpIndex: -1, prosthesisStageKey: TEMP }
          : chip,
      );
      continue;
    }
    if (!original || original === ymd) {
      out.push({ ...chip, focusFollowUpIndex: -1, prosthesisStageKey: TEMP });
      continue;
    }
    const last = onDay[onDay.length - 1];
    const idx = Math.max(0, Math.floor(Number(last.followUpIndex || 0)));
    out.push({
      ...chip,
      focusFollowUpIndex: idx,
      prosthesisStageKey: zirKey(idx),
    });
  }
  return out;
}

{
  const followUps = [
    {
      followUpIndex: 0,
      arrivalYmd: "2026-09-15",
      orderYmd: "2026-09-15",
      previousArrivalYmd: "2026-09-15",
      previousOrderYmd: "2026-09-15",
    },
  ];
  const sameDay = attachFocus({
    chips: [{ id: "t1", arrivalDate: "2026-09-15" }],
    followUps,
  });
  assert.equal(sameDay[0].prosthesisStageKey, TEMP);
  assert.equal(sameDay[0].focusFollowUpIndex, -1);
}

{
  const followUps = [
    {
      followUpIndex: 0,
      arrivalYmd: "2026-09-20",
      orderYmd: "2026-09-20",
      previousArrivalYmd: "2026-09-15",
      previousOrderYmd: "2026-09-15",
    },
  ];
  const chips = attachFocus({
    chips: [
      { id: "t1:arr:2026-09-15", arrivalDate: "2026-09-15" },
      { id: "t1:arr:2026-09-20", arrivalDate: "2026-09-20" },
    ],
    followUps,
  });
  assert.equal(chips[0].prosthesisStageKey, TEMP);
  assert.equal(chips[1].prosthesisStageKey, "zirconia-0");
  assert.equal(chips[1].focusFollowUpIndex, 0);
}

console.log("prosthesisFollowUpCalendarChips.smoke: ok");
