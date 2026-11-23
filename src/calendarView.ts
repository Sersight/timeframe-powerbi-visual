/*
 * Month calendar with two-click range selection.
 *
 * Hover previews are painted by toggling classes on the existing day buttons instead
 * of rebuilding the DOM, so moving the mouse stays cheap and keyboard focus is kept.
 */
import { DateRange, WeekStart, addDays, calendarWeeks, rangeFromDays, toDayKey, weeksInMonth } from "./dateRange";
import { DateLabels, Strings } from "./i18n";
import { el, iconButton } from "./dom";

/**
 * In-progress pick, owned by the visual so it survives re-renders triggered by
 * Power BI (resize, data refresh) between the first and second click.
 */
export interface CalendarDraft {
    start: Date | null;
}

export interface CalendarOptions {
    /** First day of the last visible month. */
    anchorMonth: Date;
    /** Number of months shown side by side (1 or 2). */
    months: number;
    weekStart: WeekStart;
    today: Date;
    selected: DateRange | null;
    draft: CalendarDraft;
    labels: DateLabels;
    strings: Strings;
    /** Move the visible months by `delta`; optionally focus a day afterwards. */
    onNavigate(delta: number, focusDay?: Date): void;
    /** A complete range was picked. */
    onPick(range: DateRange): void;
    /** First click of a pick (optional): lets the owner reflect the in-progress pick. */
    onDraftStart?(day: Date): void;
    /** The in-progress pick was cancelled with Escape (optional). */
    onDraftCancel?(): void;
}

interface DayCell {
    date: Date;
    button: HTMLButtonElement;
}

/**
 * Renders one or more months and handles range picking (mouse and keyboard).
 */
export class CalendarView {
    readonly element: HTMLElement;
    private readonly cells: DayCell[] = [];
    private readonly hint: HTMLElement;

    /**
     * @param options Calendar configuration and callbacks.
     */
    constructor(private readonly options: CalendarOptions) {
        this.element = el("div", "drs-cal");
        const monthsRow = el("div", "drs-cal-months");
        const { anchorMonth, months, weekStart } = options;
        const visible = Array.from({ length: months }, (_, i) =>
            new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - (months - 1 - i), 1));

        // One month: always 6 rows (stable height), with the neighbouring months' days
        // filling the gaps instead of leaving empty cells. Two months: neighbouring days
        // would show the same date twice, so cells stay blank and the rows are trimmed to
        // what the longer of the two months needs.
        const showAdjacent = months === 1;
        const rows = showAdjacent ? 6 : Math.max(...visible.map(m => weeksInMonth(m.getFullYear(), m.getMonth(), weekStart)));
        visible.forEach((month, i) => monthsRow.append(this.buildMonth(month, i === 0, i === months - 1, rows, showAdjacent)));

        this.hint = el("div", "drs-cal-hint");
        this.hint.setAttribute("aria-live", "polite");
        this.element.append(monthsRow, this.hint);

        this.element.addEventListener("mouseleave", () => this.paint());
        this.paint();
    }

    /**
     * Moves keyboard focus to a day if it is visible (used after month navigation).
     * @param day Day to focus.
     * @returns Whether the day was found.
     */
    focusDay(day: Date): boolean {
        const cell = this.cells.find(c => c.date.getTime() === day.getTime());
        cell?.button.focus();
        return !!cell;
    }

    private buildMonth(month: Date, isFirst: boolean, isLast: boolean, rows: number, showAdjacent: boolean): HTMLElement {
        const { labels, strings, weekStart } = this.options;
        const container = el("div", "drs-month");

        const head = el("div", "drs-month-head");
        // Navigation arrows sit on the outer edges of the month row, like most range pickers.
        head.append(isFirst
            ? iconButton("left", strings.previousMonth, () => this.options.onNavigate(-1))
            : el("span", "drs-icon-spacer"));
        head.append(el("div", "drs-month-title", labels.monthTitle(month)));
        head.append(isLast
            ? iconButton("right", strings.nextMonth, () => this.options.onNavigate(1))
            : el("span", "drs-icon-spacer"));

        const weeks = calendarWeeks(month.getFullYear(), month.getMonth(), weekStart).slice(0, rows);
        const weekdays = el("div", "drs-weekdays");
        for (const day of weeks[0]) {
            weekdays.append(el("span", "drs-weekday", labels.weekday(day)));
        }

        const grid = el("div", "drs-days");
        grid.setAttribute("role", "grid");
        for (const day of weeks.flat()) {
            const outside = day.getMonth() !== month.getMonth();
            if (outside && !showAdjacent) {
                grid.append(el("span", "drs-day drs-day--blank"));
                continue;
            }
            grid.append(this.buildDay(day, outside));
        }

        container.append(head, weekdays, grid);
        return container;
    }

    private buildDay(date: Date, outside = false): HTMLButtonElement {
        // Days of the neighbouring months are muted but fully usable (click, keyboard).
        const button = el("button", outside ? "drs-day drs-day--outside" : "drs-day");
        button.type = "button";
        button.tabIndex = -1;
        button.dataset.focusKey = `day-${toDayKey(date)}`;
        button.setAttribute("aria-label", this.options.labels.longDay(date));
        button.append(el("span", "drs-day-num", String(date.getDate())));

        button.addEventListener("click", () => this.pick(date));
        button.addEventListener("mouseenter", () => {
            if (this.options.draft.start) {
                this.paint(date);
            }
        });
        button.addEventListener("keydown", (event: KeyboardEvent) => this.onKey(event, date));

        this.cells.push({ date, button });
        return button;
    }

    private pick(date: Date): void {
        const { draft } = this.options;
        if (!draft.start) {
            draft.start = date;
            this.paint(date);
            this.options.onDraftStart?.(date);
            return;
        }
        const range = rangeFromDays(draft.start, date);
        draft.start = null;
        this.options.onPick(range);
    }

    private onKey(event: KeyboardEvent, date: Date): void {
        const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (event.key in steps) {
            event.preventDefault();
            const target = addDays(date, steps[event.key]);
            if (!this.focusDay(target)) {
                const delta = target.getTime() < date.getTime() ? -1 : 1;
                this.options.onNavigate(delta, target);
            } else if (this.options.draft.start) {
                this.paint(target);
            }
        } else if (event.key === "Escape" && this.options.draft.start) {
            event.preventDefault();
            this.options.draft.start = null;
            this.paint();
            this.options.onDraftCancel?.();
        }
    }

    /**
     * Applies range classes. While a pick is in progress the preview runs from the
     * first click to the hovered/focused day; otherwise the applied selection is shown.
     */
    private paint(hover?: Date): void {
        const { draft, selected, today, strings } = this.options;
        const range = draft.start ? rangeFromDays(draft.start, hover ?? draft.start) : selected;
        const startTime = range?.start.getTime();
        const endTime = range?.end.getTime();
        const todayTime = today.getTime();

        // Position of each visible day within the range: the "fill" animation sweeps
        // the band from the start day to the end day in this order.
        let fillIndex = 0;
        for (const { date, button } of this.cells) {
            const time = date.getTime();
            const inRange = range !== null && time >= startTime && time <= endTime;
            button.classList.toggle("drs-day--in-range", inRange);
            button.classList.toggle("drs-day--start", inRange && time === startTime);
            button.classList.toggle("drs-day--end", inRange && time === endTime);
            button.classList.toggle("drs-day--preview", inRange && !!draft.start);
            button.classList.toggle("drs-day--today", time === todayTime);
            button.setAttribute("aria-pressed", String(inRange));
            if (inRange) {
                button.style.setProperty("--drs-fill-i", String(fillIndex++));
            } else {
                button.style.removeProperty("--drs-fill-i");
            }
        }
        // The whole sweep stays under ~300 ms, however many days are visible.
        this.element.style.setProperty("--drs-fill-step", `${Math.min(16, 300 / Math.max(fillIndex, 1)).toFixed(1)}ms`);

        this.hint.textContent = draft.start ? strings.pickEnd : "";
        this.element.classList.toggle("drs-cal--drafting", !!draft.start);
        this.updateTabStop(range);
    }

    /** Roving tabindex: exactly one day is reachable with Tab, arrows move from there. */
    private updateTabStop(range: DateRange | null): void {
        const preferred = [this.options.draft.start, range?.end, range?.start, this.options.today];
        const target = preferred
            .map(day => day && this.cells.find(c => c.date.getTime() === day.getTime()))
            .find(cell => !!cell) ?? this.cells[0];
        for (const cell of this.cells) {
            cell.button.tabIndex = cell === target ? 0 : -1;
        }
    }
}
