import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readAll(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(f => f.endsWith(".js")).sort()
        .map(f => ({ name: f, src: readFileSync(join(dir, f), "utf8") }));
}

export function buildBundle() {
    const modules = readAll(join(root, "src", "core"));

    const body = modules.map(({ name, src }) =>
        `try { (function(ML){\n${src}\n})(window.__ML__); } catch (e) { console.error("[ML] ${name} failed:", e); }`
    ).join("\n");

    return `(() => {
  if (window.top !== window || location.origin !== "http://tauri.localhost") return;
  if (window.__ML__ && window.__ML__.cleanups) {
    window.__ML__.cleanups.forEach(fn => { try { fn(); } catch (e) {} });
  }
  window.__ML__ = { cleanups: [] };
  console.log("[ML] Ven active");
  ${body}
})();`;
}
