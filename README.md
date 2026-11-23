# Timeframe – Date Range Slicer for Power BI

Timeframe is a date range slicer for Power BI that always shows the filter Power BI is actually applying. It offers rolling quick periods, previous/next arrows and a one- or two-month calendar, in 9 languages.

- Get it in Power BI Desktop: **More visuals → Get more visuals → search "Timeframe"**
- Microsoft Marketplace: https://marketplace.microsoft.com/en-us/product/sersight.timeframe-date-range-slicer
- Product page and support: https://sersight.com/products/timeframe

The visual makes no network calls and uses no external services.

## Build

Requires Node.js 22+ (the tests use the built-in test runner and WebSocket).

```bash
npm install
npm run package      # pbiviz package → dist/*.pbiviz
npm run eslint       # lint with eslint-plugin-powerbi-visuals
npm test             # unit tests (Node built-in test runner)
npm run test:tz      # unit tests under several time zones
npm run test:browser # browser scenarios against the packaged visual (needs Chrome; run after package)
```

## Project layout

| Path | Contents |
|---|---|
| `src/visual.ts` | Visual entry point: update cycle, filter handling, rendering |
| `src/dateRange.ts` | Pure date range and preset logic (fully unit-tested) |
| `src/settings.ts` | Format pane model |
| `src/i18n.ts`, `src/translations.ts` | Locale detection and translations |
| `style/visual.less` | Styles |
| `test/` | Unit and browser tests |

The `certification` branch holds the exact source of the version submitted for Power BI certification.

## Licence

© Sersight. All rights reserved. The source is published for review; it is not licensed for reuse.
