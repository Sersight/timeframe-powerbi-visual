"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataView = powerbi.DataView;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import FilterAction = powerbi.FilterAction;
import IViewport = powerbi.IViewport;
import DialogAction = powerbi.DialogAction;
import VisualDialogPositionType = powerbi.VisualDialogPositionType;

import { CalendarDraft, CalendarView } from "./calendarView";
import {
    DateRange,
    FilterTarget,
    PresetId,
    Selection,
    SelectionKind,
    buildAdvancedFilter,
    fromDayKey,
    manualSelection,
    parseAdvancedFilter,
    parsePersistedSelection,
    presetSelection,
    rangeFromDays,
    rangesEqual,
    resolveSelection,
    serializeSelection,
    shiftRange,
    startOfDay,
    toDayKey,
} from "./dateRange";
import { applyCornerRadius, el, icon, iconButton } from "./dom";
import { SERSIGHT_LOGO_DATA_URI, SERSIGHT_URL } from "./brand";
import { DateLabels, DateStyle, PresetGroup, Strings, getStrings } from "./i18n";
import { Motion, MotionKind } from "./motion";
import { RangeDialog, RangeDialogState, parseDialogResult } from "./rangeDialog";
import { VisualFormattingSettingsModel, settingsModelForLocale } from "./settings";

/**
 * How long to trust our own just-applied selection while Power BI round-trips the
 * filter. Power BI may call `update()` in between with the *old* filter; without this
 * grace period the UI would flicker back (or, worse, re-apply the old state).
 */
const PENDING_TIMEOUT_MS = 3000;

/** From this width (in em of the configured text size) the panel shows two months side by side. */
const TWO_MONTHS_MIN_EM = 32;
/** Below this width the picker field shows only the period name, not the dates. */
const PICKER_DATES_MIN_WIDTH = 300;
/** Dialog size for the two-month range calendar (Power BI clamps it to 90% of the window). */
const DIALOG_SIZE = { width: 640, height: 470 };

/** Two clicks on a panel date row within this time count as a double click. */
const DOUBLE_CLICK_MS = 400;

/** Height of one quick-periods menu row and the gap between rows (em); must match visual.less. */
const MENU_ROW_EM = 1.75;
const MENU_GAP_EM = 0.2;
/**
 * Visible height of the drum, in its own em: the current period plus most of the
 * smaller ones before and after. The drum's text shrinks below the dates' size only
 * when the bar is too low for that.
 */
const DRUM_EXTENT_EM = 3.3;
/** Wheel movement (px) that counts as one drum step; a mouse notch is ~100. */
const WHEEL_STEP_PX = 40;
/** Minimum time (ms) between two drum steps, so a fast flick stays controllable. */
const WHEEL_MIN_INTERVAL_MS = 90;

/** How the quick-periods list is grouped (every preset belongs to exactly one group). */
const PRESET_GROUPS: { key: PresetGroup; presets: PresetId[] }[] = [
    { key: "days", presets: ["today", "yesterday", "last7Days", "last30Days"] },
    { key: "months", presets: ["thisMonth", "lastMonth", "last12Months"] },
    { key: "quarters", presets: ["thisQuarter", "lastQuarter"] },
    { key: "years", presets: ["yearToDate", "thisYear", "lastYear"] },
];

/** One entry of the quick-periods menu. */
interface MenuEntry {
    kind: SelectionKind;
    /** Also identifies the entry for focus restoring ("menu-default" for the shortcut). */
    focusKey: string;
    text: string;
}

/** A titled group of menu entries (the title is shown when the whole menu fits). */
interface MenuGroup {
    title: string;
    entries: MenuEntry[];
}

interface PendingSelection {
    selection: Selection;
    since: number;
}

/**
 * Date range slicer: rolling presets plus a custom range, applied as an advanced
 * filter on the bound date column. The layout adapts to the visual's size because a
 * custom visual can't draw popovers outside its own frame.
 */
export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly selectionManager: ISelectionManager;
    // Rebuilt when the author changes the language or date style in the format pane.
    private strings: Strings;
    private labels: DateLabels;
    private locale: string;
    private labelsKey = "";
    /** Style the labels were built with (resolved from "auto" for the current layout). */
    private labelsStyle: DateStyle = "numeric";
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly settingsClass: new () => VisualFormattingSettingsModel;
    private formattingSettings: VisualFormattingSettingsModel;
    private readonly root: HTMLElement;

    private viewport: IViewport = { width: 0, height: 0 };
    private target: FilterTarget | null = null;
    /** Earliest and latest dates in the data: what "all dates" spans in this report. */
    private dataBounds: DateRange | null = null;
    private current: Selection = { kind: "all", range: null };
    private pending: PendingSelection | null = null;
    /** False until the first update with a valid date column; the default preset is only applied then. */
    private initialised = false;
    private lastDefaultSetting: PresetId | null = null;

    // Calendar UI state, kept across re-renders.
    private readonly draft: CalendarDraft = { start: null };
    private calendarAnchor: Date = startOfDay(new Date());
    private anchorKey = "";
    /** Set when the dialog can't be opened (blocked by the user or refused by the host); the picker then falls back to date inputs. */
    private dialogsBlocked = false;
    /** Why the dialog failed, shown to report authors (edit mode) to help diagnose hosts. */
    private dialogError = "";
    private dialogFailure: DialogFailure | null = null;
    private isEditMode = false;
    /** Time of the last click on a panel date row, to detect a double click across re-renders. */
    private lastRowClick = 0;
    /** Animation started by the last user action, carried across re-renders. */
    private readonly motion = new Motion();
    /** The landing page animates only the first time it appears. */
    private landingSeen = false;
    /** Whether the quick-periods menu is showing (in place of the dates or the calendar). */
    private menuOpen = false;
    /** Control to focus after the next render (e.g. ⚡ once the menu closes). */
    private pendingFocus: string | null = null;
    /** Wheel movement not yet turned into a drum step (trackpads send small deltas). */
    private wheelDelta = 0;
    /** When the drum last turned (to space out steps). */
    private lastWheelStep = 0;
    /** Current drum row while the menu is open (-1: start on the active period's row). */
    private drumRow = -1;

    /**
     * @param options Host services and the container element.
     */
    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.locale = this.host.locale;
        this.strings = getStrings(this.locale);
        this.labels = new DateLabels(this.locale, this.strings);
        this.settingsClass = settingsModelForLocale(this.host.locale);

        this.root = options.element;
        this.root.classList.add("drs");
        // Required for certification: the visual must offer the Power BI context menu.
        this.root.addEventListener("contextmenu", (event: MouseEvent) => {
            // An empty selection id gives the "empty space" menu (as in Microsoft's samples).
            this.selectionManager.showContextMenu({} as powerbi.extensibility.ISelectionId, { x: event.clientX, y: event.clientY });
            event.preventDefault();
        });
        // Clicking anywhere else in the report moves focus out of the visual's frame:
        // close the menu then, like any dropdown.
        window.addEventListener("blur", () => {
            if (this.menuOpen) {
                this.menuOpen = false;
                this.render();
            }
        });
    }

    /**
     * Called by Power BI on data, filter, bookmark, format or size changes.
     * @param options Current data views, filters and viewport.
     */
    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView: DataView | undefined = options.dataViews?.[0];
            this.viewport = options.viewport;
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(this.settingsClass, dataView);
            this.applyAppearance();
            this.applyLanguage();
            // "In focus" editing (the expanded visual) is still authoring.
            const mode = options.viewMode;
            this.isEditMode = mode === powerbi.ViewMode.Edit || mode === powerbi.ViewMode.InFocusEdit;

            const column = dataView?.categorical?.categories?.[0];
            if (!column || !column.source.type?.dateTime) {
                // No usable field: forget the previous one so a stale target can't be filtered.
                this.target = null;
                this.dataBounds = null;
                this.menuOpen = false;
                if (column) {
                    this.renderMessage(this.strings.notADate);
                } else {
                    this.renderLanding();
                }
            } else {
                this.target = getFilterTarget(column.source);
                this.dataBounds = dateBounds(column.values);
                this.syncSelection(options, dataView);
                this.render();
            }
            this.events.renderingFinished(options);
        } catch (error) {
            console.error("Timeframe update failed", error);
            this.events.renderingFailed(options, String(error));
        }
    }

    /**
     * Returns the format-pane model (called by Power BI when the pane opens or changes).
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    /**
     * Reconciles the displayed selection with the filter Power BI reports. See
     * `resolveSelection` for the rules; this method adds the session-only parts
     * (pending round trip, first-update default, author changing the default).
     */
    private syncSelection(options: VisualUpdateOptions, dataView: DataView): void {
        const filterRange = parseAdvancedFilter(options.jsonFilters);
        const defaultSetting = this.formattingSettings.periodCard.defaultPresetId;
        // The author changed "Default period" in the format pane (including to "None"):
        // apply it right away so they see the effect.
        const forceDefault = this.initialised && defaultSetting !== this.lastDefaultSetting;
        this.lastDefaultSetting = defaultSetting;

        if (this.pending && !forceDefault) {
            const confirmed = rangesEqual(filterRange, this.pending.selection.range);
            if (confirmed || Date.now() - this.pending.since < PENDING_TIMEOUT_MS) {
                this.current = this.pending.selection;
                if (confirmed) {
                    this.pending = null;
                }
                return;
            }
            // Never confirmed (filter rejected or replaced): fall back to what Power BI says.
            this.pending = null;
        }

        const persisted = parsePersistedSelection(dataView.metadata?.objects?.selectionState?.state);
        const result = resolveSelection({
            filterRange,
            persisted,
            today: this.today(),
            // After the first update the default no longer fills an empty selection,
            // except when the author has just changed it (forceDefault): then it must be
            // the one applied, not "all dates".
            defaultPreset: this.initialised && !forceDefault ? null : defaultSetting,
            forceDefault,
        });
        this.initialised = true;
        this.current = result.selection;
        if (result.apply) {
            this.applySelection(result.selection);
        }
    }

    /**
     * Applies a selection: filter for the report, `filterState` record for bookmarks
     * and rolling presets.
     */
    private applySelection(selection: Selection): void {
        if (!this.target) {
            return;
        }
        this.pending = { selection, since: Date.now() };
        this.current = selection;
        this.draft.start = null;

        if (selection.range) {
            this.host.applyJsonFilter(buildAdvancedFilter(this.target, selection.range) as powerbi.IFilter, "general", "filter", FilterAction.merge);
        } else {
            this.host.applyJsonFilter(null, "general", "filter", FilterAction.remove);
        }
        this.host.persistProperties({
            merge: [{ objectName: "selectionState", selector: null, properties: { state: serializeSelection(selection) } }],
        });
        this.render();
    }

    /**
     * User-initiated selection; ignored where Power BI disables interaction (e.g. dashboard tiles).
     * @param selection New selection.
     * @param dir Direction of a ‹ › step (-1/1), so the new dates slide in from that side.
     */
    private select(selection: Selection, dir = 0): void {
        if (this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }
        // Only user actions animate: the changed dates slide in and, when the range
        // itself changed, the calendar band sweeps from start to end.
        const kinds: MotionKind[] = ["dates"];
        if (!rangesEqual(selection.range, this.current.range)) {
            kinds.push("fill");
        }
        // The ⚡ is full while the default period is active: it fills up when the user
        // comes back to the default and drains when they leave it.
        const defaultKind = this.defaultKind();
        const wasDefault = this.current.kind === defaultKind;
        const isDefault = selection.kind === defaultKind;
        if (wasDefault !== isDefault) {
            kinds.push(isDefault ? "bolt-fill" : "bolt-empty");
        }
        this.motion.start(kinds, { dir, previous: this.current.range ?? this.dataBounds });
        // Any choice (menu, arrows, shortcuts) closes the quick-periods menu.
        this.menuOpen = false;
        this.applySelection(selection);
    }

    private selectKind(kind: SelectionKind): void {
        this.select(kind === "all" ? { kind: "all", range: null } : presetSelection(kind as PresetId, this.today()));
    }

    /**
     * Explicit date picks are fixed ranges ("custom"); only presets roll with time.
     * Landing exactly on the default period (e.g. › then ‹) counts as the default again.
     */
    private selectRange(range: DateRange, dir = 0): void {
        this.select(manualSelection(range, this.formattingSettings.periodCard.defaultPresetId, this.today()), dir);
    }

    private shift(direction: -1 | 1): void {
        if (this.current.range) {
            this.selectRange(shiftRange(this.current.range, direction), direction);
        }
    }

    private today(): Date {
        return startOfDay(new Date());
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    private render(): void {
        // The DOM is rebuilt on each render (simple and cheap at this size); remember
        // which control had focus so keyboard users don't lose their place.
        const active = document.activeElement as HTMLElement | null;
        const focusKey = this.pendingFocus ?? (active && this.root.contains(active) ? active.dataset.focusKey : undefined);
        this.pendingFocus = null;

        this.syncCalendarAnchor();
        this.applyDateStyle();
        this.motion.apply(this.root);
        const picker = this.formattingSettings.layoutCard.modeValue === "picker";
        // An open menu takes the place of the dates in the bar (picker) or of the
        // calendar (panel); ⚡ stays where it is, to close it again.
        const content = !picker ? this.renderPanel() : this.menuOpen ? this.renderMenuBar() : this.renderPicker();
        this.root.replaceChildren(content);
        if (this.menuOpen) {
            this.fitMenu();
        }

        if (focusKey) {
            const target = this.root.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)
                // Opening on a custom range: no period is active, start on the first one.
                ?? (focusKey.startsWith("menu-") ? this.root.querySelector<HTMLElement>(".drs-menu-item") : null);
            // preventScroll: fitMenu already scrolled the active period into view.
            target?.focus({ preventScroll: true });
        }
    }

    /** Picker layout with the menu open: ⚡ (to close it) followed by the menu. */
    private renderMenuBar(): HTMLElement {
        const bar = el("div", "drs-picker drs-picker--menu");
        bar.append(this.renderQuickPeriods(), this.renderMenu());
        return bar;
    }

    /**
     * Picker layouts. Default ("stacked"):
     *   ┌───┬───────────────────┬───┐
     *   │   │ ●━  25/07/2026  📅 │ ‹ │
     *   │ ⚡ │ ━●  29/08/2026  📅 │ › │
     *   └───┴───────────────────┴───┘
     * Alternative ("dialog"): ‹ [📅 period · dates ▾] [⚡] › opening a Power BI dialog.
     * Picking dates or a quick period replaces the other: there is only one selection.
     */
    private renderPicker(): HTMLElement {
        const showArrows = this.formattingSettings.layoutCard.showArrows.value;
        if (this.formattingSettings.layoutCard.calendarValue === "stacked") {
            return this.renderStackedPicker(showArrows);
        }

        const bar = el("div", "drs-picker");
        if (showArrows) {
            bar.append(this.stepButton(-1));
        }

        // Dialogs aren't available in embedded reports, publish-to-web or dashboards, or
        // when the user blocked them; plain date inputs keep the slicer usable there.
        const dialogsAvailable = this.host.hostCapabilities?.allowModalDialog !== false && !this.dialogsBlocked;
        bar.append(dialogsAvailable ? this.renderRangeField() : this.renderDateFields());
        // "Blocked by user" is actionable for anyone (reopen the report); other causes are
        // technical, so only authors see them.
        const blocked = this.dialogFailure === DialogFailure.BlockedByUser;
        if (!dialogsAvailable && this.dialogError && (blocked || this.isEditMode)) {
            const warning = el("span", "drs-dialog-warning", "!");
            warning.title = this.dialogFailureMessage();
            warning.setAttribute("role", "img");
            warning.setAttribute("aria-label", warning.title);
            bar.append(warning);
        }
        bar.append(this.renderQuickPeriods());
        if (showArrows) {
            bar.append(this.stepButton(1));
        }
        return bar;
    }

    /**
     * Compact picker with fixed size: quick periods on the left (both rows), start/end
     * rows in the middle, ‹ above › on the right. The size never changes with the
     * selection, so the report layout stays predictable.
     * @param showArrows Whether to render the previous/next buttons.
     * @param inPanel Panel mode: the rows reflect the pick in progress and have no
     * native picker of their own, since the calendar is right below.
     */
    private renderStackedPicker(showArrows: boolean, inPanel = false): HTMLElement {
        const bar = el("div", `drs-picker drs-picker--stacked${inPanel ? " drs-picker--panel" : ""}`);
        bar.append(this.renderQuickPeriods());

        const range = this.current.range;
        const draft = inPanel ? this.draft.start : null;
        // With no filter ("all dates") the rows show the data's first and last date,
        // muted, instead of an unhelpful dash. While a pick is in progress they show the
        // chosen start and, in place of the end, the instruction.
        const shown = draft ? { start: draft, end: draft } : range ?? this.dataBounds;
        const implicit = !range && !draft;
        const stack = el("div", `drs-stack${draft ? " drs-stack--picking" : ""}`);
        // The period name (e.g. "This month") is in the tooltip, not in the layout,
        // so nothing appears or disappears when switching between presets and dates.
        const title = this.labels.title(this.current);
        const dates = this.labels.dates(range);
        stack.title = dates && dates !== title ? `${title} · ${dates}` : title;
        if (inPanel) {
            stack.title += `\n${this.strings.resetDoubleClick}`;
        }
        const rowOptions = { implicit, picker: !inPanel };
        const endDay = draft ? null : shown?.end ?? null;
        stack.append(
            this.renderDateRow("start", this.strings.from, shown?.start ?? null,
                { ...rowOptions, changed: this.dateChanged("start", shown?.start ?? null) }),
            this.renderDateRow("end", this.strings.to, endDay,
                { ...rowOptions, hint: draft ? this.strings.pickEnd : undefined, changed: this.dateChanged("end", endDay) }),
        );
        bar.append(stack);

        if (showArrows) {
            const side = el("div", "drs-side");
            side.append(this.stepButton(-1), this.stepButton(1));
            bar.append(side);
        }
        return bar;
    }

    /**
     * One "From" or "To" row. The date text is ours (so it follows the visual's language
     * and date style). With `picker`, a transparent `<input type="date">` covers the row,
     * with its picker indicator stretched over it, so a click anywhere opens the
     * browser's calendar right under this row; that calendar is drawn by the browser and
     * can extend beyond the visual's small frame (`showPicker()` would be simpler but is
     * blocked in Power BI's cross-origin iframe). Without `picker` (panel mode) the row
     * is a button that scrolls the visible calendar to its month.
     */
    private renderDateRow(
        which: "start" | "end",
        label: string,
        day: Date | null,
        { implicit = false, picker = true, hint, changed = false }: { implicit?: boolean; picker?: boolean; hint?: string; changed?: boolean } = {},
    ): HTMLElement {
        const row = el(picker ? "div" : "button", `drs-stack-row drs-stack-row--${which}${picker ? "" : " drs-stack-row--static"}`);
        row.title = label;
        const dateClass = `drs-stack-date${implicit ? " drs-stack-date--implicit" : ""}${hint ? " drs-stack-date--hint" : ""}`
            + (changed ? " drs-stack-date--changed" : "");
        row.append(
            // ●━ / ━● instead of translated "From"/"To": the slicer reads the same in any language.
            icon(which === "start" ? "rangeStart" : "rangeEnd"),
            el("span", dateClass, hint ?? (day ? this.labels.dates({ start: day, end: day }) : "—")),
        );

        if (!picker) {
            const button = row as HTMLButtonElement;
            button.type = "button";
            button.dataset.focusKey = `row-${which}`;
            button.setAttribute("aria-label", day ? `${label}: ${this.labels.longDay(day)}` : label);
            button.addEventListener("click", () => {
                // Double click = back to the default period. Detected by hand because the
                // first click re-renders the bar, which can stop the browser's dblclick.
                const now = Date.now();
                if (now - this.lastRowClick < DOUBLE_CLICK_MS) {
                    this.lastRowClick = 0;
                    this.selectKind(this.defaultKind());
                    return;
                }
                this.lastRowClick = now;
                if (day) {
                    this.showMonth(day, which);
                }
            });
            return row;
        }

        row.append(icon("calendar"));
        const input = el("input", "drs-native-input");
        input.type = "date";
        input.dataset.focusKey = `date-${which}`;
        input.setAttribute("aria-label", day ? `${label}: ${this.labels.longDay(day)}` : label);
        // The picker opens on the month of its value.
        input.value = toDayKey(day ?? this.today());
        input.addEventListener("change", () => {
            const picked = fromDayKey(input.value);
            // Typing a year produces intermediate values such as 0202; ignore those.
            if (picked && isPlausible(picked)) {
                this.changeRangeEnd(which, picked);
            }
        });
        row.append(input);
        return row;
    }

    /**
     * Whether a date row should play the "changed" animation: a user action is being
     * animated and this end of the range differs from what was shown before it.
     * @param which Start or end row.
     * @param day Date the row now shows (`null` for a dash or a hint).
     */
    private dateChanged(which: "start" | "end", day: Date | null): boolean {
        if (!day || !this.motion.has("dates")) {
            return false;
        }
        const before = this.motion.previous?.[which];
        return !before || before.getTime() !== day.getTime();
    }

    /**
     * Applies a new start or end date. The other end is kept unless the range would be
     * inverted, in which case it moves to the same day: the fields never swap places
     * behind the user's back.
     */
    private changeRangeEnd(which: "start" | "end", day: Date): void {
        // Under "all dates" the other end is the data's own bound, as displayed.
        const range = this.current.range ?? this.dataBounds;
        let start = which === "start" ? day : range?.start ?? day;
        let end = which === "end" ? day : range?.end ?? day;
        if (start.getTime() > end.getTime()) {
            if (which === "start") {
                end = start;
            } else {
                start = end;
            }
        }
        this.selectRange({ start, end });
    }

    /** Explains why the pop-up calendar isn't available, with what to do about it. */
    private dialogFailureMessage(): string {
        switch (this.dialogFailure) {
            case DialogFailure.BlockedByUser: return this.strings.dialogBlocked;
            case DialogFailure.NotAllowed: return this.strings.dialogNotAllowed;
            case DialogFailure.AlreadyOpen: return this.strings.dialogAlreadyOpen;
            default: return `${this.strings.dialogUnavailable}: ${this.dialogError}`;
        }
    }

    private renderRangeField(): HTMLButtonElement {
        const field = el("button", "drs-range-field");
        field.type = "button";
        field.dataset.focusKey = "range-field";
        field.setAttribute("aria-haspopup", "dialog");

        const title = this.labels.title(this.current);
        const dates = this.labels.dates(this.current.range);
        field.title = dates && dates !== title ? `${title} · ${dates}` : title;
        field.setAttribute("aria-label", `${this.strings.dialogTitle}: ${field.title}`);

        const text = el("span", "drs-range-text");
        text.append(el("span", "drs-range-title", title));
        if (dates && dates !== title && this.viewport.width >= PICKER_DATES_MIN_WIDTH) {
            text.append(el("span", "drs-range-dates", dates));
        }
        field.append(icon("calendar"), text, icon("down"));
        field.addEventListener("click", () => this.openRangeDialog());
        return field;
    }

    /**
     * Quick-periods button (⚡): opens and closes the periods menu drawn inside the
     * visual (see {@link renderMenu}). Ctrl/⌘ + click goes straight back to the default.
     */
    private renderQuickPeriods(): HTMLElement {
        const isPreset = this.current.kind !== "custom";
        // Accent border and full bolt = the report is showing its default period
        // (format pane), so readers can tell at a glance whether they changed it.
        const defaultKind = this.defaultKind();
        const isDefault = this.current.kind === defaultKind;
        const button = el("button", "drs-quick"
            + (isPreset ? " drs-quick--active" : "")
            + (isDefault ? " drs-quick--default" : "")
            + (this.menuOpen ? " drs-quick--open" : ""));
        button.type = "button";
        button.dataset.focusKey = "quick-periods";
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", String(this.menuOpen));
        button.title = isPreset ? `${this.strings.quickPeriods}: ${this.kindLabel(this.current.kind)}` : this.strings.quickPeriods;
        button.title += `\n${this.strings.resetCtrlClick}`;
        // Authors only: the report opens with whatever is saved, so warn before they save
        // a period other than the default by accident (readers don't need this).
        if (this.isEditMode && !isDefault) {
            button.title += `\n\n${this.saveWarning(defaultKind)}`;
        }
        button.setAttribute("aria-label", button.title);
        button.addEventListener("click", (event: MouseEvent) => {
            if (event.ctrlKey || event.metaKey) {
                this.selectKind(defaultKind);
            } else {
                this.toggleMenu();
            }
        });

        // Outline bolt plus a solid copy on top of it; the stylesheet clips the solid
        // copy from the bottom, so it can show the bolt "filling up" or "draining".
        const solid = icon("quick");
        solid.classList.add("drs-quick-solid");
        button.append(icon("quick"), solid);
        return button;
    }

    /**
     * Opens or closes the quick-periods menu and moves focus accordingly (to the active
     * period when opening, back to ⚡ when closing).
     */
    private toggleMenu(): void {
        if (this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }
        this.menuOpen = !this.menuOpen;
        if (this.menuOpen) {
            this.motion.start(["menu"]);
            this.drumRow = -1;
            this.pendingFocus = `menu-${this.current.kind}`;
        } else {
            this.pendingFocus = "quick-periods";
        }
        this.render();
    }

    /**
     * The quick-periods menu's content, grouped as in the layouts below. The first group
     * is the shortcut back to the default; "all dates" comes last, on its own.
     */
    private menuGroups(): MenuGroup[] {
        const defaultKind = this.defaultKind();
        const groups: MenuGroup[] = [{
            title: this.strings.defaultPeriod,
            entries: [{ kind: defaultKind, focusKey: "menu-default", text: `↺ ${this.kindLabel(defaultKind)}` }],
        }];
        const available = this.selectableKinds();
        for (const { key, presets } of PRESET_GROUPS) {
            const kinds = presets.filter(kind => available.includes(kind));
            if (kinds.length > 0) {
                groups.push({
                    title: this.strings.presetGroups[key],
                    entries: kinds.map(kind => ({ kind, focusKey: `menu-${kind}`, text: this.kindLabel(kind) })),
                });
            }
        }
        if (available.includes("all")) {
            groups.push({ title: "", entries: [{ kind: "all", focusKey: "menu-all", text: this.kindLabel("all") }] });
        }
        return groups;
    }

    /**
     * Quick-periods menu, drawn by the visual itself so it uses the visual's font,
     * colours and corners (a native list ignores the font in Power BI Desktop). It must
     * fit inside the visual's frame, so its content depends on the space and is added
     * by {@link fitMenu} once the menu is in the DOM and can be measured.
     */
    private renderMenu(): HTMLElement {
        const menu = el("div", "drs-menu");
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", this.strings.quickPeriods);
        menu.addEventListener("keydown", (event: KeyboardEvent) => this.onMenuKey(event, menu));
        menu.addEventListener("wheel", (event: WheelEvent) => this.onMenuWheel(event, menu), { passive: false });
        return menu;
    }

    /**
     * Lays the menu out for the space actually available:
     * - tall enough for the longest group (panel, tall bar): every group at once, with
     *   its title, wrapping onto lines (and scrolling down if needed);
     * - shorter (a typical bar): a drum that turns one period at a time (see
     *   {@link buildDrum}).
     */
    private fitMenu(): void {
        const menu = this.root.querySelector<HTMLElement>(".drs-menu");
        if (!menu) {
            return;
        }
        const em = parseFloat(getComputedStyle(menu).fontSize) || 13;
        const groups = this.menuGroups();
        // Rows of the longest group, title included.
        const tallest = Math.max(...groups.map(group => group.entries.length + 1));
        const needed = (tallest * MENU_ROW_EM + (tallest - 1) * MENU_GAP_EM) * em;
        let order = 0;
        const next = () => order++;

        if (needed <= menu.clientHeight + 1) {
            menu.classList.add("drs-menu--wrap");
            menu.style.setProperty("--drs-menu-rows", String(tallest));
            for (const group of groups) {
                const box = el("div", "drs-menu-group");
                box.setAttribute("role", "group");
                const heading = el("div", "drs-menu-title", group.title);
                heading.style.setProperty("--drs-i", String(next()));
                box.append(heading, ...group.entries.map(entry => this.menuItem(entry, next())));
                menu.append(box);
            }
            menu.querySelector<HTMLElement>(".drs-menu-item--active")?.scrollIntoView({ block: "nearest" });
        } else {
            menu.classList.add("drs-menu--drum");
            menu.append(this.buildDrum(groups, next, menu.clientHeight));
        }
    }

    /**
     * The drum: one period per row, stacked like the faces of a cylinder. Only the
     * current row is full size; the rows just before and after peek out smaller and
     * squashed, so the reader sees there is more that way (and nothing past the first or
     * last period). One wheel notch, ↑/↓, or a click on a peeking row turns it by one.
     * Group titles are left out: next to a single period they only repeat the obvious.
     * @param groups Menu content.
     * @param next Hands out the entry order for the opening animation.
     * @param height Height available (px), to size the text so the peeking rows show.
     * @returns The drum element (already turned to its starting row).
     */
    private buildDrum(groups: MenuGroup[], next: () => number, height: number): HTMLElement {
        const drum = el("div", "drs-drum");
        // As large as the dates, unless the bar is too low to show the rows around.
        const datesPx = parseFloat(getComputedStyle(this.root).fontSize) || 13;
        drum.style.fontSize = `${Math.min(datesPx, height / DRUM_EXTENT_EM)}px`;

        let activeRow = -1;
        groups.flatMap(group => group.entries).forEach((entry, index) => {
            const row = el("div", "drs-drum-row");
            row.dataset.row = String(index);
            const item = this.menuItem(entry, next());
            if (item.classList.contains("drs-menu-item--active")) {
                activeRow = index;
            }
            row.append(item);
            // A click on a peeking row (not on the current one) turns the drum to it.
            row.addEventListener("click", () => this.setDrumRow(drum, index));
            drum.append(row);
        });

        // Opens on the active period's row; keeps its position across re-renders.
        this.setDrumRow(drum, this.drumRow >= 0 ? this.drumRow : Math.max(0, activeRow));
        return drum;
    }

    /**
     * Turns the drum so that `index` is the current row: each row gets its position
     * (current, just before/after, hidden before/after) and the stylesheet animates the
     * move. Only the current row can be tabbed into.
     * @param drum The drum element.
     * @param index Wanted row (clamped to the existing rows).
     */
    private setDrumRow(drum: HTMLElement, index: number): void {
        const rows = Array.from(drum.children) as HTMLElement[];
        const current = Math.min(rows.length - 1, Math.max(0, index));
        this.drumRow = current;
        rows.forEach((row, i) => {
            const offset = i - current;
            row.classList.toggle("drs-drum-row--current", offset === 0);
            row.classList.toggle("drs-drum-row--prev", offset === -1);
            row.classList.toggle("drs-drum-row--next", offset === 1);
            row.classList.toggle("drs-drum-row--before", offset < -1);
            row.classList.toggle("drs-drum-row--after", offset > 1);
            row.setAttribute("aria-hidden", String(offset !== 0));
            row.querySelectorAll<HTMLElement>(".drs-menu-item").forEach(item => {
                item.tabIndex = offset === 0 ? 0 : -1;
            });
        });
    }

    /**
     * One menu entry. Picking it applies the period, except on a peeking drum row,
     * where the click only turns the drum (handled by the row).
     * @param entry Period and label.
     * @param order Position, for the staggered opening animation.
     */
    private menuItem(entry: MenuEntry, order: number): HTMLButtonElement {
        const active = entry.focusKey === `menu-${this.current.kind}`;
        const button = el("button", "drs-menu-item"
            + (active ? " drs-menu-item--active" : "")
            // Same language as ⚡: an accent outline marks the default period.
            + (entry.kind === this.defaultKind() ? " drs-menu-item--default" : ""), entry.text);
        button.type = "button";
        button.dataset.focusKey = entry.focusKey;
        button.setAttribute("role", "menuitemradio");
        button.setAttribute("aria-checked", String(active));
        button.style.setProperty("--drs-i", String(order));
        button.addEventListener("click", (event: MouseEvent) => {
            const row = button.closest(".drs-drum-row");
            if (row && !row.classList.contains("drs-drum-row--current")) {
                return;
            }
            event.stopPropagation();
            this.pendingFocus = "quick-periods";
            this.selectKind(entry.kind);
        });
        return button;
    }

    /**
     * Drum: one wheel notch turns it by one row (one period). Trackpads send many
     * small deltas: they add up to a notch, and steps are spaced out so a flick doesn't
     * spin past everything.
     */
    private onMenuWheel(event: WheelEvent, menu: HTMLElement): void {
        const drum = menu.querySelector<HTMLElement>(".drs-drum");
        if (!drum) {
            // Full menu: the browser's own vertical scrolling applies.
            return;
        }
        event.preventDefault();
        this.wheelDelta += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (Math.abs(this.wheelDelta) < WHEEL_STEP_PX) {
            return;
        }
        const direction = Math.sign(this.wheelDelta);
        this.wheelDelta = 0;
        const now = Date.now();
        if (now - this.lastWheelStep < WHEEL_MIN_INTERVAL_MS) {
            return;
        }
        this.lastWheelStep = now;
        this.setDrumRow(drum, this.drumRow + direction);
        // Keyboard focus follows the drum, so it never sits on a hidden row.
        if (menu.contains(document.activeElement)) {
            drum.querySelector<HTMLElement>(".drs-drum-row--current .drs-menu-item")?.focus({ preventScroll: true });
        }
    }

    /**
     * Keyboard: arrows move to the previous/next period (turning the drum with them),
     * Home/End jump to the first/last, Escape closes the menu.
     */
    private onMenuKey(event: KeyboardEvent, menu: HTMLElement): void {
        if (event.key === "Escape") {
            event.preventDefault();
            this.toggleMenu();
            return;
        }
        const items = Array.from(menu.querySelectorAll<HTMLElement>(".drs-menu-item"));
        const index = items.indexOf(document.activeElement as HTMLElement);
        const moves: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        let target: HTMLElement | undefined;
        if (event.key in moves) {
            target = items[(index + moves[event.key] + items.length) % items.length];
        } else if (event.key === "Home") {
            target = items[0];
        } else if (event.key === "End") {
            target = items[items.length - 1];
        }
        if (target) {
            event.preventDefault();
            const drum = menu.querySelector<HTMLElement>(".drs-drum");
            const row = target.closest<HTMLElement>(".drs-drum-row");
            if (drum && row) {
                this.setDrumRow(drum, Number(row.dataset.row));
            }
            target.focus({ preventScroll: true });
        }
    }

    /**
     * "If you save now, the report opens with … The default period is …"
     * @param defaultKind The format-pane default ("all" when none is set).
     */
    private saveWarning(defaultKind: SelectionKind): string {
        const dates = this.labels.dates(this.current.range);
        const title = this.labels.title(this.current);
        const current = dates && dates !== title ? `${title} (${dates})` : title;
        return this.strings.saveWarning
            .replace("{current}", current)
            .replace("{default}", this.kindLabel(defaultKind));
    }

    private openRangeDialog(): void {
        if (this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }
        const appearance = this.formattingSettings.appearanceCard;
        const accent = appearance.accentColor.value.value;
        const state: RangeDialogState = {
            start: this.current.range ? toDayKey(this.current.range.start) : null,
            end: this.current.range ? toDayKey(this.current.range.end) : null,
            locale: this.locale,
            dateStyle: this.labelsStyle,
            weekStart: this.formattingSettings.periodCard.weekStartFor(this.locale),
            months: 2,
            accent,
            onAccent: readableTextOn(accent),
            fontFamily: appearance.fontFamily.value,
            cornerRadius: appearance.cornerRadius.value,
        };
        this.host.openModalDialog(RangeDialog.id, {
            title: this.strings.dialogTitle,
            size: DIALOG_SIZE,
            // Just below the slicer, like a dropdown (Power BI clamps it to stay on screen).
            position: { type: VisualDialogPositionType.RelativeToVisual, left: 0, top: Math.round(this.viewport.height) + 4 },
            actionButtons: [DialogAction.OK, DialogAction.Cancel],
        }, state)
            .then(result => {
                // X and Cancel both discard; only OK applies.
                const range = result.actionId === DialogAction.OK ? parseDialogResult(result.resultState) : null;
                if (range && !rangesEqual(range, this.current.range)) {
                    this.selectRange(range);
                }
            })
            .catch(error => {
                // Refused by the host (e.g. the user ticked "don't show dialogs from this
                // visual"): switch to inline inputs so the slicer stays usable.
                this.dialogFailure = dialogFailureCode(error);
                this.dialogError = describeError(error);
                console.warn("Timeframe: range dialog unavailable", error);
                this.dialogsBlocked = true;
                this.render();
            });
    }

    /**
     * Panel mode: the same bar as the picker on top and the calendar always visible
     * below it (one month, or two side by side when there is room). The ⚡ list holds
     * the quick periods, so no separate preset list is needed and the footprint stays
     * small and predictable.
     */
    private renderPanel(): HTMLElement {
        const panel = el("div", `drs-panel${this.menuOpen ? " drs-panel--menu" : ""}`);
        panel.append(this.renderStackedPicker(this.formattingSettings.layoutCard.showArrows.value, true));
        if (this.menuOpen) {
            // The menu fills the calendar's box, so the panel keeps its look.
            const box = el("div", "drs-panel-cal drs-panel-menu");
            box.append(this.renderMenu());
            panel.append(box);
            return panel;
        }

        const calendar = new CalendarView({
            anchorMonth: this.calendarAnchor,
            months: this.panelMonths(),
            weekStart: this.formattingSettings.periodCard.weekStartFor(this.locale),
            today: this.today(),
            selected: this.current.range,
            draft: this.draft,
            labels: this.labels,
            strings: this.strings,
            onNavigate: (delta, focusDay) => this.navigateCalendar(delta, focusDay),
            // Re-render so the bar's rows reflect the pick in progress.
            onDraftStart: () => this.render(),
            onDraftCancel: () => this.render(),
            onPick: range => this.selectRange(range),
        });
        const box = el("div", "drs-panel-cal");
        box.append(calendar.element);
        panel.append(box);
        return panel;
    }

    /** Months shown by the panel calendar: two when the visual is wide enough at the current text size. */
    private panelMonths(): 1 | 2 {
        const emPx = this.formattingSettings.appearanceCard.fontSize.value * 96 / 72;
        return this.viewport.width >= TWO_MONTHS_MIN_EM * emPx ? 2 : 1;
    }

    /**
     * Scrolls the panel calendar to the month of a date (clicking a start/end row).
     * With two months, the start goes on the left and the end on the right.
     */
    private showMonth(day: Date, which: "start" | "end"): void {
        const offset = this.panelMonths() === 2 && which === "start" ? 1 : 0;
        const anchor = new Date(day.getFullYear(), day.getMonth() + offset, 1);
        // The calendar is what the reader wants to see: close the menu covering it.
        this.menuOpen = false;
        // Slide towards the month being shown (nothing to animate if it is already there).
        const delta = Math.sign(anchor.getTime() - this.calendarAnchor.getTime());
        if (delta !== 0) {
            this.motion.start(["month"], { dir: delta });
        }
        this.calendarAnchor = anchor;
        this.render();
    }

    private renderDateFields(): HTMLElement {
        const fields = el("div", "drs-fields");
        const range = this.current.range;
        const from = this.dateInput("from", this.strings.from, range?.start);
        const to = this.dateInput("to", this.strings.to, range?.end);

        const onChange = () => {
            const start = fromDayKey(from.value);
            const end = fromDayKey(to.value);
            // While typing a year Chromium reports intermediate values such as 0202;
            // only accept plausible years so we don't filter on them.
            if (start && end && isPlausible(start) && isPlausible(end)) {
                this.selectRange(rangeFromDays(start, end));
            }
        };
        from.addEventListener("change", onChange);
        to.addEventListener("change", onChange);

        fields.append(from, el("span", "drs-fields-sep", "–"), to);
        return fields;
    }

    private dateInput(key: string, label: string, value: Date | undefined): HTMLInputElement {
        const input = el("input", "drs-date");
        input.type = "date";
        input.dataset.focusKey = `field-${key}`;
        input.setAttribute("aria-label", label);
        input.value = value ? toDayKey(value) : "";
        return input;
    }

    private stepButton(direction: -1 | 1): HTMLButtonElement {
        const label = direction < 0 ? this.strings.previousPeriod : this.strings.nextPeriod;
        const button = iconButton(direction < 0 ? "left" : "right", label, () => this.shift(direction));
        button.dataset.focusKey = `step-${direction}`;
        button.disabled = !this.current.range;
        return button;
    }

    /**
     * Kinds offered to the user: the author's visible presets, "all" if enabled, and
     * always the current selection (even if hidden) so the control never lies.
     */
    private selectableKinds(): SelectionKind[] {
        const presetsCard = this.formattingSettings.presetsCard;
        const kinds: SelectionKind[] = [...presetsCard.visiblePresets];
        if (presetsCard.showAll.value) {
            kinds.push("all");
        }
        if (!kinds.includes(this.current.kind)) {
            kinds.unshift(this.current.kind);
        }
        return kinds;
    }

    /** The format-pane default period ("all" when it is set to none). */
    private defaultKind(): SelectionKind {
        return this.formattingSettings.periodCard.defaultPresetId ?? "all";
    }

    private kindLabel(kind: SelectionKind): string {
        if (kind === "all") {
            return this.strings.all;
        }
        return kind === "custom" ? this.strings.custom : this.strings.presets[kind];
    }

    /** Re-centres the calendar on the selection whenever the selection itself changes. */
    private syncCalendarAnchor(): void {
        const range = this.current.range;
        const key = range ? `${toDayKey(range.start)}/${toDayKey(range.end)}` : "all";
        if (key !== this.anchorKey) {
            this.anchorKey = key;
            const end = range?.end ?? this.today();
            this.calendarAnchor = new Date(end.getFullYear(), end.getMonth(), 1);
        }
    }

    private navigateCalendar(delta: number, focusDay?: Date): void {
        this.calendarAnchor = new Date(this.calendarAnchor.getFullYear(), this.calendarAnchor.getMonth() + delta, 1);
        this.motion.start(["month"], { dir: delta });
        this.render();
        if (focusDay) {
            this.root.querySelector<HTMLElement>(`[data-focus-key="day-${toDayKey(focusDay)}"]`)?.focus();
        }
    }

    private renderLanding(): void {
        // Shown until a date column is added: introduces the product (name, author,
        // features) and says how to start. Trimmed down when the visual is small.
        const { width, height } = this.viewport;
        const size = height < 120 || width < 260 ? "mini" : height < 340 || width < 440 ? "compact" : "full";
        const s = this.strings;
        const landing = el("div", `drs-landing drs-landing--${size}`);

        // The page builds up once, the first time it appears, and only while editing:
        // that is when an author has just added the visual. Reading view and exports
        // show it static.
        if (!this.landingSeen) {
            this.landingSeen = true;
            if (this.isEditMode) {
                this.motion.start(["landing"]);
            }
        }
        this.motion.apply(this.root);
        // Entry order of each block, read by the stylesheet to stagger the animation.
        let order = 0;
        const staggered = <T extends HTMLElement>(element: T): T => {
            element.style.setProperty("--drs-i", String(order++));
            return element;
        };

        const brand = el("div", "drs-landing-brand");
        const logo = staggered(el("img", "drs-landing-logo"));
        logo.src = SERSIGHT_LOGO_DATA_URI;
        logo.alt = "Sersight";
        const names = staggered(el("div", "drs-landing-names"));
        names.append(el("div", "drs-landing-title", s.landingTitle), el("div", "drs-landing-by", s.landingBy));
        brand.append(logo, names);
        landing.append(brand);

        if (size !== "mini") {
            landing.append(staggered(el("p", "drs-landing-tagline", s.landingTagline)));
        }
        if (size === "full") {
            const features = el("ul", "drs-landing-features");
            for (const feature of s.landingFeatures) {
                const item = staggered(el("li", "drs-landing-feature"));
                item.append(icon("check"), el("span", "", feature));
                features.append(item);
            }
            landing.append(features);
        }
        landing.append(staggered(el("div", "drs-landing-start", s.landingText)));
        if (size !== "mini") {
            // Links must go through launchUrl: visuals can't navigate on their own.
            const link = staggered(el("button", "drs-landing-link", s.landingLink));
            link.type = "button";
            link.addEventListener("click", () => this.host.launchUrl(SERSIGHT_URL));
            landing.append(link);
        }
        this.root.replaceChildren(landing);
    }

    private renderMessage(text: string): void {
        this.root.replaceChildren(el("div", "drs-message", text));
    }

    /**
     * Rebuilds strings and date labels when the author picks another language or
     * date style (Power BI only tells the visual its UI language, not the model's).
     */
    private applyLanguage(): void {
        const period = this.formattingSettings.periodCard;
        const locale = period.effectiveLocale(this.host.locale);
        if (locale !== this.locale || !this.labelsKey) {
            this.locale = locale;
            this.strings = getStrings(locale);
        }
        this.applyDateStyle();
    }

    /**
     * Resolves the date style for the current layout and rebuilds the labels if it
     * changed. "Auto" writes dates in full when two calendar months are visible (there
     * is room) and numerically everywhere else (compact and predictable).
     */
    private applyDateStyle(): void {
        const setting = this.formattingSettings.periodCard.dateStyleValue;
        const panel = this.formattingSettings.layoutCard.modeValue === "panel";
        const style: DateStyle = setting !== "auto" ? setting : panel && this.panelMonths() === 2 ? "long" : "numeric";
        const key = `${this.locale}|${style}`;
        if (key !== this.labelsKey) {
            this.labelsKey = key;
            this.labelsStyle = style;
            this.labels = new DateLabels(this.locale, this.strings, style);
        }
    }

    /**
     * Pushes format settings into CSS variables. In high-contrast mode Power BI's
     * palette replaces every colour, as required for certification.
     */
    private applyAppearance(): void {
        const appearance = this.formattingSettings.appearanceCard;
        const palette = this.host.colorPalette;
        const style = this.root.style;
        const highContrast = !!palette?.isHighContrast;

        if (highContrast) {
            style.setProperty("--drs-accent", palette.foregroundSelected.value);
            style.setProperty("--drs-on-accent", palette.background.value);
            style.setProperty("--drs-text", palette.foreground.value);
            style.setProperty("--drs-muted", palette.foreground.value);
            style.setProperty("--drs-border", palette.foreground.value);
            style.setProperty("--drs-surface", palette.background.value);
            style.setProperty("--drs-hover", palette.background.value);
            style.colorScheme = isLightColor(palette.foreground.value) ? "dark" : "light";
        } else {
            const accent = appearance.accentColor.value.value;
            style.setProperty("--drs-accent", accent);
            style.setProperty("--drs-on-accent", readableTextOn(accent));
            style.setProperty("--drs-text", appearance.textColor.value.value);
            // Light text implies a dark report: switch native controls (date-picker icon,
            // select dropdown) to their dark rendering too.
            style.colorScheme = isLightColor(appearance.textColor.value.value) ? "dark" : "light";
            // Muted text, borders and hover are derived from the text colour in the
            // stylesheet, so a single setting is enough for light and dark reports.
            for (const name of ["--drs-muted", "--drs-border", "--drs-surface", "--drs-hover"]) {
                style.removeProperty(name);
            }
        }
        this.root.classList.toggle("drs--high-contrast", highContrast);
        applyCornerRadius(this.root, appearance.cornerRadius.value);
        style.setProperty("--drs-font", appearance.fontFamily.value);
        style.fontSize = `${appearance.fontSize.value}pt`;
    }
}

/**
 * Resolves the table/column the filter must target.
 * Prefers the query expression (robust to renamed fields and tables with dots in
 * their names) and falls back to splitting `queryName` ("Table.Column").
 * @param source Metadata of the bound column.
 * @returns Filter target, or `null` if it can't be determined.
 */
function getFilterTarget(source: DataViewMetadataColumn): FilterTarget | null {
    const expr = source.expr as { source?: { entity?: string }; ref?: string } | undefined;
    if (expr?.source?.entity && expr.ref) {
        return { table: expr.source.entity, column: expr.ref };
    }
    const queryName = source.queryName ?? "";
    const dot = queryName.indexOf(".");
    return dot > 0 ? { table: queryName.slice(0, dot), column: queryName.slice(dot + 1) } : null;
}

/**
 * Reasons Power BI rejects `openModalDialog`. Not in the public typings; values taken
 * from the Power BI Desktop client (it rejects with `{ error: <code> }`).
 */
const enum DialogFailure {
    AlreadyOpen = 1,
    NotAllowed = 2,
    /** The user ticked "don't show dialogs from this visual"; lasts until Power BI is reopened. */
    BlockedByUser = 3,
    Unknown = 4,
}

/**
 * Extracts the failure code from a rejected `openModalDialog` promise.
 * @returns The code, or `null` if the payload isn't recognised.
 */
function dialogFailureCode(error: unknown): DialogFailure | null {
    const code = typeof error === "number" ? error : (error as { error?: unknown } | null)?.error;
    return typeof code === "number" && code >= DialogFailure.AlreadyOpen && code <= DialogFailure.Unknown ? code : null;
}

/** Readable text for whatever a rejected host promise carries. */
function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error) ?? String(error);
    } catch {
        return String(error);
    }
}

/**
 * Earliest and latest dates in the bound column.
 * @param values Category values (Date objects in Power BI; strings/numbers tolerated).
 * @returns Both bounds at local midnight, or `null` when there are no valid dates.
 */
function dateBounds(values: powerbi.PrimitiveValue[]): DateRange | null {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const value of values ?? []) {
        const date = value instanceof Date ? value
            : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
        if (!date || isNaN(date.getTime())) {
            continue;
        }
        if (!min || date < min) {
            min = date;
        }
        if (!max || date > max) {
            max = date;
        }
    }
    return min && max ? { start: startOfDay(min), end: startOfDay(max) } : null;
}

function isPlausible(date: Date): boolean {
    const year = date.getFullYear();
    return year >= 1900 && year <= 2200;
}

const DARK_TEXT = "#111827";
// WCAG relative luminance of DARK_TEXT.
const DARK_TEXT_LUMINANCE = 0.0119;

/**
 * WCAG relative luminance of a `#rrggbb` colour, or `null` if it can't be parsed.
 */
function luminance(hex: string): number | null {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
    if (!match) {
        return null;
    }
    const [r, g, b] = match.slice(1).map(h => {
        const c = parseInt(h, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Dark or white text, whichever has the higher WCAG contrast on the accent colour
 * (so a pale accent chosen by the author doesn't produce white-on-light-blue).
 * @param hex `#rrggbb` colour.
 */
function readableTextOn(hex: string): string {
    const l = luminance(hex);
    if (l === null) {
        return "#ffffff";
    }
    const contrastWithWhite = 1.05 / (l + 0.05);
    const contrastWithDark = (l + 0.05) / (DARK_TEXT_LUMINANCE + 0.05);
    return contrastWithWhite >= contrastWithDark ? "#ffffff" : DARK_TEXT;
}

/**
 * Whether a text colour is light, i.e. the report background is presumably dark.
 */
function isLightColor(hex: string): boolean {
    return (luminance(hex) ?? 0) > 0.5;
}
