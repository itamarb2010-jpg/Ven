import { CDP } from "./cdp.mjs";
import { buildBundle } from "./bundle.mjs";

const client = await CDP.attach(Number(process.env.VEN_PORT || 9222), "tauri.localhost");
await client.send("Page.enable");
await client.send("Page.addScriptToEvaluateOnNewDocument", { source: buildBundle() });
await client.send("Page.reload");
console.log("[devload] registered and reloading");
setTimeout(() => process.exit(0), 1500);
