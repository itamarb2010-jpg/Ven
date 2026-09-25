const GAME_MINECRAFT = 432;
const LOADER_IDS = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_LABELS = { forge: "Forge", fabric: "Fabric", quilt: "Quilt", neoforge: "NeoForge" };

const KINDS = [
    { classId: 6, projectType: "mod", page: "/browse/mod", folder: "mods", loaders: true },
    { classId: 12, projectType: "resourcepack", page: "/browse/resourcepack", folder: "resourcepacks" },
    { classId: 6945, projectType: "datapack", page: "/browse/datapack", folder: "datapacks" },
    { classId: 6552, projectType: "shader", altType: "shaderpack", page: "/browse/shader", folder: "shaderpacks" },
    { classId: 4471, projectType: "modpack", page: "/browse/modpack", pack: true },
];

const currentPageKind = () => KINDS.find(kind => kind.page === location.pathname) || null;

const SORT_FIELDS = {
    "relevance": 1,
    "download count": 6,
    "downloads": 6,
    "follow count": 2,
    "follows": 2,
    "recently published": 3,
    "recently updated": 3,
    "newest": 3,
};

const DROPDOWN_BUTTON_CLASSES = "relative inline-flex shrink-0 items-center justify-center whitespace-nowrap border-0 no-underline touch-manipulation cursor-pointer select-none transition-[background-color,color,box-shadow,filter,opacity,transform] duration-150 ease-out enabled:active:scale-[0.97] focus-visible:outline-none button-frame--base bg-surface-4 text-contrast [&>svg]:text-primary h-9 gap-1 rounded-xl px-2.5 text-sm font-semibold leading-5 text-left";

const CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="size-4 shrink-0 transition-transform duration-150 -rotate-90"><path d="m15 18-6-6 6-6"/></svg>`;

const PLATFORMS = [
    { id: "modrinth", label: "Modrinth" },
    { id: "curseforge", label: "CurseForge" },
];

const onSupportedPage = () => !!currentPageKind();

const findSearchInput = () => document.querySelector('.app-viewport input[placeholder^="Search"]');
const findResults = () => document.querySelector(".app-viewport .search");

function findViewDropdown() {
    const label = [...document.querySelectorAll("span")]
        .find(el => el.textContent.trim() === "View:");
    return label?.closest("button")?.parentElement;
}

const findToolbar = () => findViewDropdown()?.parentElement;

function dropdownValue(label) {
    const button = [...document.querySelectorAll("button")]
        .find(b => b.textContent.trim().startsWith(`${label}:`));
    const spans = button ? [...button.querySelectorAll("span")] : [];
    return spans[spans.length - 1]?.textContent.trim() ?? "";
}

function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (!then) return "";
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

function compactNumber(value) {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return String(value ?? 0);
}

let platform = "modrinth";
let cardTemplate = null;
let categoryIds = null;
let searchTimer = null;
let lastSignature = null;
let lastPath = location.pathname;
const listeners = new AbortController();

const cfGet = path => ML.backend.get(`/cf${path}`);
const cfPost = (path, body) => ML.backend.get(`/cf${path}`, { "x-body": JSON.stringify(body) });

async function currentInstance() {
    const id = new URLSearchParams(location.search).get("i");
    if (!id) return null;
    const list = await ML.invoke("plugin:instance|instance_list");
    return list.find(i => i.id === id) || null;
}

function activeChips() {
    const row = findToolbar()?.nextElementSibling;
    if (!row || !row.className.includes("flex-wrap")) return [];
    return [...row.children]
        .map(c => c.textContent.trim())
        .filter(label => label && !/^clear all/i.test(label));
}

function currentPageNumber() {
    const pager = [...(findToolbar()?.children || [])]
        .find(c => c.className.includes("ml-auto"));
    const current = pager?.querySelector('[aria-current="page"]');
    return Math.max(1, parseInt(current?.textContent.trim(), 10) || 1);
}

function readFilters() {
    const loaders = [];
    const versions = [];
    const categories = [];

    for (const chip of activeChips()) {
        const key = chip.toLowerCase();
        if (LOADER_IDS[key]) loaders.push(key);
        else if (/^\d/.test(chip)) versions.push(chip);
        else categories.push(chip);
    }

    const pageSize = parseInt(dropdownValue("View"), 10) || 20;
    return {
        query: findSearchInput()?.value.trim() || "",
        loader: loaders[0] || null,
        gameVersion: versions[0] || null,
        categories,
        sort: dropdownValue("Sort by").toLowerCase(),
        pageSize: Math.min(pageSize, 50),
        page: currentPageNumber(),
    };
}

const signature = filters => JSON.stringify([location.pathname, filters]);

async function categoryIdsFor(names) {
    if (!names.length) return [];
    if (!categoryIds) {
        const data = await cfGet(
            `/v1/categories?gameId=${GAME_MINECRAFT}&classId=${currentPageKind().classId}`);
        categoryIds = new Map((data.data || []).map(c => [c.name.toLowerCase(), c.id]));
    }
    return names.map(n => categoryIds.get(n.toLowerCase())).filter(Boolean);
}

async function buildParams(filters, instance) {
    const params = new URLSearchParams({
        gameId: String(GAME_MINECRAFT),
        classId: String(currentPageKind().classId),
        pageSize: String(filters.pageSize),
        index: String((filters.page - 1) * filters.pageSize),
        sortField: String(SORT_FIELDS[filters.sort] ?? 1),
        sortOrder: "desc",
    });

    if (filters.query) params.set("searchFilter", filters.query);

    const version = filters.gameVersion || instance?.game_version;
    if (version) params.set("gameVersion", version);

    const loader = filters.loader || instance?.loader;
    if (currentPageKind().loaders && loader && LOADER_IDS[loader]) {
        params.set("modLoaderType", String(LOADER_IDS[loader]));
    }

    const ids = await categoryIdsFor(filters.categories);
    if (ids.length === 1) params.set("categoryId", String(ids[0]));
    else if (ids.length > 1) params.set("categoryIds", JSON.stringify(ids));

    return params;
}

const appBuild = () => document.querySelector('script[src^="/assets/index-"]')?.getAttribute("src") || "";
const templateKey = () => `cardTemplate:${location.pathname}`;

function captureTemplate() {
    if (cardTemplate) return true;

    const cards = [...(findResults()?.querySelectorAll(".smart-clickable") || [])];
    if (cards.length) {
        const native = cards.find(card => {
            const button = [...card.querySelectorAll("button")]
                .find(b => /instance|install/i.test(b.textContent));
            return button && !button.disabled;
        }) || cards[0];
        cardTemplate = native.cloneNode(true);
        ML.settings.set(templateKey(), { build: appBuild(), html: cardTemplate.outerHTML });
        return true;
    }

    const saved = ML.settings.get(templateKey());
    if (saved?.html && saved.build === appBuild()) {
        const holder = document.createElement("div");
        holder.innerHTML = saved.html;
        cardTemplate = holder.firstElementChild;
    }
    return !!cardTemplate;
}

function whenTemplateReady(timeout = 8000) {
    return new Promise(resolve => {
        const started = Date.now();
        const tick = () => {
            if (captureTemplate()) return resolve(true);
            if (Date.now() - started > timeout) return resolve(false);
            setTimeout(tick, 200);
        };
        tick();
    });
}

function fillCard(card, mod, instance, present) {
    const title = card.querySelector(".project-card-title");
    if (title) title.textContent = mod.name;

    const summary = card.querySelector(".project-card-summary");
    if (summary) summary.textContent = mod.summary || "";

    const icon = card.querySelector("img.project-card__icon");
    if (icon) {
        icon.removeAttribute("srcset");
        icon.src = mod.logo?.thumbnailUrl || mod.logo?.url || "";
        icon.alt = mod.name;
    }

    const authorLink = card.querySelector(".grid-project-card-list__info a");
    if (authorLink) {
        authorLink.textContent = mod.authors?.[0]?.name || "unknown";
        authorLink.removeAttribute("href");
    }

    const downloads = card.querySelector('[aria-label$="downloads"]');
    if (downloads) {
        const count = mod.downloadCount || 0;
        downloads.setAttribute("aria-label", `${count.toLocaleString()} downloads`);
        const value = downloads.querySelector("span");
        if (value) value.textContent = compactNumber(count);
    }

    card.querySelector('[aria-label$="followers"]')?.remove();

    const updated = card.querySelector('[aria-label^="Updated"]');
    if (updated && mod.dateModified) {
        ML.setButtonLabel(updated, relativeTime(mod.dateModified));
        updated.setAttribute("aria-label",
            `Updated ${new Date(mod.dateModified).toLocaleString()}`);
    }

    const tagRow = card.querySelector(".grid-project-card-list__tags .flex.items-center.gap-1");
    if (tagRow) {
        const chip = tagRow.querySelector("div");
        const names = (mod.categories || []).slice(0, 4).map(c => c.name);
        if (chip) {
            tagRow.replaceChildren();
            for (const name of names) {
                const copy = chip.cloneNode(true);
                copy.textContent = name;
                tagRow.appendChild(copy);
            }
        }
    }

    const overlay = card.querySelector("a.rounded-xl");
    if (overlay) {
        overlay.setAttribute("href", ML.project.path(mod.id));
        overlay.addEventListener("click", event => {
            event.preventDefault();
            ML.project.open(mod.id);
        });
    }

    rewireInstallButton(card, mod, instance, present);
}

const installKey = (instance, mod) => `installed:${instance.id}:${mod.id}`;

async function installedFileNames(instance) {
    if (!instance) return null;
    try {
        const items = await ML.invoke("plugin:instance|instance_get_content_items",
            { instanceId: instance.id });
        return new Set(items.map(i => i.file_name).filter(Boolean));
    } catch {
        return null;
    }
}

function rewireInstallButton(card, mod, instance, present) {
    const original = [...card.querySelectorAll("button")]
        .find(b => /instance|install/i.test(b.textContent));
    if (!original) return;

    const button = original.cloneNode(true);
    original.replaceWith(button);
    button.style.pointerEvents = "auto";
    button.dataset.venInstall = "1";
    const packPage = currentPageKind()?.pack;
    ML.resetButton(button, packPage || instance ? "Install" : "Add to an instance");

    const report = message => ML.setButtonLabel(button, message);

    if (instance && !currentPageKind()?.pack) {
        const remembered = ML.settings.get(installKey(instance, mod));
        if (remembered && present?.has(remembered)) {
            ML.markButtonDone(button, "Installed");
            return;
        }
        if (remembered && present) ML.settings.set(installKey(instance, mod), null);
    }

    const run = async target => {
        const label = instance ? "Install" : "Add to an instance";
        button.disabled = true;
        try {
            const fileName = await installMod(mod, target, report);
            ML.settings.set(installKey(target, mod), fileName);
            ML.notify(`${mod.name} installed to ${target.name}`);
            ML.markButtonDone(button, "Installed");
            ML.refresh();
            runSearch(true);
        } catch (e) {
            report(e.message.slice(0, 26));
            setTimeout(() => ML.resetButton(button, label), 4000);
        }
    };

    button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        if (currentPageKind()?.pack) {
            const label = button.textContent.trim();
            button.disabled = true;
            try {
                const result = await installPack(mod, report);
                ML.markButtonDone(button, "Installed");
                ML.notify(result.blocked
                    ? `${mod.name} installed, ${result.blocked} file(s) blocked by their authors`
                    : `${mod.name} installed`);
            } catch (e) {
                report(e.message.slice(0, 26));
                setTimeout(() => ML.resetButton(button, label), 4000);
            }
            return;
        }

        if (instance) return run(instance);

        openInstallModal(mod, currentPageKind());
    });
}

const RELEASE = 1;

function pickFile(files) {
    const usable = (files || []).filter(file => file.downloadUrl);
    if (!usable.length) return null;

    const newest = list => list.slice().sort((a, b) =>
        new Date(b.fileDate) - new Date(a.fileDate))[0];

    return newest(usable.filter(f => f.releaseType === RELEASE)) || newest(usable);
}

async function filesFor(modId, instance, kind) {
    const params = new URLSearchParams({ pageSize: "50" });
    if (instance.game_version) params.set("gameVersion", instance.game_version);
    if (kind.loaders && LOADER_IDS[instance.loader]) {
        params.set("modLoaderType", String(LOADER_IDS[instance.loader]));
    }
    const data = await cfGet(`/v1/mods/${modId}/files?${params}`);
    return data.data || [];
}

async function allFilesFor(modId) {
    const data = await cfGet(`/v1/mods/${modId}/files?pageSize=50`);
    return data.data || [];
}

function checksum(file) {
    const hash = (file.hashes || []).find(h => h.algo === 1) || (file.hashes || []).find(h => h.algo === 2);
    return hash ? `&${hash.algo === 1 ? "sha1" : "md5"}=${encodeURIComponent(hash.value)}` : "";
}

async function placeFile(file, instance, kind) {
    const saved = await ML.backend.get(
        `/download?url=${encodeURIComponent(file.downloadUrl)}&name=${encodeURIComponent(file.fileName)}${checksum(file)}`);

    const add = projectType => ML.invoke("plugin:instance|instance_add_project_from_path", {
        instanceId: instance.id,
        projectPath: saved.path,
        projectType,
    });
    try {
        await add(kind.projectType).catch(e => {
            if (!kind.altType) throw e;
            return add(kind.altType);
        });
    } finally {
        ML.backend.get(`/cleanup?path=${encodeURIComponent(saved.path)}`).catch(() => {});
    }
}

const REQUIRED = 3;

async function modSlug(modId) {
    try {
        const data = await cfGet(`/v1/mods/${modId}`);
        return (data.data?.slug || "").toLowerCase();
    } catch {
        return "";
    }
}

function alreadyInstalled(slug, fileName, present) {
    if (!present) return false;
    if (present.has(fileName)) return true;
    if (!slug) return false;

    const normalise = value => value.toLowerCase().replace(/[_\s]+/g, "-");
    const wanted = normalise(slug);
    return [...present].some(name => normalise(name).includes(wanted));
}

async function requiredDependencies(file, instance, kind, seen) {
    const wanted = (file.dependencies || [])
        .filter(dep => dep.relationType === REQUIRED)
        .map(dep => dep.modId)
        .filter(modId => !seen.has(modId));

    const resolved = [];
    for (const modId of wanted) {
        seen.add(modId);
        const pick = pickFile(await filesFor(modId, instance, kind));
        if (!pick) continue;
        resolved.push(pick);
        resolved.push(...await requiredDependencies(pick, instance, kind, seen));
    }
    return resolved;
}

async function installMod(mod, instance, report, allowAny = false) {
    const kind = currentPageKind();

    report("Finding...");
    let file = pickFile(await filesFor(mod.id, instance, kind));

    if (!file && allowAny) file = pickFile(await allFilesFor(mod.id));
    if (!file) throw new Error("No matching file");

    await installFile(file, mod.id, instance, kind, report);
    return file.fileName;
}

async function installFile(file, modId, instance, kind, report = () => {}) {
    const present = await installedFileNames(instance);
    const seen = new Set([modId]);
    const resolved = kind.loaders ? await requiredDependencies(file, instance, kind, seen) : [];

    const dependencies = [];
    for (const dep of resolved) {
        const slug = await modSlug(dep.modId);
        if (alreadyInstalled(slug, dep.fileName, present)) continue;
        dependencies.push(dep);
    }

    let done = 0;
    for (const dep of dependencies) {
        done += 1;
        report(`Dependency ${done}/${dependencies.length}`);
        await placeFile(dep, instance, kind);
    }

    report("Downloading...");
    await placeFile(file, instance, kind);
    return dependencies;
}

function findComponent(match) {
    const root = document.querySelector("#app")?._vnode;
    let found = null;
    const seen = new Set();

    const visit = (vnode, depth) => {
        if (!vnode || found || depth > 80 || typeof vnode !== "object" || seen.has(vnode)) return;
        seen.add(vnode);
        if (vnode.component && match(vnode.component, vnode)) {
            found = vnode.component;
            return;
        }
        if (vnode.component) visit(vnode.component.subTree, depth + 1);
        if (Array.isArray(vnode.children)) vnode.children.forEach(child => visit(child, depth + 1));
        if (vnode.suspense) visit(vnode.suspense.activeBranch, depth + 1);
    };

    visit(root, 0);
    return found;
}

const findMountedComponent = name =>
    findComponent((component, vnode) => (vnode.type.__name || vnode.type.name) === name);

const DIALOG_PROPS = ["instances", "compatibleLoaders", "gameVersions", "releaseGameVersions",
    "defaultTab", "preferredLoader", "preferredGameVersion", "projectInfo", "loading",
    "randomizeIcon", "customizeIcon"];
const DIALOG_HANDLERS = ["onInstall", "onCreateAndInstall", "onNavigate", "onCancel"];

function fileSupports(file, instance, kind) {
    const versions = file.gameVersions || [];
    if (instance.game_version && !versions.includes(instance.game_version)) return false;
    if (!kind?.loaders) return true;
    const loaders = versions.map(v => v.toLowerCase()).filter(v => LOADER_IDS[v]);
    return !loaders.length || loaders.includes((instance.loader || "").toLowerCase());
}

const openInstance = instance => document.querySelector("#app").__vue_app__.config.globalProperties.$router
    .push(`/instance/${encodeURIComponent(instance.id)}`);

async function openInstallModal(mod, kind) {
    const dialog = findMountedComponent("ContentInstallModal");
    if (!dialog?.exposed?.show) return openFallbackInstallModal(mod, kind);

    const originalProps = {};
    for (const key of DIALOG_PROPS) originalProps[key] = dialog.props[key];
    const originalHandlers = {};
    for (const key of DIALOG_HANDLERS) originalHandlers[key] = dialog.vnode.props?.[key];

    let finished = false;
    const restore = () => {
        if (finished) return;
        finished = true;
        for (const key of DIALOG_PROPS) dialog.props[key] = originalProps[key];
        for (const key of DIALOG_HANDLERS) {
            if (dialog.vnode.props) dialog.vnode.props[key] = originalHandlers[key];
        }
        ML.refresh();
    };

    const setHandlers = handlers => {
        dialog.vnode.props = dialog.vnode.props || {};
        Object.assign(dialog.vnode.props, handlers);
    };

    const [instances, files] = await Promise.all([
        ML.invoke("plugin:instance|instance_list"),
        allFilesFor(mod.id),
    ]);

    const usable = files.filter(file => file.downloadUrl);
    const loaders = [...new Set(usable.flatMap(file =>
        (file.gameVersions || []).map(v => v.toLowerCase()).filter(v => LOADER_IDS[v])))];
    const versions = [...new Set(usable.flatMap(file =>
        (file.gameVersions || []).filter(v => /^\d/.test(v))))];

    const entries = instances.map(instance => ({
        id: instance.id,
        name: instance.name,
        iconUrl: instance.icon_path
            ? `http://asset.localhost/${encodeURIComponent(instance.icon_path)}`
            : undefined,
        compatible: usable.some(file => fileSupports(file, instance, kind)),
        installed: !!ML.settings.get(installKey(instance, mod)),
        installing: false,
        instance,
    }));

    const draw = () => {
        dialog.props.instances = entries.map(entry => ({ ...entry }));
    };

    const install = async entry => {
        entry.installing = true;
        draw();
        try {
            const fileName = await installMod(mod, entry.instance, () => {}, !entry.compatible);
            ML.settings.set(installKey(entry.instance, mod), fileName);
            entry.installed = true;
            ML.notify(`${mod.name} installed to ${entry.name}`);
        } catch (e) {
            ML.notify(`${mod.name}: ${e.message}`);
        }
        entry.installing = false;
        draw();
    };

    const createAndInstall = async request => {
        const { name, gameVersion, loader, iconPath } = request || {};
        if (!name || !gameVersion || !loader) return;
        try {
            const create = { name, gameVersion, loader };
            if (iconPath) create.iconPath = iconPath;
            const created = await ML.invoke("plugin:install|install_create_instance", { request: create });
            const instanceId = created.instance_id || created.instanceId;
            await waitForInstance(instanceId, () => {});

            const target = { id: instanceId, game_version: gameVersion, loader };
            const fileName = await installMod(mod, target, () => {}, true);
            ML.settings.set(installKey(target, mod), fileName);
            ML.notify(`${mod.name} installed to ${name}`);
        } catch (e) {
            ML.notify(`${mod.name}: ${e.message}`);
        }
        restore();
    };

    dialog.props.compatibleLoaders = loaders;
    dialog.props.gameVersions = versions;
    dialog.props.releaseGameVersions = new Set(versions.filter(v => /^\d+\.\d+(\.\d+)?$/.test(v)));
    dialog.props.preferredLoader = loaders[0];
    dialog.props.preferredGameVersion = versions[0];
    dialog.props.projectInfo = null;
    dialog.props.randomizeIcon = undefined;
    dialog.props.customizeIcon = undefined;
    dialog.props.defaultTab = "existing";
    dialog.props.loading = false;
    draw();

    setHandlers({
        onInstall: entry => {
            const match = entries.find(item => item.id === entry.id);
            if (match && !match.installed && !match.installing) install(match);
        },
        onCreateAndInstall: request => createAndInstall(request),
        onNavigate: entry => {
            dialog.exposed.hide();
            restore();
            const match = entries.find(item => item.id === entry.id);
            if (match) openInstance(match.instance);
        },
        onCancel: restore,
    });

    dialog.exposed.show();
}

async function openFallbackInstallModal(mod, kind) {
    document.getElementById("ven-install-modal")?.remove();
    ML.ui.ensureStyle();

    const root = document.createElement("div");
    root.id = "ven-install-modal";
    root.style.cssText = "position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;";
    root.innerHTML = `
      <div class="ven-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.55);"></div>
      <div class="modal-body flex flex-col bg-bg-raised rounded-2xl border border-solid border-surface-5 outline-none"
           style="position:relative;width:560px;max-width:92vw;max-height:95vh;">
        <div class="grid grid-cols-[1fr_auto] items-center gap-4 p-6 border-solid border-0 border-b-[1px] border-surface-5 max-w-full">
          <div class="flex text-wrap break-words items-center gap-3 min-w-0">
            <span class="text-2xl font-semibold text-contrast">Install project</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="VEN_CLOSE_CLASSES" aria-label="Close">VEN_CLOSE_ICON</button>
          </div>
        </div>

        <div class="relative flex-1 min-h-0 flex flex-col">
          <div class="flex-1 min-h-0 overflow-y-auto" style="max-height:70vh;">
            <div class="${INSTALL_MODAL.section}">
              <span class="${INSTALL_MODAL.label}">Instance type</span>
              <div class="ven-chips chips" role="radiogroup"></div>
            </div>
            <div class="${INSTALL_MODAL.divider}" style="background:var(--color-divider);"></div>
            <div class="ven-body"></div>
          </div>
        </div>

        <div class="p-4"><div class="ven-footer"></div></div>
      </div>`
        .replace("VEN_CLOSE_CLASSES", CLOSE_BUTTON_CLASSES)
        .replace("VEN_CLOSE_ICON", CLOSE_ICON);

    const close = () => root.remove();
    root.querySelector(".ven-overlay").addEventListener("click", close);
    root.querySelector("button[aria-label=Close]").addEventListener("click", close);
    document.body.appendChild(root);

    const chips = withScope(root.querySelector(".ven-chips"), ".chips");
    const body = root.querySelector(".ven-body");
    const footer = root.querySelector(".ven-footer");

    body.appendChild(text("div", INSTALL_MODAL.empty, "Loading..."));

    const instances = await ML.invoke("plugin:instance|instance_list");
    const files = await allFilesFor(mod.id);

    const loaders = [...new Set(files.flatMap(file =>
        (file.gameVersions || []).map(v => v.toLowerCase()).filter(v => LOADER_IDS[v])))];
    const gameVersions = [...new Set(files.flatMap(file =>
        (file.gameVersions || []).filter(v => /^\d/.test(v))))];

    const entries = [];
    for (const instance of instances) {
        const compatible = !!pickFile(await filesFor(mod.id, instance, kind));
        const installed = !!ML.settings.get(installKey(instance, mod));
        entries.push({ instance, compatible, installed });
    }
    const compatibleCount = entries.filter(e => e.compatible).length;

    let mode = "existing";
    let query = "";
    let hideUnavailable = false;
    let newName = `New instance (${instances.length + 1})`;
    let newLoader = loaders[0] || null;
    let newVersion = gameVersions[0] || null;

    const rank = entry => entry.compatible ? (entry.installed ? 1 : 0) : 2;

    const renderFooter = () => {
        footer.replaceChildren();
        if (mode === "existing") {
            footer.className = `ven-footer ${INSTALL_MODAL.footerExisting}`;
            const note = document.createElement("span");
            note.className = INSTALL_MODAL.footerNote;
            note.append(iconSpan(BOX_ICON), text("span", "",
                `${compatibleCount} compatible instance${compatibleCount === 1 ? "" : "s"}`));
            const cancel = modalButton("Cancel", INSTALL_MODAL.outlined, CLOSE_ICON);
            cancel.addEventListener("click", close);
            footer.append(note, cancel);
            return;
        }

        footer.className = `ven-footer ${INSTALL_MODAL.footerNew}`;
        const cancel = modalButton("Cancel", INSTALL_MODAL.outlined, CLOSE_ICON);
        cancel.addEventListener("click", close);

        const install = modalButton("Install", INSTALL_MODAL.colored, DOWNLOAD_ICON);
        install.style.setProperty("--button-color", "var(--color-brand)");
        install.disabled = !newName || !newLoader || !newVersion;
        install.addEventListener("click", async () => {
            install.disabled = true;
            const report = message => ML.setButtonLabel(install, message);
            try {
                report("Creating...");
                const created = await ML.invoke("plugin:install|install_create_instance", {
                    request: { name: newName, gameVersion: newVersion, loader: newLoader },
                });
                const instanceId = created.instance_id || created.instanceId;
                await waitForInstance(instanceId, report);

                report("Installing...");
                const target = { id: instanceId, game_version: newVersion, loader: newLoader };
                const fileName = await installMod(mod, target, report);
                ML.settings.set(installKey(target, mod), fileName);
                ML.notify(`${mod.name} installed to ${newName}`);
                ML.refresh();
                close();
            } catch (e) {
                report(e.message.slice(0, 26));
                setTimeout(() => ML.resetButton(install, "Install"), 4000);
            }
        });

        footer.append(cancel, install);
    };

    const renderExisting = () => {
        body.replaceChildren();

        const wrap = document.createElement("div");
        wrap.className = INSTALL_MODAL.existingWrap;
        wrap.style.cssText = INSTALL_MODAL.existingStyle;

        const searchRow = document.createElement("div");
        searchRow.className = INSTALL_MODAL.searchRow;

        const searchBox = document.createElement("div");
        searchBox.className = INSTALL_MODAL.searchBox;
        const glyph = document.createElement("span");
        glyph.className = "flex size-5 shrink-0 items-center justify-center text-secondary opacity-60 [&>svg]:size-5";
        glyph.innerHTML = SEARCH_ICON;
        const input = document.createElement("input");
        input.className = INSTALL_MODAL.searchInput;
        input.placeholder = "Search instance";
        input.value = query;
        input.addEventListener("input", () => { query = input.value.trim(); renderRows(); });
        searchBox.append(glyph, input);

        const eyeLabel = hideUnavailable ? "Show unavailable" : "Hide unavailable";
        const eye = modalButton("", `${INSTALL_MODAL.outlined} w-9 !px-0 !rounded-full`, hideUnavailable ? EYE_OFF_ICON : EYE_ICON);
        eye.setAttribute("aria-label", eyeLabel);
        eye.title = eyeLabel;
        eye.addEventListener("click", () => { hideUnavailable = !hideUnavailable; renderExisting(); });

        searchRow.append(searchBox, eye);

        const list = document.createElement("div");
        list.className = INSTALL_MODAL.list;

        const renderRows = () => {
            list.replaceChildren();

            let shown = entries;
            if (hideUnavailable) shown = shown.filter(e => e.compatible && !e.installed);
            if (query) {
                const needle = query.toLowerCase();
                shown = shown.filter(e => e.instance.name.toLowerCase().includes(needle));
            }
            shown = shown.slice().sort((a, b) =>
                rank(a) - rank(b) || a.instance.name.localeCompare(b.instance.name));

            if (!shown.length) {
                list.appendChild(text("div", INSTALL_MODAL.empty, "No compatible instances found"));
                return;
            }

            for (const entry of shown) {
                const row = document.createElement("div");
                row.className = `${INSTALL_MODAL.row} ${entry.installed ? "opacity-60" : "hover:bg-surface-3"}`;

                const left = document.createElement("button");
                left.type = "button";
                left.className = INSTALL_MODAL.rowButton;
                if (!entry.compatible) left.title = INCOMPATIBLE_TOOLTIP;
                const icon = instanceIconUrl(entry.instance);
                if (icon) {
                    const image = withScope(document.createElement("img"), ".avatar");
                    image.src = icon;
                    image.alt = "";
                    image.className = "avatar shrink-0";
                    image.setAttribute("rounded", "md");
                    image.style.setProperty("--_size", "2rem");
                    left.appendChild(image);
                }
                left.appendChild(text("span", INSTALL_MODAL.rowName, entry.instance.name));
                left.addEventListener("click", () => {
                    close();
                    openInstance(entry.instance);
                });
                row.appendChild(left);

                if (entry.installed) {
                    const badge = modalButton("Installed", INSTALL_MODAL.base, CHECK_ICON);
                    badge.disabled = true;
                    badge.setAttribute("aria-disabled", "true");
                    row.appendChild(badge);
                } else {
                    const action = entry.compatible
                        ? modalButton("Install", INSTALL_MODAL.base, null)
                        : modalButton("Install", `${INSTALL_MODAL.outlined} ${INSTALL_MODAL.warning}`, WARN_ICON);
                    if (!entry.compatible) action.title = INCOMPATIBLE_TOOLTIP;

                    action.addEventListener("click", async () => {
                        action.disabled = true;
                        const report = message => ML.setButtonLabel(action, message);
                        report("Installing...");
                        try {
                            const fileName = await installMod(mod, entry.instance, report, !entry.compatible);
                            ML.settings.set(installKey(entry.instance, mod), fileName);
                            entry.installed = true;
                            ML.markButtonDone(action, "Installed");
                            ML.notify(`${mod.name} installed to ${entry.instance.name}`);
                            ML.refresh();
                        } catch (e) {
                            report(e.message.slice(0, 26));
                            setTimeout(() => ML.resetButton(action, "Install"), 4000);
                        }
                    });
                    row.appendChild(action);
                }

                list.appendChild(row);
            }
        };

        wrap.append(searchRow, list);
        body.appendChild(wrap);
        renderRows();
    };

    const isRelease = version => /^\d+\.\d+(\.\d+)?$/.test(version);
    const releaseVersions = gameVersions.filter(isRelease);
    let showAllVersions = releaseVersions.length === 0;

    const renderNew = () => {
        body.replaceChildren();

        const wrap = document.createElement("div");
        wrap.className = INSTALL_MODAL.newWrap;

        const nameField = document.createElement("div");
        nameField.className = INSTALL_MODAL.field;
        nameField.appendChild(text("span", INSTALL_MODAL.label, "Name"));
        const nameBox = document.createElement("div");
        nameBox.className = INSTALL_MODAL.inputBox;
        const nameInput = document.createElement("input");
        nameInput.className = INSTALL_MODAL.searchInput;
        nameInput.placeholder = "Enter instance name";
        nameInput.value = newName;
        nameInput.addEventListener("input", () => { newName = nameInput.value.trim(); renderFooter(); });
        nameBox.appendChild(nameInput);
        nameField.appendChild(nameBox);
        wrap.appendChild(nameField);

        const loaderField = document.createElement("div");
        loaderField.className = INSTALL_MODAL.field;
        loaderField.appendChild(text("span", INSTALL_MODAL.label, "Loader"));
        const loaderChips = withScope(document.createElement("div"), ".chips");
        loaderChips.className = "chips";
        loaderChips.setAttribute("role", "radiogroup");
        for (const loader of loaders) {
            const active = loader === newLoader;
            const chip = chipButton(LOADER_LABELS[loader] || loader, active);
            chip.classList.add("capitalize");
            chip.addEventListener("click", () => { newLoader = loader; renderNew(); renderFooter(); });
            loaderChips.appendChild(chip);
        }
        loaderField.appendChild(loaderChips);
        wrap.appendChild(loaderField);

        const versionField = document.createElement("div");
        versionField.className = INSTALL_MODAL.field;
        versionField.appendChild(text("span", INSTALL_MODAL.label, "Game version"));

        const options = showAllVersions ? gameVersions : releaseVersions;
        if (!options.includes(newVersion)) newVersion = options[0] || null;

        const versionBox = document.createElement("div");
        versionBox.className = `${INSTALL_MODAL.inputBox} w-full`;
        const select = document.createElement("select");
        select.className = `${INSTALL_MODAL.searchInput} cursor-pointer`;
        for (const option of options) {
            const item = document.createElement("option");
            item.value = option;
            item.textContent = option;
            if (option === newVersion) item.selected = true;
            select.appendChild(item);
        }
        select.addEventListener("change", () => { newVersion = select.value; renderFooter(); });
        const chevron = document.createElement("span");
        chevron.className = "flex shrink-0 items-center gap-2";
        chevron.innerHTML = SELECT_CHEVRON;
        versionBox.append(select, chevron);
        versionField.appendChild(versionBox);

        if (releaseVersions.length) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent py-2 text-center text-sm font-semibold text-secondary transition-colors hover:text-contrast";
            toggle.appendChild(iconSpan(showAllVersions ? EYE_OFF_ICON : EYE_ICON));
            toggle.append(text("span", "", showAllVersions ? "Hide snapshots" : "Show all versions"));
            toggle.addEventListener("click", () => { showAllVersions = !showAllVersions; renderNew(); renderFooter(); });
            versionField.appendChild(toggle);
        }

        wrap.appendChild(versionField);
        body.appendChild(wrap);
    };

    const drawChips = () => {
        const tabs = [["existing", "Existing instance"], ["new", "New instance"]];
        chips.replaceChildren(...tabs
            .filter(([id]) => id === "existing" || loaders.length)
            .map(([id, label]) => {
                const chip = chipButton(label, mode === id);
                chip.addEventListener("click", () => {
                    mode = id;
                    drawChips();
                    if (id === "existing") renderExisting(); else renderNew();
                    renderFooter();
                });
                return chip;
            }));
    };

    drawChips();
    renderExisting();
    renderFooter();
}

function loaderFromManifest(manifest) {
    const primary = (manifest.minecraft?.modLoaders || [])
        .find(entry => entry.primary) || (manifest.minecraft?.modLoaders || [])[0];
    if (!primary?.id) return null;

    const [name, ...rest] = String(primary.id).split("-");
    const loader = name.toLowerCase();
    if (!LOADER_IDS[loader]) return null;
    return { loader, version: rest.join("-") || null };
}

async function waitForInstance(instanceId, report) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
        const instance = await ML.invoke("plugin:instance|instance_get", { instanceId })
            .catch(() => null);
        const stage = instance?.install_stage;
        if (stage === "installed") return instance;
        if (stage && /fail|error/i.test(stage)) throw new Error("Instance setup failed");
        report(`Preparing${".".repeat((attempt % 3) + 1)}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("Instance setup timed out");
}

async function inBatches(items, size, worker) {
    const queue = [...items];
    const running = [];
    for (let slot = 0; slot < size; slot += 1) {
        running.push((async () => {
            while (queue.length) {
                const next = queue.shift();
                if (next !== undefined) await worker(next);
            }
        })());
    }
    await Promise.all(running);
}

async function installPack(mod, report) {
    report("Finding...");
    const file = pickFile(await allFilesFor(mod.id));
    if (!file) throw new Error("Author blocked downloads");
    return installPackFile(file, mod, report);
}

async function installPackFile(file, mod, report = () => {}, options = {}) {
    report("Downloading pack...");
    const saved = await ML.backend.get(
        `/download?url=${encodeURIComponent(file.downloadUrl)}&name=${encodeURIComponent(file.fileName)}${checksum(file)}`);

    report("Reading pack...");
    const manifest = await ML.backend.get(`/pack/manifest?path=${encodeURIComponent(saved.path)}`);

    const gameVersion = manifest.minecraft?.version;
    const loader = loaderFromManifest(manifest);
    if (!gameVersion || !loader) throw new Error("Unsupported pack manifest");

    report("Creating instance...");
    const request = { name: options.name || manifest.name || mod.name, gameVersion, loader: loader.loader };
    if (loader.version) request.loaderVersion = loader.version;
    if (options.iconPath) request.iconPath = options.iconPath;
    const created = await ML.invoke("plugin:install|install_create_instance", { request });

    const instanceId = created.instance_id || created.instanceId;
    if (!instanceId) throw new Error("No instance was created");
    options.onCreated?.(created);

    await waitForInstance(instanceId, report);
    const instance = { id: instanceId };
    const fullPath = await ML.invoke("plugin:instance|instance_get_full_path", { instanceId });

    report("Unpacking files...");
    await ML.backend.get(
        `/pack/overrides?path=${encodeURIComponent(saved.path)}&dest=${encodeURIComponent(fullPath)}`)
        .catch(() => ({ files: 0 }));

    const entries = manifest.files || [];
    let done = 0;
    let blocked = 0;

    await inBatches(entries, 4, async entry => {
        try {
            const info = await cfGet(`/v1/mods/${entry.projectID}/files/${entry.fileID}`);
            const packFile = info.data;
            if (!packFile?.downloadUrl) {
                blocked += 1;
            } else {
                const project = await modInfo(entry.projectID);
                const kind = KINDS.find(candidate => candidate.folder && candidate.classId === project?.classId) || KINDS[0];
                await placeFile(packFile, instance, kind);
            }
        } catch {
            blocked += 1;
        }
        done += 1;
        report(`${done}/${entries.length}`);
    });

    ML.backend.get(`/cleanup?path=${encodeURIComponent(saved.path)}`).catch(() => {});
    ML.refresh();
    return { instanceId, total: entries.length, blocked };
}

function ourResults(create = false) {
    let box = document.getElementById("ven-cf-results");
    if (!box && create) {
        box = document.createElement("div");
        box.id = "ven-cf-results";
        box.className = "search mt-1";
        findResults()?.after(box);
    }
    return box;
}

function message(box, value) {
    const el = document.createElement("div");
    el.className = "text-secondary text-sm p-3";
    el.textContent = value;
    box.replaceChildren(el);
}

function showModrinth() {
    for (const el of document.querySelectorAll(".app-viewport .search")) {
        el.style.display = "";
    }
    ourResults()?.remove();
    lastSignature = null;
}

function showCurseForge() {
    captureTemplate();
    const native = findResults();
    if (native) native.style.display = "none";
    ourResults(true);
    runSearch(true);
}

async function runSearch(force = false) {
    if (platform !== "curseforge" || !onSupportedPage()) return;

    const box = ourResults(true);
    if (!box) return;

    const filters = readFilters();
    const current = signature(filters);
    if (!force && current === lastSignature) return;
    lastSignature = current;

    await ML.cfKey.ready;
    if (!ML.cfKey.saved) {
        message(box, "Add your CurseForge API key in Ven Settings.");
        return;
    }

    message(box, "Searching CurseForge...");
    captureTemplate();

    try {
        const instance = await currentInstance();
        const present = await installedFileNames(instance);
        const params = await buildParams(filters, instance);
        const [data, ready] = await Promise.all([
            cfGet(`/v1/mods/search?${params}`),
            whenTemplateReady(),
        ]);
        if (lastSignature !== current) return;

        const mods = data.data || [];
        if (!mods.length) {
            message(box, "Nothing on CurseForge matched these filters.");
            return;
        }
        if (!ready) {
            message(box, "Modrinth's results didn't load, so there's no card to copy yet. Change a filter to try again.");
            return;
        }

        const list = document.createElement("div");
        list.className = "gap-3 flex flex-col";
        for (const mod of mods) {
            const card = cardTemplate.cloneNode(true);
            fillCard(card, mod, instance, present);
            list.appendChild(card);
        }
        box.replaceChildren(list);
    } catch (e) {
        message(box, `CurseForge search failed: ${e.message}`);
    }
}

const DOWNLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="size-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/></svg>`;

const { text, CLOSE_ICON, CLOSE_BUTTON_CLASSES } = ML.ui;

const modInfoCache = new Map();

async function modInfo(modId) {
    if (!modInfoCache.has(modId)) {
        modInfoCache.set(modId, cfGet(`/v1/mods/${modId}`)
            .then(data => data.data)
            .catch(() => null));
    }
    return modInfoCache.get(modId);
}

const WARN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" class="size-5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/></svg>`;

const EYE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" class="size-4"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg>`;

let buttonScope;

function applyButtonScope(button) {
    if (buttonScope === undefined) {
        const native = document.querySelector("button[class*='button-frame--']");
        buttonScope = native
            ? [...native.attributes].map(a => a.name).find(name => name.startsWith("data-v-"))
            : undefined;
    }
    if (buttonScope) button.setAttribute(buttonScope, "");
    button.setAttribute("data-button", "");
}

const V = {
    button: "relative inline-flex min-w-0 shrink-0 items-center justify-center whitespace-nowrap border-0 no-underline touch-manipulation cursor-pointer select-none transition-[background-color,color,box-shadow,filter,opacity,transform] duration-150 ease-out enabled:active:scale-[0.97] [&:not(:disabled):not([aria-disabled=true]):hover]:brightness-[--hover-brightness] [&:not(:disabled):not([aria-disabled=true]):focus-visible]:brightness-[--hover-brightness] focus-visible:outline-none [&:not(:disabled):not([aria-disabled=true]):focus-visible]:ring-4 [&:not(:disabled):not([aria-disabled=true]):focus-visible]:ring-brand-shadow disabled:cursor-not-allowed disabled:opacity-50 [&[aria-disabled=true]]:cursor-not-allowed [&[aria-disabled=true]]:opacity-50 h-9 gap-1.5 rounded-xl px-2.5 text-base font-semibold leading-5 [&>svg]:size-5 [&>svg]:min-h-5 [&>svg]:min-w-5 [&>svg]:shrink-0",
    outlined: "button-frame--outlined bg-transparent text-[var(--button-color,var(--color-contrast))] [&>svg]:text-[var(--button-color,var(--color-base))]",
    colored: "button-frame--colored bg-[--button-color] text-[var(--color-accent-contrast)] [&>svg]:text-inherit",
};

const INSTALL_MODAL = {
    section: "flex flex-col gap-2.5 p-6",
    label: "font-semibold text-contrast",
    divider: "h-px bg-divider",
    empty: "flex items-center justify-center py-12 text-secondary",
    existingWrap: "flex flex-col gap-3 bg-surface-2 py-4",
    existingStyle: "height:400px;overflow-y:auto;",
    searchRow: "flex items-start gap-3 px-6",
    inputBox: "group/input min-w-0 touch-manipulation border border-solid font-medium text-primary shadow-none transition-[background-color,border-color,box-shadow,color] focus-within:text-contrast focus-within:ring-4 focus-within:ring-brand-shadow inline-flex h-9 items-center gap-2 rounded-xl px-3 border-surface-5 bg-surface-4",
    searchBox: "flex-1 group/input min-w-0 touch-manipulation border border-solid font-medium text-primary shadow-none transition-[background-color,border-color,box-shadow,color] focus-within:text-contrast focus-within:ring-4 focus-within:ring-brand-shadow inline-flex h-9 items-center gap-2 rounded-xl px-3 border-surface-5 bg-surface-4",
    searchInput: "min-w-0 w-full flex-1 appearance-none !min-h-0 !border-0 !bg-transparent !p-0 font-medium text-primary !shadow-none !outline-none placeholder:text-secondary focus:text-contrast focus:ring-0 text-base",
    list: "flex flex-col gap-1",
    row: "flex items-center justify-between px-6 py-1.5",
    rowButton: "flex min-w-0 cursor-pointer items-center gap-2.5 overflow-hidden border-0 bg-transparent p-0 text-left",
    rowName: "truncate font-semibold text-contrast hover:underline",
    base: "button-frame--base bg-surface-4 text-contrast [&>svg]:text-primary",
    outlined: V.outlined,
    colored: V.colored,
    warning: "!text-orange [&>svg]:!text-orange !shadow-[inset_0_0_0_1px_var(--color-orange)]",
    chip: "button-frame--base bg-surface-4 text-contrast [&>svg]:text-primary btn !brightness-100 hover:!brightness-125",
    chipSelected: "button-frame--base bg-surface-4 text-contrast [&>svg]:text-primary btn !brightness-100 hover:!brightness-125 selected",
    newWrap: "flex flex-col gap-6 p-6",
    field: "flex flex-col gap-2.5",
    footerExisting: "flex items-center justify-between pt-5 pb-1 px-4",
    footerNote: "flex items-center gap-1.5",
    footerNew: "flex items-center justify-end gap-2",
};

const INCOMPATIBLE_TOOLTIP = "This instance uses a different loader or game version than this project supports.";

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`;

const SELECTED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="!text-brand" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

const SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0"/></svg>`;

const EYE_OFF_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>`;

const SELECT_CHEVRON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="pointer-events-none size-5 text-secondary transition-transform duration-150 -rotate-90"><path d="m15 18-6-6 6-6"/></svg>`;

const BOX_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" class="size-5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16"/><path d="M3.29 7 12 12l8.71-5M12 22V12"/></svg>`;

const instanceIconUrl = instance => instance.icon_path
    ? `http://asset.localhost/${encodeURIComponent(instance.icon_path)}`
    : null;

const cssScopes = new Map();

function withScope(element, selector) {
    if (!cssScopes.has(selector)) {
        let scope = null;
        for (const sheet of document.styleSheets) {
            let rules;
            try {
                rules = sheet.cssRules;
            } catch {
                continue;
            }
            const rule = [...rules].find(candidate => candidate.selectorText?.startsWith(`${selector}[data-v-`));
            if (rule) {
                scope = rule.selectorText.match(/\[(data-v-[0-9a-f]+)\]/)[1];
                break;
            }
        }
        cssScopes.set(selector, scope);
    }
    const scope = cssScopes.get(selector);
    if (scope) element.setAttribute(scope, "");
    return element;
}

function modalButton(label, classes, svg) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${V.button} ${classes}`;
    applyButtonScope(button);
    if (svg) button.insertAdjacentHTML("beforeend", svg);
    if (label) button.append(` ${label}`);
    return button;
}

function chipButton(label, selected) {
    const chip = withScope(document.createElement("button"), ".chips");
    chip.type = "button";
    chip.className = `${V.button} ${selected ? INSTALL_MODAL.chipSelected : INSTALL_MODAL.chip}`;
    applyButtonScope(chip);
    chip.setAttribute("role", "radio");
    chip.setAttribute("aria-checked", String(selected));
    if (selected) chip.insertAdjacentHTML("beforeend", SELECTED_ICON);
    chip.append(text("span", "", label));
    return chip;
}

const RELEASE_NAME = { 1: "Release", 2: "Beta", 3: "Alpha" };
const releaseName = file => RELEASE_NAME[file.releaseType] || "Release";

function versionLabel(file, info) {
    const raw = (file.displayName || file.fileName).replace(/\.(jar|zip)$/i, "");
    const name = info?.name;
    if (!name) return raw;

    const lower = raw.toLowerCase();
    if (lower.startsWith(name.toLowerCase())) {
        const trimmed = raw.slice(name.length).replace(/^[\s_-]+/, "").trim();
        if (trimmed) return trimmed;
    }
    return raw;
}

function decodeChangelog(html) {
    const markup = html || "";
    if (!markup.includes("&lt;")) return markup;
    const decoder = document.createElement("textarea");
    decoder.innerHTML = markup;
    return decoder.value;
}

const EMBEDS = [
    /^https?:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/(www\.)?discord\.com\/widget/,
];

ML.purify.addHook("afterSanitizeAttributes", node => {
    if (node.nodeName === "IFRAME" && !EMBEDS.some(embed => embed.test(node.getAttribute("src") || ""))) {
        node.removeAttribute("src");
    }
});

const cleanHtml = html => ML.purify.sanitize(decodeChangelog(html), {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["target", "allowfullscreen", "frameborder", "start", "end"],
});

function iconSpan(svg) {
    const span = document.createElement("span");
    span.className = "flex shrink-0 items-center";
    span.innerHTML = svg;
    return span;
}

function buildDropdown() {
    const wrap = document.createElement("div");
    wrap.id = "ven-platform";
    wrap.className = "relative inline-block w-auto min-w-max shrink-0";

    const button = document.createElement("button");
    button.type = "button";
    button.className = DROPDOWN_BUTTON_CLASSES;
    button.setAttribute("aria-haspopup", "listbox");

    const name = document.createElement("span");
    name.className = "font-semibold text-primary";
    name.textContent = "Platform:";

    const value = document.createElement("span");
    value.className = "min-w-0 truncate font-semibold leading-tight text-inherit";
    value.textContent = PLATFORMS.find(p => p.id === platform).label;

    const left = document.createElement("div");
    left.className = "flex min-w-0 items-center gap-2";
    left.append(name, value);

    const right = document.createElement("div");
    right.className = "flex shrink-0 items-center";
    right.innerHTML = CHEVRON;

    button.append(left, right);
    wrap.appendChild(button);

    const menu = document.createElement("div");
    menu.className = "absolute z-50 mt-1 min-w-full rounded-xl p-1";
    menu.style.cssText = "display:none;background:var(--color-bg-raised,#101014);border:1px solid var(--color-divider);";

    for (const option of PLATFORMS) {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = option.label;
        item.className = "w-full text-left rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer border-none bg-transparent text-contrast hover:bg-button-bg";
        item.addEventListener("click", () => {
            platform = option.id;
            value.textContent = option.label;
            menu.style.display = "none";
            if (platform === "curseforge") showCurseForge();
            else showModrinth();
        });
        menu.appendChild(item);
    }
    wrap.appendChild(menu);

    button.addEventListener("click", () => {
        menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", event => {
        if (!wrap.contains(event.target)) menu.style.display = "none";
    }, { signal: listeners.signal });

    return wrap;
}

function mount() {
    if (location.pathname !== lastPath) {
        showModrinth();
        document.getElementById("ven-platform")?.remove();
        cardTemplate = null;
        categoryIds = null;
        lastPath = location.pathname;
    }

    if (!onSupportedPage()) return;

    if (!document.getElementById("ven-platform")) {
        const viewDropdown = findViewDropdown();
        if (!viewDropdown) return;
        viewDropdown.after(buildDropdown());
    }

    if (platform === "modrinth") {
        captureTemplate();
        return;
    }

    const native = findResults();
    if (native && native.style.display !== "none") native.style.display = "none";
    ourResults(true);

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(), 350);
}

document.addEventListener("input", event => {
    if (event.target === findSearchInput()) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(), 400);
    }
}, { capture: true, signal: listeners.signal });

let scheduled = false;
const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        mount();
    });
});

const watch = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    mount();
};
if (document.body) watch();
else document.addEventListener("DOMContentLoaded", watch);

ML.findComponent = findComponent;

ML.cf = {
    get: cfGet,
    post: cfPost,
    info: modInfo,
    files: allFilesFor,
    versionLabel,
    cleanHtml,
    installFile,
    installPackFile,
    releaseName,
    LOADER_IDS,
    KINDS,
};

ML.cleanups.push(() => {
    observer.disconnect();
    listeners.abort();
    clearTimeout(searchTimer);
    document.getElementById("ven-platform")?.remove();
    showModrinth();
});
