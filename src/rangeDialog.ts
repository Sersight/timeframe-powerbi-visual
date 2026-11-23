/*
 * Range-picker dialog. A custom visual lives in an iframe the size of the visual, so
 * an in-visual popover would be clipped; Power BI's modal dialog API is the only way
 * to show a full calendar from a small slicer bar.
 *
 * The dialog runs in its own iframe: it receives everything it needs through the
 * serialisable `initialState` and reports back through `host.setResult`, which the
 * visual reads when the user presses OK.
 */
import powerbi from "powerbi-visuals-api";
import { CalendarDraft, CalendarView } from "./calendarView";
import { DateRange, WeekStart, fromDayKey, rangeFromDays, startOfDay, toDayKey } from "./dateRange";
import { applyCornerRadius, el } from "./dom";
import { DateLabels, DateStyle, getStrings } from "./i18n";
import { Motion } from "./motion";

import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;

/** Serialisable input for the dialog (dates as `YYYY-MM-DD` day keys). */
export interface RangeDialogState {
    start: string | null;
    end: string | null;
    locale: string;
    dateStyle: DateStyle;
    weekStart: WeekStart;
    months: number;
    accent: string;
    onAccent: string;
    fontFamily: string;
    /** Corner radius (px) from the format pane; absent in states from older versions. */
    cornerRadius?: number;
}

/** What the dialog hands back to the visual. */
export interface RangeDialogResult {
    start: string;
    end: string;
}

/**
 * Parses a dialog result back into a range.
 * @param result `ModalDialogResult.resultState`.
 * @returns The picked range, or `null` if nothing usable was returned.
 */
export function parseDialogResult(result: unknown): DateRange | null {
    const value = result as Partial<RangeDialogResult> | null;
    const start = typeof value?.start === "string" ? fromDayKey(value.start) : null;
    const end = typeof value?.end === "string" ? fromDayKey(value.end) : null;
    return start && end ? rangeFromDays(start, end) : null;
}

/**
 * Dialog content: a summary line and a one- or two-month range calendar.
 */
export class RangeDialog {
    static readonly id = "TimeframeRangeDialog";

    private readonly root: HTMLElement;
    private readonly labels: DateLabels;
    private readonly state: RangeDialogState;
    private readonly draft: CalendarDraft = { start: null };
    private readonly motion = new Motion();
    private selected: DateRange | null;
    private anchor: Date;

    /**
     * @param options Dialog element and host (for `setResult`).
     * @param initialState A {@link RangeDialogState}.
     */
    constructor(private readonly options: DialogConstructorOptions, initialState: object) {
        this.state = initialState as RangeDialogState;
        const strings = getStrings(this.state.locale);
        this.labels = new DateLabels(this.state.locale, strings, this.state.dateStyle);

        const start = this.state.start ? fromDayKey(this.state.start) : null;
        const end = this.state.end ? fromDayKey(this.state.end) : null;
        this.selected = start && end ? { start, end } : null;
        const anchorDay = this.selected?.end ?? startOfDay(new Date());
        this.anchor = new Date(anchorDay.getFullYear(), anchorDay.getMonth(), 1);

        this.root = options.element;
        this.root.classList.add("drs", "drs-dialog");
        this.root.style.setProperty("--drs-accent", this.state.accent);
        this.root.style.setProperty("--drs-on-accent", this.state.onAccent);
        this.root.style.setProperty("--drs-font", this.state.fontFamily);
        applyCornerRadius(this.root, this.state.cornerRadius ?? 8);

        // OK without touching anything keeps the current range.
        if (this.selected) {
            this.report(this.selected);
        }
        this.render();
    }

    private render(focusDay?: Date): void {
        const strings = getStrings(this.state.locale);
        const summary = el("div", "drs-dialog-summary");
        const range = this.draft.start ? { start: this.draft.start, end: this.draft.start } : this.selected;
        summary.append(
            el("span", "drs-dialog-label", this.draft.start ? strings.pickEnd : strings.choosePeriod),
            el("span", "drs-dialog-dates", range ? this.labels.dates(range) : "—"),
        );

        const calendar = new CalendarView({
            anchorMonth: this.anchor,
            months: this.state.months,
            weekStart: this.state.weekStart,
            today: startOfDay(new Date()),
            selected: this.selected,
            draft: this.draft,
            labels: this.labels,
            strings,
            onNavigate: (delta, day) => {
                this.anchor = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + delta, 1);
                this.motion.start(["month"], { dir: delta });
                this.render(day);
            },
            onDraftStart: day => {
                // A single click followed by OK selects that one day.
                this.report({ start: day, end: day });
                this.render(day);
            },
            onPick: picked => {
                this.selected = picked;
                this.report(picked);
                this.motion.start(["fill", "dates"]);
                this.render(picked.end);
            },
        });

        this.motion.apply(this.root);
        this.root.replaceChildren(summary, calendar.element);
        if (focusDay) {
            calendar.focusDay(focusDay);
        }
    }

    private report(range: DateRange): void {
        const result: RangeDialogResult = { start: toDayKey(range.start), end: toDayKey(range.end) };
        this.options.host.setResult(result);
    }
}

// Power BI looks dialogs up by id in this global registry.
const registryHost = globalThis as unknown as { dialogRegistry?: Record<string, unknown> };
registryHost.dialogRegistry = registryHost.dialogRegistry || {};
registryHost.dialogRegistry[RangeDialog.id] = RangeDialog;
