"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { PRESET_IDS, PresetId, WeekStart, isPresetId, weekStartForLocale } from "./dateRange";
import { DateStyleSetting, getPaneStrings, getStrings } from "./i18n";
import { LANGUAGE_OPTIONS } from "./translations";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/** Corner radius (px) by default: the slicer's original rounded look. */
const DEFAULT_CORNER_RADIUS = 8;
/** Largest corner radius offered; beyond this the boxes would just look like pills. */
const MAX_CORNER_RADIUS = 30;

export type LayoutMode = "picker" | "panel";

function dropdown(name: string, displayName: string, items: powerbi.IEnumMember[]): formattingSettings.ItemDropdown {
    return new formattingSettings.ItemDropdown({ name, displayName, items, value: items[0] });
}

/**
 * "Period" card: initial selection and calendar conventions.
 */
class PeriodCardSettings extends FormattingSettingsCard {
    defaultPreset: formattingSettings.ItemDropdown;
    language: formattingSettings.ItemDropdown;
    dateStyle: formattingSettings.ItemDropdown;
    weekStart: formattingSettings.ItemDropdown;

    name: string = "period";
    displayName: string = "Period";
    slices: Array<FormattingSettingsSlice> = [];

    constructor(locale: string) {
        super();
        const strings = getStrings(locale);
        const pane = getPaneStrings(locale);
        this.displayName = pane.period;
        this.defaultPreset = dropdown("defaultPreset", pane.defaultPeriod, [
            { value: "none", displayName: pane.noneAllDates },
            ...PRESET_IDS.map(id => ({ value: id, displayName: strings.presets[id] })),
        ]);
        // Custom visuals only receive Power BI's UI language (not the model culture or
        // Windows regional settings), so authors need a way to force the report's language.
        this.language = dropdown("language", pane.language, [
            { value: "auto", displayName: pane.autoLanguage },
            ...LANGUAGE_OPTIONS,
        ]);
        this.dateStyle = dropdown("dateStyle", pane.dateStyle, [
            { value: "auto", displayName: pane.dateAuto },
            { value: "numeric", displayName: pane.dateNumeric },
            { value: "long", displayName: pane.dateLong },
            { value: "short", displayName: pane.dateShort },
        ]);
        this.weekStart = dropdown("weekStart", pane.weekStart, [
            { value: "auto", displayName: pane.autoWeek },
            { value: "monday", displayName: pane.monday },
            { value: "sunday", displayName: pane.sunday },
        ]);
        this.slices = [this.defaultPreset, this.language, this.dateStyle, this.weekStart];
    }

    /**
     * Locale used for labels and dates: the author's choice, or Power BI's language.
     * @param hostLocale `IVisualHost.locale`.
     */
    effectiveLocale(hostLocale: string): string {
        const value = this.language.value?.value;
        return typeof value === "string" && value !== "auto" ? value : hostLocale;
    }

    /** "auto" (default), or a fixed "numeric", "long" or "short" style. */
    get dateStyleValue(): DateStyleSetting {
        const value = this.dateStyle.value?.value;
        return value === "numeric" || value === "long" || value === "short" ? value : "auto";
    }

    /** Selected default preset, or `null` for "none". */
    get defaultPresetId(): PresetId | null {
        const value = this.defaultPreset.value?.value;
        return isPresetId(value) ? value : null;
    }

    /**
     * Resolved first day of the week.
     * @param effectiveLocale Locale from {@link effectiveLocale}, used when set to automatic.
     */
    weekStartFor(effectiveLocale: string): WeekStart {
        switch (this.weekStart.value?.value) {
            case "monday": return 1;
            case "sunday": return 0;
            default: return weekStartForLocale(effectiveLocale);
        }
    }
}

/**
 * "Presets" card: which shortcuts the report author wants to offer.
 */
class PresetsCardSettings extends FormattingSettingsCard {
    private readonly toggles: Record<PresetId, formattingSettings.ToggleSwitch>;
    showAll: formattingSettings.ToggleSwitch;

    name: string = "presets";
    displayName: string = "Presets";
    slices: Array<FormattingSettingsSlice> = [];

    constructor(locale: string) {
        super();
        const strings = getStrings(locale);
        this.displayName = getPaneStrings(locale).presetsCard;
        this.toggles = {} as Record<PresetId, formattingSettings.ToggleSwitch>;
        for (const id of PRESET_IDS) {
            this.toggles[id] = new formattingSettings.ToggleSwitch({ name: id, displayName: strings.presets[id], value: true });
        }
        this.showAll = new formattingSettings.ToggleSwitch({ name: "all", displayName: strings.all, value: true });
        this.slices = [...PRESET_IDS.map(id => this.toggles[id]), this.showAll];
    }

    /** Presets enabled by the author, in display order. */
    get visiblePresets(): PresetId[] {
        return PRESET_IDS.filter(id => this.toggles[id].value);
    }
}

/**
 * "Layout" card.
 */
class LayoutCardSettings extends FormattingSettingsCard {
    mode: formattingSettings.ItemDropdown;
    calendar: formattingSettings.ItemDropdown;
    showArrows: formattingSettings.ToggleSwitch;

    name: string = "layout";
    displayName: string = "Layout";
    slices: Array<FormattingSettingsSlice> = [];

    constructor(locale: string) {
        super();
        const pane = getPaneStrings(locale);
        this.displayName = pane.layout;
        this.mode = dropdown("mode", pane.mode, [
            { value: "picker", displayName: pane.modeCompact },
            { value: "panel", displayName: pane.modePanel },
        ]);
        // Stacked: "From" and "To" rows, each opening the browser's own date picker right
        // under itself (it can extend beyond the visual, no consent checkbox).
        // Dialog: Power BI's modal window, which highlights the range but has host chrome
        // and a "don't show" checkbox.
        this.calendar = dropdown("calendar", pane.dateSelection, [
            { value: "stacked", displayName: pane.stackedFields },
            { value: "dialog", displayName: pane.dialogWindow },
        ]);
        this.showArrows = new formattingSettings.ToggleSwitch({
            name: "showArrows",
            displayName: pane.arrows,
            value: true,
        });
        this.slices = [this.mode, this.calendar, this.showArrows];
    }

    /** Which calendar the picker field opens. */
    get calendarValue(): "stacked" | "dialog" {
        // "native" (v0.7 single field) and anything unknown fall back to the stacked fields.
        return this.calendar.value?.value === "dialog" ? "dialog" : "stacked";
    }

    get modeValue(): LayoutMode {
        // The utils drop any value that isn't one of the dropdown's items (value becomes
        // undefined), so an unknown or unset mode means the picker.
        return this.mode.value?.value === "panel" ? "panel" : "picker";
    }
}

/**
 * "Appearance" card.
 */
class AppearanceCardSettings extends FormattingSettingsCard {
    accentColor: formattingSettings.ColorPicker;
    textColor: formattingSettings.ColorPicker;
    fontFamily: formattingSettings.FontPicker;
    fontSize: formattingSettings.NumUpDown;
    cornerRadius: formattingSettings.NumUpDown;

    name: string = "appearance";
    displayName: string = "Appearance";
    slices: Array<FormattingSettingsSlice> = [];

    constructor(locale: string) {
        super();
        const pane = getPaneStrings(locale);
        this.displayName = pane.appearance;
        this.accentColor = new formattingSettings.ColorPicker({
            name: "accentColor",
            displayName: pane.accentColor,
            // Sersight brand blue (from the Sersight logo).
            value: { value: "#167099" },
        });
        this.textColor = new formattingSettings.ColorPicker({
            name: "textColor",
            displayName: pane.textColor,
            value: { value: "#1f2937" },
        });
        this.fontFamily = new formattingSettings.FontPicker({
            name: "fontFamily",
            displayName: pane.font,
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif",
        });
        this.fontSize = new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: pane.textSize,
            value: 10,
        });
        // In pixels, like the "Rounded corners" of Power BI's own visual containers, so
        // the slicer can match the rest of the report. 8 = the original rounded look.
        this.cornerRadius = new formattingSettings.NumUpDown({
            name: "cornerRadius",
            displayName: pane.cornerRadius,
            value: DEFAULT_CORNER_RADIUS,
            options: {
                minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
                maxValue: { type: powerbi.visuals.ValidatorType.Max, value: MAX_CORNER_RADIUS },
            },
        });
        this.slices = [this.accentColor, this.textColor, this.fontFamily, this.fontSize, this.cornerRadius];
    }
}

/**
 * Format-pane model. `populateFormattingSettingsModel` needs a no-argument
 * constructor, so use {@link settingsModelForLocale} to get one bound to a locale.
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    periodCard: PeriodCardSettings;
    presetsCard: PresetsCardSettings;
    layoutCard: LayoutCardSettings;
    appearanceCard: AppearanceCardSettings;
    cards: FormattingSettingsCard[] = [];

    constructor(locale: string = "en-US") {
        super();
        this.periodCard = new PeriodCardSettings(locale);
        this.presetsCard = new PresetsCardSettings(locale);
        this.layoutCard = new LayoutCardSettings(locale);
        this.appearanceCard = new AppearanceCardSettings(locale);
        this.cards = [this.periodCard, this.presetsCard, this.layoutCard, this.appearanceCard];
    }
}

/**
 * Returns a no-argument subclass of the settings model with labels in `locale`.
 * @param locale `IVisualHost.locale`.
 * @returns Class usable with `FormattingSettingsService.populateFormattingSettingsModel`.
 */
export function settingsModelForLocale(locale: string): new () => VisualFormattingSettingsModel {
    return class extends VisualFormattingSettingsModel {
        constructor() {
            super(locale);
        }
    };
}
