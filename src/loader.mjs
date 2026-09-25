import { CDP } from "./cdp.mjs";
import { buildBundle } from "./bundle.mjs";

const PORT = 9222;
const client = await CDP.attach(PORT, "tauri.localhost");

client.on("Runtime.consoleAPICalled", ({ type, args }) => {
    const text = args.map(a => a.value ?? a.description ?? "").join(" ");
    if (text.startsWith("[ML]")) console.log(`  ${type}: ${text}`);
});

await client.send("Runtime.enable");
await client.send("Page.enable");

const bundle = buildBundle();

await client.send("Page.addScriptToEvaluateOnNewDocument", { source: bundle });
await client.send("Runtime.evaluate", { expression: bundle });

console.log("[loader] injected. Ctrl+C to detach (injection stays until app restart).");
