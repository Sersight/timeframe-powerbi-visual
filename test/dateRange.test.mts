/*
 * Unit tests for the pure date-range logic. Run with `npm test` (Node's built-in
 * test runner + type stripping, no extra dependencies). `npm run test:tz` repeats
 * them in several time zones (DST, both sides of UTC).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    addDays,
    calendarWeeks,
    rangeFromDays,
    shiftRange,
    weekStartForLocale,
    weeksInMonth,
    buildAdvancedFilter,
    computePresetRange,
    manualSelection,
    matchPreset,
    parseAdvancedFilter,
    parsePersistedSelection,
    resolveSelection,
    serializeSelection,
    toDayKey,
    type DateRange,
    type PresetId,
    type Selection,
} from "../src/dateRange.ts";

const day = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);
const keys = (range: DateRange | null) => (range ? [toDayKey(range.start), toDayKey(range.end)] : null);
const target = { table: "Calendar", column: "Date" };

/** Simulates Power BI storing the filter and handing it back on the next update. */
const roundTrip = (range: DateRange) => parseAdvancedFilter([JSON.parse(JSON.stringify(buildAdvancedFilter(target, range)))]);
const persistedOf = (selection: Selection) => parsePersistedSelection(serializeSelection(selection));

test("presets on a regular day (2026-10-28)", () => {
    const today = day(2026, 10, 28);
    const expected: Record<PresetId, [string, string]> = {
        today: ["2026-10-28", "2026-10-28"],
        yesterday: ["2026-10-27", "2026-10-27"],
        last7Days: ["2026-10-22", "2026-10-28"],
        last30Days: ["2026-09-29", "2026-10-28"],
        thisMonth: ["2026-10-01", "2026-10-31"],
        lastMonth: ["2026-09-01", "2026-09-30"],
        thisQuarter: ["2026-10-01", "2026-12-31"],
        lastQuarter: ["2026-07-01", "2026-09-30"],
        yearToDate: ["2026-01-01", "2026-10-28"],
        last12Months: ["2025-10-01", "2026-09-30"],
        thisYear: ["2026-01-01", "2026-12-31"],
        lastYear: ["2025-01-01", "2025-12-31"],
    };
    for (const [preset, range] of Object.entries(expected)) {
        assert.deepEqual(keys(computePresetRange(preset as PresetId, today)), range, preset);
    }
});

test("presets crossing year boundaries (January)", () => {
    const today = day(2026, 1, 15);
    assert.deepEqual(keys(computePresetRange("lastMonth", today)), ["2025-12-01", "2025-12-31"]);
    assert.deepEqual(keys(computePresetRange("lastQuarter", today)), ["2025-10-01", "2025-12-31"]);
    assert.deepEqual(keys(computePresetRange("last12Months", today)), ["2025-01-01", "2025-12-31"]);
});

test("lastMonth handles leap February and month-end days", () => {
    assert.deepEqual(keys(computePresetRange("lastMonth", day(2028, 3, 31))), ["2028-02-01", "2028-02-29"]);
    assert.deepEqual(keys(computePresetRange("thisMonth", day(2026, 2, 10))), ["2026-02-01", "2026-02-28"]);
});

test("addDays keeps midnight across DST changes", () => {
    // Covers the March and October transitions in Europe and the US.
    for (const start of [day(2026, 3, 7), day(2026, 3, 28), day(2026, 10, 24), day(2026, 10, 31)]) {
        for (let i = 0; i < 4; i++) {
            const d = addDays(start, i);
            assert.equal(d.getHours(), 0, `${toDayKey(d)} should be midnight`);
        }
    }
});

test("filter round trip preserves the range", () => {
    const range = { start: day(2026, 3, 1), end: day(2026, 3, 31) };
    assert.deepEqual(keys(roundTrip(range)), ["2026-03-01", "2026-03-31"]);
});

test("filter uses an exclusive upper bound so the whole last day is included", () => {
    const filter = buildAdvancedFilter(target, { start: day(2026, 3, 1), end: day(2026, 3, 31) }) as {
        conditions: { operator: string; value: string }[];
    };
    assert.equal(filter.conditions[1].operator, "LessThan");
    assert.equal(new Date(filter.conditions[1].value).getTime(), day(2026, 4, 1).getTime());
});

test("parseAdvancedFilter accepts inclusive bounds and rejects junk", () => {
    const inclusive = [{ conditions: [
        { operator: "GreaterThanOrEqual", value: day(2026, 5, 1).toJSON() },
        { operator: "LessThanOrEqual", value: day(2026, 5, 10).toJSON() },
    ] }];
    assert.deepEqual(keys(parseAdvancedFilter(inclusive)), ["2026-05-01", "2026-05-10"]);
    assert.equal(parseAdvancedFilter(undefined), null);
    assert.equal(parseAdvancedFilter([{ values: [1, 2] }]), null);
    assert.equal(parseAdvancedFilter([{ conditions: [{ operator: "LessThan", value: "not a date" }] }]), null);
});

test("parsePersistedSelection ignores malformed values", () => {
    assert.equal(parsePersistedSelection(""), null);
    assert.equal(parsePersistedSelection("{oops"), null);
    assert.equal(parsePersistedSelection(JSON.stringify({ kind: "nextDecade" })), null);
    assert.equal(parsePersistedSelection(42), null);
});

test("matchPreset recognises preset ranges, otherwise null", () => {
    const today = day(2026, 10, 28);
    assert.equal(matchPreset(computePresetRange("lastMonth", today), today), "lastMonth");
    assert.equal(matchPreset({ start: day(2026, 3, 2), end: day(2026, 3, 9) }, today), null);
});

// --- Selection resolution: the scenarios that break other date slicers ----------

test("first load without filter applies the default preset", () => {
    const today = day(2026, 10, 28);
    const result = resolveSelection({ filterRange: null, persisted: null, today, defaultPreset: "lastMonth", forceDefault: false });
    assert.equal(result.selection.kind, "lastMonth");
    assert.equal(result.apply, true);
});

test("user changes period away from the default: UI follows the filter, default is NOT re-applied", () => {
    // Persisted record still says thisMonth (persistence lagging or unavailable in reading
    // mode) while the filter already holds the user's March choice.
    const today = day(2026, 10, 28);
    const persisted = persistedOf({ kind: "thisMonth", range: computePresetRange("thisMonth", today) });
    const userRange = { start: day(2026, 3, 1), end: day(2026, 3, 31) };
    const result = resolveSelection({ filterRange: roundTrip(userRange), persisted, today, defaultPreset: null, forceDefault: false });
    assert.equal(result.selection.kind, "custom");
    assert.deepEqual(keys(result.selection.range), ["2026-03-01", "2026-03-31"]);
    assert.equal(result.apply, false);
});

test("a rolling preset saved last month is re-evaluated today", () => {
    const savedOn = day(2026, 10, 15);
    const today = day(2026, 11, 3);
    const saved = { kind: "lastMonth" as const, range: computePresetRange("lastMonth", savedOn) };
    const result = resolveSelection({
        filterRange: roundTrip(saved.range!), persisted: persistedOf(saved), today, defaultPreset: null, forceDefault: false,
    });
    assert.equal(result.selection.kind, "lastMonth");
    assert.deepEqual(keys(result.selection.range), ["2026-10-01", "2026-10-31"]);
    assert.equal(result.apply, true);
});

test("an up-to-date rolling preset is not re-applied (no update loop)", () => {
    const today = day(2026, 10, 28);
    const selection = { kind: "last7Days" as const, range: computePresetRange("last7Days", today) };
    const result = resolveSelection({
        filterRange: roundTrip(selection.range!), persisted: persistedOf(selection), today, defaultPreset: "lastMonth", forceDefault: false,
    });
    assert.equal(result.selection.kind, "last7Days");
    assert.equal(result.apply, false);
});

test("bookmark with a custom range is restored as custom, even if a default exists", () => {
    const today = day(2026, 10, 28);
    const custom = { kind: "custom" as const, range: { start: day(2026, 2, 3), end: day(2026, 2, 17) } };
    const result = resolveSelection({
        filterRange: roundTrip(custom.range), persisted: persistedOf(custom), today, defaultPreset: "lastMonth", forceDefault: false,
    });
    assert.equal(result.selection.kind, "custom");
    assert.equal(result.apply, false);
});

test("explicit 'all' (cleared) is kept and not replaced by the default", () => {
    const today = day(2026, 10, 28);
    const result = resolveSelection({
        filterRange: null, persisted: persistedOf({ kind: "all", range: null }), today, defaultPreset: "lastMonth", forceDefault: false,
    });
    assert.equal(result.selection.kind, "all");
    assert.equal(result.apply, false);
});

test("filter coming from elsewhere (e.g. sync slicers) is displayed, matching preset highlighted", () => {
    const today = day(2026, 10, 28);
    const result = resolveSelection({
        filterRange: computePresetRange("thisQuarter", today), persisted: null, today, defaultPreset: null, forceDefault: false,
    });
    assert.equal(result.selection.kind, "thisQuarter");
    assert.equal(result.apply, false);
});

test("author changing the default in the format pane forces it", () => {
    const today = day(2026, 10, 28);
    const current = { kind: "lastMonth" as const, range: computePresetRange("lastMonth", today) };
    const result = resolveSelection({
        filterRange: current.range, persisted: persistedOf(current), today, defaultPreset: "yearToDate", forceDefault: true,
    });
    assert.equal(result.selection.kind, "yearToDate");
    assert.equal(result.apply, true);
});

// --- Navigation and calendar helpers -----------------------------------------

test("shiftRange moves month-aligned ranges by whole months", () => {
    const september = { start: day(2026, 9, 1), end: day(2026, 9, 30) };
    assert.deepEqual(keys(shiftRange(september, -1)), ["2026-08-01", "2026-08-31"]);
    assert.deepEqual(keys(shiftRange(september, 1)), ["2026-10-01", "2026-10-31"]);
    // Short month to long month and across the year boundary.
    assert.deepEqual(keys(shiftRange({ start: day(2026, 2, 1), end: day(2026, 2, 28) }, 1)), ["2026-03-01", "2026-03-31"]);
    const q4 = { start: day(2026, 10, 1), end: day(2026, 12, 31) };
    assert.deepEqual(keys(shiftRange(q4, 1)), ["2027-01-01", "2027-03-31"]);
    assert.deepEqual(keys(shiftRange({ start: day(2026, 1, 1), end: day(2026, 12, 31) }, -1)), ["2025-01-01", "2025-12-31"]);
});

test("arrows away from the default and back land on the default again (rolling)", () => {
    const today = day(2026, 11, 2);
    const thisMonth = computePresetRange("thisMonth", today);
    const back = shiftRange(shiftRange(thisMonth, 1), -1);
    assert.equal(manualSelection(back, "thisMonth", today).kind, "thisMonth");
    // One step away is a fixed range.
    assert.equal(manualSelection(shiftRange(thisMonth, 1), "thisMonth", today).kind, "custom");
});

test("hand-picked ranges only become a preset when they equal the default", () => {
    const today = day(2026, 11, 2);
    const october = { start: day(2026, 10, 1), end: day(2026, 10, 31) };
    // Same dates as "last month", but that is not the default: stays fixed.
    assert.equal(manualSelection(october, "thisMonth", today).kind, "custom");
    assert.equal(manualSelection(october, "lastMonth", today).kind, "lastMonth");
    // No default ("none" = all dates): a range is always custom.
    assert.equal(manualSelection(october, null, today).kind, "custom");
});

test("shiftRange moves other ranges by their length in days", () => {
    const week = { start: day(2026, 10, 22), end: day(2026, 10, 28) };
    assert.deepEqual(keys(shiftRange(week, -1)), ["2026-10-15", "2026-10-21"]);
    assert.deepEqual(keys(shiftRange({ start: day(2026, 3, 29), end: day(2026, 3, 29) }, 1)), ["2026-03-30", "2026-03-30"]);
});

test("rangeFromDays orders the two clicked days", () => {
    assert.deepEqual(keys(rangeFromDays(day(2026, 5, 9), day(2026, 5, 2))), ["2026-05-02", "2026-05-09"]);
});

test("calendarWeeks: 6 weeks, correct first weekday, contains the whole month", () => {
    // 1 October 2026 is a Thursday.
    const monday = calendarWeeks(2026, 9, 1);
    assert.equal(monday.length, 6);
    assert.equal(toDayKey(monday[0][0]), "2026-09-28");
    assert.equal(monday[0][0].getDay(), 1);
    const sunday = calendarWeeks(2026, 9, 0);
    assert.equal(toDayKey(sunday[0][0]), "2026-09-27");
    const days = monday.flat().map(toDayKey);
    assert.ok(days.includes("2026-10-01") && days.includes("2026-10-31"));
});

test("weekStartForLocale", () => {
    assert.equal(weekStartForLocale("pt-PT"), 1);
    assert.equal(weekStartForLocale("pt-BR"), 0);
    assert.equal(weekStartForLocale("en-US"), 0);
    assert.equal(weekStartForLocale("en-GB"), 1);
    assert.equal(weekStartForLocale("en"), 0);
    assert.equal(weekStartForLocale("de"), 1);
});

test("author setting the default to 'none' clears the selection", () => {
    const today = day(2026, 10, 28);
    const current = { kind: "lastMonth" as const, range: computePresetRange("lastMonth", today) };
    const result = resolveSelection({
        filterRange: current.range, persisted: persistedOf(current), today, defaultPreset: null, forceDefault: true,
    });
    assert.equal(result.selection.kind, "all");
    assert.equal(result.selection.range, null);
    assert.equal(result.apply, true);
});

test("weeksInMonth", () => {
    assert.equal(weeksInMonth(2026, 8, 1), 5);  // September 2026 starts on Tuesday (Monday-first)
    assert.equal(weeksInMonth(2026, 7, 1), 6);  // August 2026: Saturday start, 31 days
    assert.equal(weeksInMonth(2021, 1, 1), 4);  // February 2021: Monday start, 28 days
    assert.equal(weeksInMonth(2026, 1, 0), 4);  // February 2026 starts on Sunday (Sunday-first)
});
