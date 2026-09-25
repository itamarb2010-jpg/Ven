import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "./bundle.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist"), { recursive: true });
const out = join(root, "dist", "bundle.js");
writeFileSync(out, buildBundle({ embedConfig: false }), "utf8");
console.log("wrote", out);
