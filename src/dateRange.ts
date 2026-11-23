/*
 * Pure date-range logic for the slicer: preset calculation, filter (de)serialisation
 * and selection-state resolution.
 *
 * This module deliberately has no imports and uses no TypeScript-only runtime
 * constructs (enums, namespaces) so the unit tests can run it directly with
 * Node's built-in type stripping, without a test framework or a build step.
 *
 * Dates are always *local* midnight `Date` objects. Power BI hands date columns to
 * the visual as local-midnight dates, so building filter values the same way keeps
 * the round trip symmetric in every time zone (UTC-midnight values would shift by a
 * day for users west/east of UTC).
 */

/** Built-in relative periods, in the order they are shown and matched. */
export const PRESET_IDS = [
    "today",
    "yesterday",
    "last7Days",
    "last30Days",
    "thisMonth",
    "lastMonth",
    "thisQuarter",
    "lastQuarter",
    "yearToDate",
    "last12Months",
    "thisYear",
    "lastYear",
] as const;

export type PresetId = typeof PRESET_IDS[number];

/** A selection is either a rolling preset, a user-picked fixed range, or no filter. */
export type SelectionKind = PresetId | "custom" | "all";

/** Inclusive date range; both ends are local-midnight dates. */
export interface DateRange {
    start: Date;
    end: Date;
}

export interface Selection {
    kind: SelectionKind;
    /** `null` means "no filter" (kind `all`). */
    range: DateRange | null;
}

/** Shape stored in the visual's `filterState` property (and therefore in bookmarks). */
export interface PersistedSelection {
    kind: SelectionKind;
    /** Day keys (`YYYY-MM-DD`) of the range that was applied together with this record. */
    start: string | null;
    end: string | null;
}

/** Column the filter is applied to. */
export interface FilterTarget {
    table: string;
    column: string;
}

// ---------------------------------------------------------------------------
// Basic date helpers
// ---------------------------------------------------------------------------

/**
 * Returns local midnight of the given date.
 * @param date Any date/time.
 * @returns A new `Date` at 00:00 local time on the same calendar day.
 */
export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Adds calendar days. Uses the y/m/d constructor rather than adding milliseconds so
 * daylight-saving transitions never produce 23:00 or 01:00 "midnights".
 * @param date Local-midnight date.
 * @param days Number of days to add (may be negative).
 * @returns A new local-midnight date.
 */
export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Formats a date as a time-zone-independent day key.
 * @param date Local date.
 * @returns `YYYY-MM-DD`.
 */
export function toDayKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parses a day key produced by {@link toDayKey}.
 * @param key `YYYY-MM-DD` string.
 * @returns Local-midnight date, or `null` if the key is malformed.
 */
export function fromDayKey(key: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) {
        return null;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Compares two ranges by calendar day; `null` (no filter) only equals `null`.
 * @returns `true` when both describe the same days.
 */
export function rangesEqual(a: DateRange | null, b: DateRange | null): boolean {
    if (!a || !b) {
        return a === b;
    }
    return toDayKey(a.start) === toDayKey(b.start) && toDayKey(a.end) === toDayKey(b.end);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Calculates the range a preset covers on a given day.
 * "This month/quarter/year" cover the whole calendar period (not "to date") to match
 * Power BI's native relative-date behaviour; future days simply have no data.
 * @param preset Preset to evaluate.
 * @param today Reference day (local midnight).
 * @returns Inclusive range.
 */
export function computePresetRange(preset: PresetId, today: Date): DateRange {
    const y = today.getFullYear();
    const m = today.getMonth();
    const quarterStartMonth = m - (m % 3);

    switch (preset) {
        case "today":
            return { start: today, end: today };
        case "yesterday": {
            const yesterday = addDays(today, -1);
            return { start: yesterday, end: yesterday };
        }
        // Rolling windows include today, like the native "last N days" slicer.
        case "last7Days":
            return { start: addDays(today, -6), end: today };
        case "last30Days":
            return { start: addDays(today, -29), end: today };
        case "thisMonth":
            return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
        case "lastMonth":
            return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
        case "thisQuarter":
            return { start: new Date(y, quarterStartMonth, 1), end: new Date(y, quarterStartMonth + 3, 0) };
        case "lastQuarter":
            return { start: new Date(y, quarterStartMonth - 3, 1), end: new Date(y, quarterStartMonth, 0) };
        case "yearToDate":
            return { start: new Date(y, 0, 1), end: today };
        // Complete months only, so the current partial month never skews comparisons.
        case "last12Months":
            return { start: new Date(y, m - 12, 1), end: new Date(y, m, 0) };
        case "thisYear":
            return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
        case "lastYear":
            return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31) };
    }
}

/**
 * Finds the first preset whose range today equals the given range.
 * Used only to highlight a matching chip when the filter came from elsewhere
 * (bookmark from another version, sync slicers...).
 * @returns The matching preset, or `null`.
 */
export function matchPreset(range: DateRange, today: Date): PresetId | null {
    return PRESET_IDS.find(id => rangesEqual(computePresetRange(id, today), range)) ?? null;
}

/**
 * Selection for a range the user picked by hand (arrows, calendar, date fields).
 * Such ranges are fixed ("custom"), except when they land exactly on the default
 * period as it is today: e.g. "This month", › then ‹ is back on the default, and is
 * treated (and saved) as the default again, so it keeps rolling and ⚡ shows it.
 * Other presets are deliberately not recognised: silently turning a hand-picked range
 * into a rolling one would change what the report opens with next month.
 * @param range The picked range.
 * @param defaultPreset The format-pane default, or `null` when there is none.
 * @param today Today at local midnight.
 * @returns The default preset's selection, or a custom one.
 */
export function manualSelection(range: DateRange, defaultPreset: PresetId | null, today: Date): Selection {
    if (defaultPreset && rangesEqual(computePresetRange(defaultPreset, today), range)) {
        return presetSelection(defaultPreset, today);
    }
    return { kind: "custom", range };
}

/**
 * Type guard for values read back from persisted state or settings.
 */
export function isPresetId(value: unknown): value is PresetId {
    return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Power BI advanced filter (de)serialisation
// ---------------------------------------------------------------------------

// Values from powerbi-models; hard-coded so we don't need that package just for two constants.
// The schema is an identifier Power BI matches as a string, not a URL that is ever fetched.
// eslint-disable-next-line powerbi-visuals/no-http-string
const ADVANCED_FILTER_SCHEMA = "http://powerbi.com/product/schema#advanced";
const ADVANCED_FILTER_TYPE = 0;

/**
 * Builds the JSON for an advanced filter `start <= column < end + 1 day`.
 * An exclusive upper bound is used so date-time columns include the whole last day.
 * @param target Column to filter.
 * @param range Inclusive range to keep.
 * @returns Filter object accepted by `IVisualHost.applyJsonFilter`.
 */
export function buildAdvancedFilter(target: FilterTarget, range: DateRange): object {
    return {
        $schema: ADVANCED_FILTER_SCHEMA,
        target: { table: target.table, column: target.column },
        filterType: ADVANCED_FILTER_TYPE,
        logicalOperator: "And",
        conditions: [
            { operator: "GreaterThanOrEqual", value: range.start.toJSON() },
            { operator: "LessThan", value: addDays(range.end, 1).toJSON() },
        ],
    };
}

interface FilterCondition {
    operator?: string;
    value?: unknown;
}

/**
 * Reads the date range back from `VisualUpdateOptions.jsonFilters`.
 * Accepts inclusive or exclusive bounds so filters written by older versions or
 * other tools still parse.
 * @param jsonFilters Filters passed to `update()`.
 * @returns The inclusive range, or `null` when there is no usable filter.
 */
export function parseAdvancedFilter(jsonFilters: unknown[] | undefined | null): DateRange | null {
    const filter = jsonFilters?.[0] as { conditions?: FilterCondition[] } | undefined;
    if (!filter || !Array.isArray(filter.conditions)) {
        return null;
    }

    let start: Date | null = null;
    let end: Date | null = null;

    for (const condition of filter.conditions) {
        const value = toDate(condition.value);
        if (!value) {
            continue;
        }
        const day = startOfDay(value);
        const isMidnight = day.getTime() === value.getTime();

        switch (condition.operator) {
            case "GreaterThanOrEqual":
                start = isMidnight ? day : addDays(day, 1);
                break;
            case "GreaterThan":
                start = addDays(day, 1);
                break;
            case "LessThan":
                // "< midnight of D" ends on D-1; "< 10:00 on D" still includes D.
                end = isMidnight ? addDays(day, -1) : day;
                break;
            case "LessThanOrEqual":
                end = day;
                break;
        }
    }

    return start && end && start.getTime() <= end.getTime() ? { start, end } : null;
}

function toDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

/**
 * Serialises a selection for the `filterState` property.
 * @returns JSON string.
 */
export function serializeSelection(selection: Selection): string {
    const persisted: PersistedSelection = {
        kind: selection.kind,
        start: selection.range ? toDayKey(selection.range.start) : null,
        end: selection.range ? toDayKey(selection.range.end) : null,
    };
    return JSON.stringify(persisted);
}

/**
 * Parses the `filterState` property. Anything malformed is treated as "no record"
 * so a corrupted value can never block the visual.
 * @returns The record, or `null`.
 */
export function parsePersistedSelection(raw: unknown): PersistedSelection | null {
    if (typeof raw !== "string" || raw === "") {
        return null;
    }
    try {
        const value = JSON.parse(raw) as Partial<PersistedSelection>;
        const kindOk = isPresetId(value.kind) || value.kind === "custom" || value.kind === "all";
        if (!kindOk) {
            return null;
        }
        return {
            kind: value.kind as SelectionKind,
            start: typeof value.start === "string" ? value.start : null,
            end: typeof value.end === "string" ? value.end : null,
        };
    } catch {
        return null;
    }
}

function persistedRange(persisted: PersistedSelection): DateRange | null {
    const start = persisted.start ? fromDayKey(persisted.start) : null;
    const end = persisted.end ? fromDayKey(persisted.end) : null;
    return start && end ? { start, end } : null;
}

// ---------------------------------------------------------------------------
// Selection resolution
// ---------------------------------------------------------------------------

export interface ResolveInput {
    /** Range currently applied by Power BI (`jsonFilters`), the source of truth. */
    filterRange: DateRange | null;
    /** Record saved alongside the last filter this visual applied. */
    persisted: PersistedSelection | null;
    today: Date;
    /**
     * Preset to use when nothing is selected yet. The visual passes it only on the
     * first update of an instance, so a user's explicit "clear" isn't overridden later.
     */
    defaultPreset: PresetId | null;
    /** The author just changed the default in the format pane: apply it regardless. */
    forceDefault: boolean;
}

export interface Resolution {
    /** What the visual should display. */
    selection: Selection;
    /** `true` when the visual must apply (and persist) `selection` itself. */
    apply: boolean;
}

/**
 * Decides what the slicer shows and whether it must (re)apply its filter.
 *
 * The rule that avoids the classic "UI shows the default but data shows something
 * else" bug: the Power BI filter is always the source of truth. The persisted record
 * is trusted only when it describes exactly the filter currently applied; only then
 * do we roll a dynamic preset forward (e.g. "last month" saved in September is
 * re-evaluated in October). If the filter changed by any other route, we display it
 * as-is and never fight it.
 *
 * @param input Current filter, persisted record, today and default settings.
 * @returns Selection to display and whether to apply it.
 */
export function resolveSelection(input: ResolveInput): Resolution {
    const { filterRange, persisted, today, defaultPreset, forceDefault } = input;

    if (forceDefault) {
        // "None" as the new default means "all dates".
        return defaultPreset
            ? { selection: presetSelection(defaultPreset, today), apply: true }
            : { selection: { kind: "all", range: null }, apply: true };
    }

    if (persisted && rangesEqual(persistedRange(persisted), filterRange)) {
        if (isPresetId(persisted.kind)) {
            const fresh = presetSelection(persisted.kind, today);
            return { selection: fresh, apply: !rangesEqual(fresh.range, filterRange) };
        }
        return { selection: { kind: persisted.kind, range: filterRange }, apply: false };
    }

    if (!filterRange && defaultPreset) {
        return { selection: presetSelection(defaultPreset, today), apply: true };
    }

    if (!filterRange) {
        return { selection: { kind: "all", range: null }, apply: false };
    }
    return { selection: { kind: matchPreset(filterRange, today) ?? "custom", range: filterRange }, apply: false };
}

/**
 * Builds the selection for a preset on a given day.
 */
export function presetSelection(preset: PresetId, today: Date): Selection {
    return { kind: preset, range: computePresetRange(preset, today) };
}

// ---------------------------------------------------------------------------
// Navigation and calendar helpers
// ---------------------------------------------------------------------------

/** 0 = Sunday, 1 = Monday (same numbering as `Date.getDay()`). */
export type WeekStart = 0 | 1;

// Regions where weeks conventionally start on Sunday. Everything else uses Monday
// (ISO 8601). `Intl.Locale#getWeekInfo` would be nicer but isn't available in every
// Power BI host browser yet.
const SUNDAY_FIRST_REGIONS = ["US", "CA", "BR", "MX", "JP", "KR", "TW", "HK", "IL", "PH", "IN", "ZA", "SA"];

/**
 * Conventional first day of the week for a locale.
 * @param locale BCP 47 tag, e.g. "pt-PT", "pt-BR", "en-US".
 * @returns 0 (Sunday) or 1 (Monday).
 */
export function weekStartForLocale(locale: string): WeekStart {
    const region = (locale ?? "").split(/[-_]/)[1]?.toUpperCase();
    if (!region) {
        // A bare "en" in Power BI means the US default.
        return (locale ?? "").toLowerCase().startsWith("en") ? 0 : 1;
    }
    return SUNDAY_FIRST_REGIONS.includes(region) ? 0 : 1;
}

/**
 * Whole days from `start` to `end` (rounded, so DST's 23/25-hour days don't matter).
 */
export function daysBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Orders two picked days into a range (users may click the end date first).
 */
export function rangeFromDays(a: Date, b: Date): DateRange {
    return a.getTime() <= b.getTime() ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Whether the range covers whole calendar months (1st of a month to the last day of a month).
 */
export function isWholeMonths(range: DateRange): boolean {
    return range.start.getDate() === 1 && addDays(range.end, 1).getDate() === 1;
}

/**
 * Moves a range one "length" backwards or forwards.
 * Month-aligned ranges move by months so "September" becomes "August", not
 * "the 30 days before 1 September"; any other range moves by its number of days.
 * @param range Current range.
 * @param direction -1 for previous, 1 for next.
 * @returns The adjacent range of the same size.
 */
export function shiftRange(range: DateRange, direction: -1 | 1): DateRange {
    if (isWholeMonths(range)) {
        const months = (range.end.getFullYear() - range.start.getFullYear()) * 12
            + range.end.getMonth() - range.start.getMonth() + 1;
        const start = new Date(range.start.getFullYear(), range.start.getMonth() + direction * months, 1);
        return { start, end: new Date(start.getFullYear(), start.getMonth() + months, 0) };
    }
    const days = daysBetween(range.start, range.end) + 1;
    return { start: addDays(range.start, direction * days), end: addDays(range.end, direction * days) };
}

/**
 * Number of week rows a month spans (4 to 6), given the first day of the week.
 * @param year Full year.
 * @param month 0-based month.
 * @param weekStart First day of the week.
 */
export function weeksInMonth(year: number, month: number, weekStart: WeekStart): number {
    const offset = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return Math.ceil((offset + days) / 7);
}

/**
 * Builds a month grid for the calendar. Always 6 weeks so the calendar height
 * doesn't jump when navigating between months.
 * @param year Full year.
 * @param month 0-based month.
 * @param weekStart First day of the week.
 * @returns 6 rows of 7 local-midnight dates (including days of adjacent months).
 */
export function calendarWeeks(year: number, month: number, weekStart: WeekStart): Date[][] {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const gridStart = addDays(first, -offset);
    return Array.from({ length: 6 }, (_, week) =>
        Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)));
}
