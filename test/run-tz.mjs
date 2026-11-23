// Runs the unit tests once per time zone. Date bugs in slicers usually only show up
// away from UTC or around DST, so we cover both hemispheres and both sides of UTC.
// A Node script (instead of `TZ=... node` in package.json) keeps it working on
// Windows cmd, macOS and Linux without extra dependencies.
import { spawnSync } from "node:child_process";

const zones = ["UTC", "Europe/Lisbon", "America/New_York", "America/Sao_Paulo", "Asia/Kolkata", "Pacific/Auckland"];
let failed = false;

for (const zone of zones) {
    console.log(`\n=== TZ=${zone}`);
    const result = spawnSync(
        process.execPath,
        ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--test", "test/**/*.test.mts"],
        { stdio: "inherit", env: { ...process.env, TZ: zone } },
    );
    failed ||= result.status !== 0;
}

process.exit(failed ? 1 : 0);
