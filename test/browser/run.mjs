/*
 * Runs harness.html in headless Chrome over the DevTools protocol (Node's built-in
 * WebSocket, no dependencies) and prints a report:
 *   node test/browser/run.mjs          (after `pbiviz package`)
 * Phases: functional + performance scenarios, memory growth under forced GC, the
 * timezone scenarios under three timezone overrides, and the reduced-motion scenario.
 * Exit code 1 when any scenario fails.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9336;
const TIMEZONES = ["Pacific/Auckland", "America/Los_Angeles", "Asia/Kolkata"];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`, "--allow-file-access-from-files",
    "--window-size=1400,1000", `--user-data-dir=${mkdtempSync(join(tmpdir(), "timeframe-tests-"))}`, "about:blank",
], { stdio: "ignore" });

let failures = 0;
try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
        await wait(200);
        targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json()).catch(() => null);
    }
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener("open", resolve));
    let id = 0;
    const pending = new Map();
    const uncaught = [];
    ws.addEventListener("message", event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            pending.get(message.id)?.(message);
        } else if (message.method === "Runtime.exceptionThrown") {
            uncaught.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        pending.set(++id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
        ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression, awaitPromise = false) => {
        const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
        if (exceptionDetails) {
            throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        }
        return result.value;
    };
    const load = async () => {
        await send("Page.navigate", { url: pathToFileURL(join(here, "harness.html")).href });
        for (let i = 0; i < 100 && !(await evaluate("typeof window.harness === 'object' && typeof harness.run === 'function'")); i++) {
            await wait(100);
        }
    };
    const print = (results, label = "") => {
        for (const r of results) {
            const mark = r.ok ? "ok  " : "FAIL";
            const perf = r.updates ? `  (${r.updates} updates, slowest ${r.maxUpdateMs.toFixed(1)} ms)` : "";
            console.log(`${mark} [${r.group}] ${r.name}${label}  ${r.ms} ms${perf}`);
            for (const note of r.notes) {
                console.log(`       · ${note}`);
            }
            if (!r.ok) {
                failures++;
                if (r.error) console.log(`       error: ${r.error.split("\n").slice(0, 3).join("\n              ")}`);
                for (const c of r.console) console.log(`       console.${c.level}: ${c.text.split("\n")[0]}`);
                for (const f of r.failed) console.log(`       renderingFailed: ${f}`);
                if (r.unbalanced) console.log(`       ${r.unbalanced} instance(s) with unbalanced rendering events`);
            }
        }
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("HeapProfiler.enable");

    console.log("== Functional and performance scenarios");
    await load();
    print(await evaluate("harness.run()", true));

    console.log("\n== Memory (heap after forced GC)");
    const heap = async () => {
        await send("HeapProfiler.collectGarbage");
        await wait(100);
        return (await send("Runtime.getHeapUsage")).usedSize / 1048576;
    };
    await evaluate("harness.memory.prepare()");
    const base = await heap();
    await evaluate("harness.memory.storm(600)");
    const afterFirst = await heap();
    await evaluate("harness.memory.storm(600)");
    const afterSecond = await heap();
    await evaluate("harness.memory.churn(100)");
    const afterChurn = await heap();
    console.log(`baseline ${base.toFixed(1)} MB → after 600 updates ${afterFirst.toFixed(1)} MB → after 600 more ${afterSecond.toFixed(1)} MB (growth per 600 updates: ${(afterSecond - afterFirst).toFixed(2)} MB)`);
    console.log(`after creating and discarding 100 instances: ${afterChurn.toFixed(1)} MB (${((afterChurn - afterSecond) * 1024 / 100).toFixed(0)} KB each; in Power BI each visual lives in its own iframe, which is discarded whole)`);
    if (afterSecond - afterFirst > 2) {
        failures++;
        console.log("FAIL memory grows with updates");
    }

    console.log("\n== Timezones");
    for (const timezoneId of TIMEZONES) {
        await send("Emulation.setTimezoneOverride", { timezoneId });
        await load();
        print(await evaluate("harness.run(['tz'])", true), ` @ ${timezoneId}`);
    }
    await send("Emulation.setTimezoneOverride", { timezoneId: "" });

    console.log("\n== Reduced motion");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await load();
    print(await evaluate("harness.run(['motion'])", true));

    if (uncaught.length) {
        failures++;
        console.log(`\nFAIL uncaught exceptions reported by the browser:\n  ${uncaught.join("\n  ")}`);
    }
    ws.close();
} finally {
    chrome.kill();
}
console.log(failures ? `\n${failures} failure(s)` : "\nAll scenarios passed");
process.exit(failures ? 1 : 0);
