/*
 * Language lookup and date labels. The texts themselves live in translations.ts;
 * dates and month names come from Intl, so they follow whatever locale is in use.
 */
import { DateRange, Selection, addDays, isWholeMonths, rangesEqual } from "./dateRange";
import { PANE_STRINGS, PaneStrings, STRINGS, Strings, languageKey } from "./translations";

export type { PaneStrings, PresetGroup, Strings } from "./translations";

/**
 * Texts of the visual for a locale (e.g. "pt-PT", "pt-BR", "de-DE").
 * @param locale Effective locale (author's choice or Power BI's language).
 * @returns The matching translation, English when the language isn't translated.
 */
export function getStrings(locale: string): Strings {
    return STRINGS[languageKey(locale)];
}

/**
 * Texts of the format pane, in Power BI's UI language.
 * @param locale `IVisualHost.locale`.
 */
export function getPaneStrings(locale: string): PaneStrings {
    return PANE_STRINGS[languageKey(locale)];
}

/** "short" → 1 set. 2026; "numeric" → 01/09/2026 (order and separators follow the locale). */
export type DateStyle = "short" | "numeric" | "long";

/** Format-pane choice: a fixed style, or "auto" (long with two calendar months, numeric otherwise). */
export type DateStyleSetting = DateStyle | "auto";

/**
 * A language tag `Intl` accepts: the given one, or "en" when it is empty or malformed.
 * (Unknown but well-formed tags such as "xx-YY" are fine: Intl falls back by itself.)
 * @param locale Tag from the host or the format pane.
 */
export function safeLocale(locale: string | undefined): string {
    try {
        return Intl.getCanonicalLocales(locale || "en")[0] ?? "en";
    } catch {
        return "en";
    }
}

/**
 * Locale-aware date formatting used across the visual.
 */
export class DateLabels {
    private readonly dayFormat: Intl.DateTimeFormat;
    private readonly numericFormat: Intl.DateTimeFormat;
    private readonly longFormat: Intl.DateTimeFormat;
    private readonly monthYearFormat: Intl.DateTimeFormat;
    private readonly weekdayFormat: Intl.DateTimeFormat;
    private readonly longDayFormat: Intl.DateTimeFormat;
    private readonly shortMonthFormat: Intl.DateTimeFormat;

    /**
     * @param locale Locale for month names and date order (e.g. "pt-PT").
     * @param strings Matching string table.
     * @param style How the date range is written.
     */
    constructor(locale: string, private readonly strings: Strings, private readonly style: DateStyle = "short") {
        // Intl throws on an empty or malformed tag; an odd host must not break the visual.
        locale = safeLocale(locale);
        this.dayFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
        this.numericFormat = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
        this.longFormat = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" });
        this.monthYearFormat = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
        this.weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
        this.longDayFormat = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        this.shortMonthFormat = new Intl.DateTimeFormat(locale, { month: "short" });
    }

    /**
     * Main label for a selection: the preset name, or a natural description of a
     * custom range ("September 2026", "Q3 2026", "2026") when one fits.
     */
    title(selection: Selection): string {
        if (selection.kind === "all") {
            return this.strings.all;
        }
        if (selection.kind !== "custom") {
            return this.strings.presets[selection.kind];
        }
        return selection.range ? this.describe(selection.range) : this.strings.custom;
    }

    /**
     * Secondary label: the dates themselves, compact ("1–30 Sep 2026").
     */
    dates(range: DateRange | null): string {
        if (!range) {
            return "";
        }
        const singleDay = rangesEqual({ start: range.start, end: range.start }, range);
        if (this.style === "numeric" || this.style === "long") {
            const formatter = this.style === "numeric" ? this.numericFormat : this.longFormat;
            const fmt = (date: Date) => formatter.format(date);
            return singleDay ? fmt(range.start) : `${fmt(range.start)} – ${fmt(range.end)}`;
        }
        const text = singleDay ? this.dayFormat.format(range.start) : this.dayFormat.formatRange(range.start, range.end);
        // Some locales (pt-PT among them) render "short month" as digits (29/09/2026),
        // which reads poorly in a title; fall back to "29 set. – 28 out. 2026".
        return /\p{L}/u.test(text) ? text : this.wordyRange(range, singleDay);
    }

    private wordyRange({ start, end }: DateRange, singleDay: boolean): string {
        const month = (date: Date) => this.shortMonthFormat.format(date);
        if (singleDay) {
            return `${start.getDate()} ${month(start)} ${start.getFullYear()}`;
        }
        if (start.getFullYear() !== end.getFullYear()) {
            return `${start.getDate()} ${month(start)} ${start.getFullYear()} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
        }
        if (start.getMonth() === end.getMonth()) {
            return `${start.getDate()}–${end.getDate()} ${month(end)} ${end.getFullYear()}`;
        }
        return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`;
    }

    /** "setembro de 2026" */
    monthTitle(month: Date): string {
        const text = this.monthYearFormat.format(month);
        return text.charAt(0).toLocaleUpperCase() + text.slice(1);
    }

    /** Single-letter weekday header. */
    weekday(date: Date): string {
        return this.weekdayFormat.format(date).toLocaleUpperCase();
    }

    /** Full date for screen readers. */
    longDay(date: Date): string {
        return this.longDayFormat.format(date);
    }

    private describe(range: DateRange): string {
        if (!isWholeMonths(range)) {
            return this.dates(range);
        }
        const { start, end } = range;
        const sameYear = start.getFullYear() === end.getFullYear();
        if (sameYear && start.getMonth() === end.getMonth()) {
            return this.monthTitle(start);
        }
        if (sameYear && start.getMonth() % 3 === 0 && end.getMonth() === start.getMonth() + 2) {
            return `${this.strings.quarterPrefix}${start.getMonth() / 3 + 1} ${start.getFullYear()}`;
        }
        if (sameYear && start.getMonth() === 0 && addDays(end, 1).getFullYear() === start.getFullYear() + 1) {
            return String(start.getFullYear());
        }
        return this.dates(range);
    }
}
