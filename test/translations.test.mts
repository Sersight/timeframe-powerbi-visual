/*
 * Translation completeness: every language must define every text, keep the
 * placeholders the code replaces, and locales must map to the right language.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { LANGUAGE_OPTIONS, PANE_STRINGS, STRINGS, languageKey } from "../src/translations.ts";

/** Flattens nested objects/arrays into "path → value" pairs for comparison. */
const leaves = (value: unknown, path = ""): [string, unknown][] =>
    value !== null && typeof value === "object"
        ? Object.entries(value as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
        : [[path, value]];

for (const [name, table] of [["STRINGS", STRINGS], ["PANE_STRINGS", PANE_STRINGS]] as const) {
    test(`${name}: every language has every text, none empty`, () => {
        const reference = leaves(table.en).map(([path]) => path).sort();
        for (const [lang, strings] of Object.entries(table)) {
            const entries = leaves(strings);
            assert.deepEqual(entries.map(([path]) => path).sort(), reference, `${lang} keys`);
            for (const [path, text] of entries) {
                assert.ok(typeof text === "string" && text.trim().length > 0, `${lang}.${path} is empty`);
            }
        }
    });
}

test("save warning keeps both placeholders in every language", () => {
    for (const [lang, strings] of Object.entries(STRINGS)) {
        assert.ok(strings.saveWarning.includes("{current}") && strings.saveWarning.includes("{default}"), lang);
    }
});

test("locales map to the expected translation", () => {
    const cases: Record<string, string> = {
        "pt-PT": "ptPT", "pt": "ptPT", "pt-BR": "ptBR", "en-US": "en", "en-GB": "en",
        "es-ES": "es", "es-MX": "es", "fr-FR": "fr", "fr-CA": "fr", "de-DE": "de", "de-AT": "de",
        "it-IT": "it", "ja-JP": "ja", "zh-CN": "zh", "zh-Hans": "zh", "zh-TW": "en", "zh-HK": "en",
        "nl-NL": "en", "ko-KR": "en", "": "en",
    };
    for (const [locale, expected] of Object.entries(cases)) {
        assert.equal(languageKey(locale), expected, locale);
    }
});

test("every language option resolves to its own translation", () => {
    for (const option of LANGUAGE_OPTIONS) {
        const key = languageKey(option.value);
        assert.ok(key !== "en" || option.value.startsWith("en"), `${option.value} fell back to English`);
    }
});
