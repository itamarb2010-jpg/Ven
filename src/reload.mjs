import { CDP } from "./cdp.mjs";
import { buildBundle } from "./bundle.mjs";

const client = await CDP.attach(Number(process.env.VEN_PORT || 9222), "tauri.localhost");
await client.send("Runtime.evaluate", { expression: buildBundle() });
console.log("[reload] Ven re-injected");
process.exit(0);
