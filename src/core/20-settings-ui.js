const TITLE = "Ven Settings";

const icon = (paths, cls = "w-4 h-4 flex-shrink-0") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="${cls}">${paths}</svg>`;

const PUZZLE_PATHS = `<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" class="size-5"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414" clip-rule="evenodd"/></svg>`;

const NAV_BUTTON_CLASSES = "nav-button border-none text-primary cursor-pointer w-12 rounded-full h-12 flex items-center justify-center text-2xl transition-all bg-transparent hover:bg-button-bg hover:text-contrast";
const CLOSE_BUTTON_CLASSES = "relative inline-flex min-w-0 shrink-0 items-center justify-center whitespace-nowrap border-0 cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.97] hover:brightness-125 focus-visible:outline-none bg-surface-4 text-contrast [&>svg]:text-primary h-9 w-9 rounded-full p-0";

const LINKS = [
    { label: "GitHub", url: "https://github.com/itamarb2010-jpg", icon: `<svg viewBox="0 0 24 24" fill="currentColor" class="size-5"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>` },
    { label: "Website", url: "https://vaguestan.pages.dev", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10"/></svg>` },
    { label: "Discord", url: "https://discord.gg/zUwmkGxBK9", icon: `<svg viewBox="0 0 24 24" fill="currentColor" class="size-5"><path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.1 14.1 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028M8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.955 2.419-2.157 2.419m7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.946 2.419-2.157 2.419"/></svg>` },
];

const text = (tag, className, value) => {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = value;
    return el;
};

const VEN_STYLE = `
.ven-link {
    border: 1px solid var(--color-divider);
    background: var(--color-button-bg);
    color: var(--color-contrast);
    cursor: pointer;
    transition: background-color .12s ease, border-color .12s ease, transform .08s ease;
}
.ven-link:not(:disabled):hover {
    background: color-mix(in srgb, var(--color-brand) 16%, var(--color-button-bg));
    border-color: color-mix(in srgb, var(--color-brand) 60%, var(--color-divider));
}
.ven-link:not(:disabled):active {
    transform: scale(.97);
    background: color-mix(in srgb, var(--color-brand) 28%, var(--color-button-bg));
    border-color: var(--color-brand);
}
.ven-link:not(:disabled):focus-visible {
    outline: 2px solid var(--color-brand);
    outline-offset: 2px;
}
.ven-link:disabled {
    background: transparent;
    color: var(--color-secondary);
    cursor: not-allowed;
    opacity: .6;
}
.ven-input {
    background: var(--color-button-bg);
    border: 1px solid var(--color-divider);
    color: var(--color-contrast);
    outline: none;
    transition: border-color .12s ease;
}
.ven-input:focus {
    border-color: var(--color-brand);
}`;

function ensureStyle() {
    if (document.getElementById("ven-style")) return;
    const style = document.createElement("style");
    style.id = "ven-style";
    style.textContent = VEN_STYLE;
    document.head.appendChild(style);
}

ML.ui = { text, icon, ensureStyle, CLOSE_ICON, CLOSE_BUTTON_CLASSES };

function linkButton(link) {
    const button = document.createElement("button");
    button.className = "ven-link flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold";

    const glyph = document.createElement("span");
    glyph.className = "flex shrink-0 items-center";
    glyph.innerHTML = link.icon;
    button.append(glyph, text("span", "truncate", link.url ? link.label : `${link.label} soon`));

    if (link.url) {
        button.addEventListener("click", () => ML.invoke("plugin:opener|open_url", { url: link.url }));
    } else {
        button.disabled = true;
    }
    return button;
}

function apiKeyField() {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-4";

    const label = document.createElement("div");
    label.className = "min-w-0";
    label.appendChild(text("div", "text-contrast font-semibold text-sm", "CurseForge API key"));
    label.appendChild(text("div", "text-secondary text-xs",
        "Needed to browse and install CurseForge content. Get one at console.curseforge.com."));
    row.appendChild(label);

    const input = document.createElement("input");
    input.type = "password";
    input.className = "ven-input rounded-xl px-3 py-2 text-sm";
    input.style.cssText = "flex:none;width:18rem;";
    input.placeholder = "paste your key";
    const masked = () => (ML.cfKey.saved ? "\u2022".repeat(ML.cfKey.length) : "");
    input.value = masked();
    input.addEventListener("change", async () => {
        await ML.cfKey.set(input.value.trim());
        input.value = masked();
    });
    row.appendChild(input);

    return row;
}

function buildModal() {
    ensureStyle();

    const root = document.createElement("div");
    root.id = "ven-modal-root";
    root.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;";

    root.innerHTML = `
      <div class="ven-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.55);"></div>
      <div class="modal-body flex flex-col bg-bg-raised rounded-2xl border border-solid border-surface-5 outline-none"
           style="position:relative;width:min(92vw,58rem);max-height:86vh;">
        <div class="grid grid-cols-[1fr_auto] items-center gap-4 p-6 border-solid border-0 border-b-[1px] border-surface-5 max-w-full">
          <div class="flex text-wrap break-words items-center gap-3 min-w-0">
            <span class="text-2xl font-semibold text-contrast">${TITLE}</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="${CLOSE_BUTTON_CLASSES}" aria-label="Close">${CLOSE_ICON}</button>
          </div>
        </div>
        <div class="ven-body flex flex-col overflow-y-auto p-6" style="min-height:min(65vh,600px);"></div>
      </div>`;

    const body = root.querySelector(".ven-body");

    const lockup = document.createElement("div");
    lockup.className = "flex items-center gap-3";

    const badge = document.createElement("div");
    badge.className = "flex items-center justify-center rounded-xl shrink-0";
    badge.style.cssText = "width:2.75rem;height:2.75rem;background:var(--color-button-bg);border:1px solid var(--color-divider);color:var(--color-brand);";
    badge.innerHTML = icon(PUZZLE_PATHS, "w-5 h-5");

    const words = document.createElement("div");
    words.className = "min-w-0";
    words.appendChild(text("div", "text-contrast font-extrabold text-lg leading-tight", "Ven"));
    words.appendChild(text("div", "text-secondary text-sm",
        `v${ML.version} - CurseForge for Modrinth App`));

    lockup.append(badge, words);
    body.appendChild(lockup);

    const divider = document.createElement("div");
    divider.className = "mt-5";
    divider.style.cssText = "height:1px;background:var(--color-divider);";
    body.appendChild(divider);

    const settings = document.createElement("div");
    settings.className = "mt-5";
    settings.appendChild(apiKeyField());
    body.appendChild(settings);

    const links = document.createElement("div");
    links.className = "flex gap-2 mt-auto pt-8";
    for (const link of LINKS) links.appendChild(linkButton(link));
    body.appendChild(links);

    const close = () => {
        root.remove();
        document.removeEventListener("keydown", onKey);
    };
    const onKey = event => { if (event.key === "Escape") close(); };

    root.querySelector(".ven-overlay").addEventListener("click", close);
    root.querySelector("button[aria-label=Close]").addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    return root;
}

function openModal() {
    if (document.getElementById("ven-modal-root")) return;
    document.body.appendChild(buildModal());
}

function addNavButton() {
    const settingsBtn = document.querySelector("button[aria-label=Settings]");
    if (!settingsBtn || document.getElementById("ven-nav-button")) return false;

    const btn = document.createElement("button");
    btn.id = "ven-nav-button";
    btn.className = NAV_BUTTON_CLASSES;
    btn.setAttribute("aria-label", TITLE);
    btn.innerHTML = icon(PUZZLE_PATHS, "");
    btn.addEventListener("click", openModal);

    settingsBtn.parentElement.insertBefore(btn, settingsBtn);
    return true;
}

let scheduled = false;
const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        addNavButton();
    });
};

const observer = new MutationObserver(schedule);
const start = () => {
    addNavButton();
    observer.observe(document.body, { childList: true, subtree: true });
};

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start);

ML.cleanups.push(() => {
    document.getElementById("ven-style")?.remove();
    observer.disconnect();
    document.getElementById("ven-nav-button")?.remove();
    document.getElementById("ven-modal-root")?.remove();
});
