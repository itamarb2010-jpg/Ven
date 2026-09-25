const CF_PROJECT = /^cf(\d+)$/;
const CF_VERSION = /^cfv(\d+)x(\d+)$/;
const CF_TEAM = /^cft(\d+)$/;

const projectId = modId => `cf${modId}`;
const versionId = (modId, fileId) => `cfv${modId}x${fileId}`;
const teamId = modId => `cft${modId}`;

const modIdOf = id => Number(CF_PROJECT.exec(id || "")?.[1]) || null;
const teamModIdOf = id => Number(CF_TEAM.exec(id || "")?.[1]) || null;

const LINK_FIELDS = { websiteUrl: "website", issuesUrl: "issues", sourceUrl: "source", wikiUrl: "wiki" };

const fileCache = new Map();

function filesFor(modId) {
    if (!fileCache.has(modId)) {
        fileCache.set(modId, ML.cf.files(modId).then(files => files.filter(file => file.downloadUrl)));
    }
    return fileCache.get(modId);
}

const descriptions = new Map();

function descriptionFor(modId) {
    if (!descriptions.has(modId)) {
        descriptions.set(modId, ML.cf.get(`/v1/mods/${modId}/description`)
            .then(data => ML.cf.cleanHtml(data.data || ""))
            .catch(() => ""));
    }
    return descriptions.get(modId);
}

const isGameVersion = tag => /^\d+(\.\d+)+$/.test(tag);
const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const gameVersionsOf = files =>
    [...new Set(files.flatMap(file => (file.gameVersions || []).filter(isGameVersion)))];

const loadersOf = files =>
    [...new Set(files.flatMap(file =>
        (file.gameVersions || []).map(tag => tag.toLowerCase()).filter(tag => ML.cf.LOADER_IDS[tag])))];

function linksOf(info) {
    const urls = {};
    for (const [field, platform] of Object.entries(LINK_FIELDS)) {
        const url = info.links?.[field];
        if (url) urls[platform] = { donation: false, platform, url };
    }
    return urls;
}

const galleryOf = info => (info.screenshots || []).map((shot, index) => ({
    created: info.dateCreated,
    description: shot.description || null,
    featured: false,
    name: shot.title || null,
    ordering: index,
    raw_url: shot.url,
    url: shot.thumbnailUrl || shot.url,
}));

async function projectV3(modId) {
    const [info, description, files] = await Promise.all([
        ML.cf.info(modId),
        descriptionFor(modId),
        filesFor(modId),
    ]);
    if (!info) return null;

    return {
        id: projectId(modId),
        slug: projectId(modId),
        name: info.name,
        summary: info.summary || "",
        description,
        categories: (info.categories || []).map(category => category.slug || category.name),
        additional_categories: [],
        project_types: [ML.cf.KINDS.find(kind => kind.classId === info.classId)?.projectType || "mod"],
        games: ["minecraft-java"],
        environment: [],
        downloads: info.downloadCount || 0,
        followers: info.thumbsUpCount || 0,
        icon_url: info.logo?.thumbnailUrl || info.logo?.url || null,
        raw_icon_url: info.logo?.url || null,
        color: null,
        gallery: galleryOf(info),
        game_versions: gameVersionsOf(files),
        loaders: loadersOf(files),
        versions: [...files].sort((a, b) => new Date(a.fileDate) - new Date(b.fileDate))
            .map(file => versionId(modId, file.id)),
        license: { id: "LicenseRef-Unknown", name: "Unknown", url: null },
        link_urls: linksOf(info),
        team_id: teamId(modId),
        organization: null,
        published: info.dateCreated,
        updated: info.dateModified,
        approved: info.dateReleased || info.dateCreated,
        queued: null,
        status: "approved",
        requested_status: null,
        moderator_message: null,
        monetization_status: null,
        thread_id: null,
        side_types_migration_review_status: "reviewed",
        minecraft_mod: null,
        minecraft_server: null,
        minecraft_java_server: null,
        minecraft_bedrock_server: null,
    };
}

async function projectV2(modId) {
    const [info, project] = await Promise.all([ML.cf.info(modId), projectV3(modId)]);
    if (!info || !project) return null;

    return {
        id: project.id,
        slug: project.slug,
        project_type: project.project_types[0],
        team: project.team_id,
        organization: null,
        title: project.name,
        description: project.summary,
        body: project.description,
        published: project.published,
        updated: project.updated,
        approved: project.approved,
        status: "approved",
        license: project.license,
        client_side: "unknown",
        server_side: "unknown",
        downloads: project.downloads,
        followers: project.followers,
        categories: project.categories,
        additional_categories: [],
        game_versions: project.game_versions,
        loaders: project.loaders,
        versions: project.versions,
        icon_url: project.icon_url,
        raw_icon_url: project.raw_icon_url,
        issues_url: info.links?.issuesUrl || null,
        source_url: info.links?.sourceUrl || null,
        wiki_url: info.links?.wikiUrl || null,
        discord_url: null,
        donation_urls: [],
        gallery: project.gallery,
        color: null,
    };
}

function asVersion(file, modId, info, featured) {
    const tags = file.gameVersions || [];
    const required = (file.dependencies || []).filter(dep => dep.relationType === 3);

    return {
        id: versionId(modId, file.id),
        project_id: projectId(modId),
        author_id: `cfa${modId}`,
        featured,
        name: file.displayName || file.fileName,
        version_number: ML.cf.versionLabel(file, info),
        changelog: null,
        changelog_url: null,
        date_published: file.fileDate,
        downloads: file.downloadCount || 0,
        version_type: ML.cf.releaseName(file).toLowerCase(),
        files: [{
            hashes: Object.fromEntries((file.hashes || [])
                .map(hash => [hash.algo === 1 ? "sha1" : "md5", hash.value])),
            url: file.downloadUrl,
            filename: file.fileName,
            primary: true,
            size: file.fileLength || 0,
            file_type: null,
        }],
        dependencies: required.map(dep => ({
            version_id: null,
            project_id: projectId(dep.modId),
            file_name: null,
            dependency_type: "required",
        })),
        game_versions: tags.filter(isGameVersion).sort(byVersion),
        loaders: tags.map(tag => tag.toLowerCase()).filter(tag => ML.cf.LOADER_IDS[tag]),
    };
}

async function versionsFor(args) {
    const ids = args.ids || [];
    const theirs = ids.filter(id => !CF_VERSION.test(id));
    const [ours, rest] = await Promise.all([
        curseForgeVersions(ids),
        theirs.length ? ML.invoke("plugin:cache|get_version_many", { ...args, ids: theirs }) : [],
    ]);
    return [...(rest || []), ...ours];
}

async function curseForgeVersions(ids) {
    const wanted = ids.map(id => CF_VERSION.exec(id)).filter(Boolean)
        .map(match => ({ modId: Number(match[1]), fileId: Number(match[2]) }));
    const modIds = [...new Set(wanted.map(entry => entry.modId))];

    const byMod = new Map();
    await Promise.all(modIds.map(async modId => {
        const [info, files] = await Promise.all([ML.cf.info(modId), filesFor(modId)]);
        byMod.set(modId, { info, files });
    }));

    return wanted.map(({ modId, fileId }) => {
        const { info, files } = byMod.get(modId) || {};
        const file = files.find(candidate => candidate.id === fileId);
        return file ? asVersion(file, modId, info, file.id === files[0].id) : null;
    }).filter(Boolean);
}

const authors = new Map();

function rememberAuthors(info) {
    for (const author of info?.authors || []) {
        authors.set(`cfu${author.id}`, { author, created: info.dateCreated });
    }
    const first = info?.authors?.[0];
    if (first) authors.set(`cfa${info.id}`, { author: first, created: info.dateCreated });
}

async function teamFor(modId) {
    const info = await ML.cf.info(modId);
    rememberAuthors(info);
    return (info?.authors || []).map((author, index) => ({
        team_id: teamId(modId),
        user: {
            id: `cfu${author.id}`,
            username: author.name,
            avatar_url: author.avatarUrl || "",
            bio: null,
            created: info.dateCreated,
            role: "developer",
            badges: 0,
        },
        is_owner: index === 0,
        role: index === 0 ? "Owner" : "Member",
        ordering: index,
    }));
}

async function installFromPage(args) {
    const { instanceId, request } = args;
    const modId = modIdOf(request.project_id);
    const match = CF_VERSION.exec(request.version_id || "");
    const kind = ML.cf.KINDS.find(candidate => candidate.folder && candidate.projectType === request.content_type) || ML.cf.KINDS[0];

    const [instances, files] = await Promise.all([
        ML.invoke("plugin:instance|instance_list"),
        filesFor(modId),
    ]);
    const instance = instances.find(candidate => candidate.id === instanceId);
    const file = match ? files.find(candidate => candidate.id === Number(match[2])) : files[0];
    if (!instance || !file) throw new Error("no such instance or version");

    const dependencies = await ML.cf.installFile(file, modId, instance, kind);
    ML.settings.set(`installed:${instanceId}:${modId}`, file.fileName);

    const primary = {
        project_id: projectId(modId),
        version_id: versionId(modId, file.id),
        dependent_on_version_id: null,
    };
    return {
        primary,
        dependencies: dependencies.map(dep => ({
            project_id: projectId(dep.modId),
            version_id: versionId(dep.modId, dep.id),
            dependent_on_version_id: primary.version_id,
        })),
        skipped: [],
    };
}

async function projectsFor(args) {
    const ids = args.ids || [];
    const theirs = ids.filter(id => !CF_PROJECT.test(id));
    const [ours, rest] = await Promise.all([
        Promise.all(ids.filter(id => CF_PROJECT.test(id)).map(id => projectV2(modIdOf(id)))),
        theirs.length ? ML.invoke("plugin:cache|get_project_many", { ...args, ids: theirs }) : [],
    ]);
    return [...(rest || []), ...ours.filter(Boolean)];
}

async function installPackFromPage(args) {
    const location = args.location;
    const modId = modIdOf(location.project_id);
    const match = CF_VERSION.exec(location.version_id || "");
    const [info, files] = await Promise.all([ML.cf.info(modId), filesFor(modId)]);
    const file = files.find(candidate => candidate.id === Number(match?.[2])) || files[0];
    if (!info || !file) throw new Error("This pack's author has blocked downloads");

    const icon = info.logo?.url
        ? await ML.backend.get(`/download?url=${encodeURIComponent(info.logo.url)}&name=${encodeURIComponent(`icon-${modId}.png`)}`)
            .catch(() => null)
        : null;

    const dropIcon = () => {
        if (icon?.path) ML.backend.get(`/cleanup?path=${encodeURIComponent(icon.path)}`).catch(() => {});
    };

    return new Promise((resolve, reject) => {
        ML.cf.installPackFile(file, info, () => {}, {
            name: location.title,
            iconPath: icon?.path,
            onCreated: created => {
                dropIcon();
                resolve(created);
            },
        }).then(result => {
            ML.notify(result.blocked
                ? `${info.name} installed, ${result.blocked} file(s) blocked by their authors`
                : `${info.name} installed`);
        }).catch(error => {
            dropIcon();
            reject(error);
            ML.notify(`${info.name}: ${error.message}`);
        });
    });
}

const CONTENT_KINDS = ML.cf.KINDS.filter(kind => kind.folder);
const CHANNELS = { release: [1], beta: [1, 2], alpha: [1, 2, 3] };
const MOD_TTL = 60000;

const kindOf = path => CONTENT_KINDS.find(kind => (path || "").startsWith(`${kind.folder}/`));
const contentKey = item => item.id || `${item.file_path}:${item.size}`;
const onDisk = item => item.enabled === false && !item.file_path.endsWith(".disabled")
    ? `${item.file_path}.disabled`
    : item.file_path;

const matches = new Map();
const mods = new Map();

async function fileFor(modId, fileId) {
    const files = await filesFor(modId).catch(() => []);
    const known = files.find(file => file.id === fileId);
    if (known) return known;
    const data = await ML.cf.get(`/v1/mods/${modId}/files/${fileId}`).catch(() => null);
    return data?.data || null;
}

async function projectVersions(args) {
    const modId = modIdOf(args.projectId);
    const [info, files] = await Promise.all([ML.cf.info(modId), filesFor(modId)]);
    return files.map(file => asVersion(file, modId, info, file.id === files[0].id));
}

async function versionWithChangelog(args) {
    const [, modId, fileId] = CF_VERSION.exec(args.id).map(Number);
    const [info, file, notes] = await Promise.all([
        ML.cf.info(modId),
        fileFor(modId, fileId),
        ML.cf.get(`/v1/mods/${modId}/files/${fileId}/changelog`).catch(() => null),
    ]);
    if (!file) return null;
    return { ...asVersion(file, modId, info, false), changelog: ML.cf.cleanHtml(notes?.data || "").trim() };
}

async function lookUpFiles(instanceId, items) {
    const folder = await ML.invoke("plugin:instance|instance_get_full_path", { instanceId });
    const prints = await ML.backend.get(`/fingerprints?dest=${encodeURIComponent(folder)}`,
        { "x-files": JSON.stringify(items.map(onDisk)) });
    const wanted = [...new Set(Object.values(prints))];
    const data = wanted.length ? await ML.cf.post("/v1/fingerprints/432", { fingerprints: wanted }) : null;
    const byPrint = new Map((data?.data?.exactMatches || [])
        .map(match => [match.file.fileFingerprint, { modId: match.id, file: match.file }]));
    return item => byPrint.get(prints[onDisk(item)]) || null;
}

function matchFiles(instanceId, items) {
    const missing = items.filter(item => !matches.has(contentKey(item)));
    if (missing.length) {
        const lookup = lookUpFiles(instanceId, missing);
        for (const item of missing) {
            const key = contentKey(item);
            matches.set(key, lookup.then(find => find(item)));
            lookup.catch(() => matches.delete(key));
        }
    }
    return Promise.all(items.map(item => matches.get(contentKey(item)).catch(() => null)));
}

async function modsFor(modIds) {
    const now = Date.now();
    const stale = modIds.filter(modId => now - (mods.get(modId)?.at || 0) >= MOD_TTL);
    if (stale.length) {
        const data = await ML.cf.post("/v1/mods", { modIds: stale }).catch(() => null);
        for (const info of data?.data || []) mods.set(info.id, { info, at: now });
    }
    return new Map(modIds.filter(modId => mods.has(modId)).map(modId => [modId, mods.get(modId).info]));
}

function newerFile(info, file, instance, kind) {
    const channel = CHANNELS[instance.update_channel] || CHANNELS.release;
    const loader = ML.cf.LOADER_IDS[instance.loader];
    const newest = Math.max(0, ...(info.latestFilesIndexes || [])
        .filter(index => index.gameVersion === instance.game_version
            && channel.includes(index.releaseType)
            && (!kind.loaders || index.modLoader === loader))
        .map(index => index.fileId));
    return newest > file.id ? newest : null;
}

function asContent(item, match, info, instance) {
    const newer = newerFile(info, match.file, instance, kindOf(item.file_path));
    const author = info.authors?.[0];
    return {
        ...item,
        project: {
            id: projectId(info.id),
            slug: null,
            title: info.name,
            icon_url: info.logo?.thumbnailUrl || info.logo?.url || null,
            categories: [],
            additional_categories: [],
        },
        version: {
            id: versionId(info.id, match.file.id),
            version_number: ML.cf.versionLabel(match.file, info),
            file_name: match.file.fileName,
            date_published: match.file.fileDate,
        },
        owner: author
            ? { id: `cfu${author.id}`, name: author.name, avatar_url: author.avatarUrl || "", type: "user" }
            : null,
        has_update: !!newer,
        update_version_id: newer ? versionId(info.id, newer) : null,
    };
}

async function withCurseForge(items, instanceId) {
    await ML.cfKey.ready;
    if (!ML.cfKey.saved || !Array.isArray(items)) return items;

    const unknown = items.filter(item => !item.project && kindOf(item.file_path));
    if (!unknown.length) return items;

    const found = await matchFiles(instanceId, unknown);
    const matched = unknown.map((item, index) => [item, found[index]]).filter(([, match]) => match);
    if (!matched.length) return items;

    const [instance, infos] = await Promise.all([
        ML.invoke("plugin:instance|instance_get", { instanceId }),
        modsFor([...new Set(matched.map(([, match]) => match.modId))]),
    ]);
    const recognised = new Map();
    for (const [item, match] of matched) {
        const info = infos.get(match.modId);
        if (!info) continue;
        rememberAuthors(info);
        recognised.set(item, asContent(item, match, info, instance));
    }
    return items.map(item => recognised.get(item) || item);
}

async function switchVersion(args) {
    const { instanceId, projectPath } = args;
    const [, modId, fileId] = CF_VERSION.exec(args.versionId).map(Number);
    const kind = kindOf(projectPath);
    const [instance, file, items] = await Promise.all([
        ML.invoke("plugin:instance|instance_get", { instanceId }),
        fileFor(modId, fileId),
        ML.invoke("plugin:instance|instance_get_content_items", { instanceId }),
    ]);
    if (!instance || !kind || !file?.downloadUrl) throw new Error("no such instance or version");

    const disabled = items.find(item => item.file_path === projectPath)?.enabled === false;
    const toggle = (path, enabled) => ML.invoke("plugin:instance|instance_toggle_disable_project",
        { instanceId, projectPath: path, desiredEnabled: enabled });
    const placed = `${kind.folder}/${file.fileName}`;
    let current = projectPath;

    if (disabled) await toggle(projectPath, true);
    try {
        await ML.cf.installFile(file, modId, instance, kind);
        if (projectPath !== placed) {
            await ML.invoke("plugin:instance|instance_remove_project", { instanceId, projectPath });
        }
        current = placed;
    } finally {
        if (disabled) await toggle(current, false);
    }
    ML.settings.set(`installed:${instanceId}:${modId}`, file.fileName);
    return null;
}

async function updateCurseForge(instanceId) {
    const items = await ML.invoke("plugin:instance|instance_get_content_items", { instanceId });
    for (const item of items) {
        if (!item.has_update || item.locked || !CF_VERSION.test(item.update_version_id || "")) continue;
        if (item.source_kind && item.source_kind !== "local") continue;
        await switchVersion({ instanceId, projectPath: item.file_path, versionId: item.update_version_id })
            .catch(e => ML.notify(`${item.project.title}: ${e.message}`));
    }
}

const HANDLERS = {
    "plugin:cache|get_project_v3": args => projectV3(modIdOf(args.id)),
    "plugin:cache|get_project": args => projectV2(modIdOf(args.id)),
    "plugin:cache|get_project_many": projectsFor,
    "plugin:cache|get_team": args => teamFor(teamModIdOf(args.id)),
    "plugin:cache|get_organization": () => null,
    "plugin:cache|get_version_many": versionsFor,
    "plugin:cache|get_version": versionWithChangelog,
    "plugin:cache|get_project_versions": projectVersions,
    "plugin:instance|instance_switch_project_version_with_dependencies": switchVersion,
    "plugin:instance|instance_install_project_with_dependencies": installFromPage,
    "plugin:install|install_create_modpack_instance": installPackFromPage,
    "plugin:http|fetch": startApiRequest,
    "plugin:http|fetch_send": sendApiRequest,
    "plugin:http|fetch_read_body": readApiBody,
    "plugin:http|fetch_cancel": cancelApi,
    "plugin:http|fetch_cancel_body": cancelApi,
};

function isOurs(command, args) {
    if (command === "plugin:http|fetch") return CF_API.test(args.clientConfig?.url || "");
    if (command.startsWith("plugin:http|")) return apiRequests.has(args.rid) || apiBodies.has(args.rid);
    if (command === "plugin:instance|instance_install_project_with_dependencies") {
        return CF_PROJECT.test(args.request?.project_id || "");
    }
    if (command === "plugin:install|install_create_modpack_instance") {
        return args.location?.type === "fromVersionId" && CF_PROJECT.test(args.location.project_id || "");
    }
    if (command === "plugin:cache|get_project_many") return (args.ids || []).some(id => CF_PROJECT.test(id));
    if (command === "plugin:cache|get_version_many") return (args.ids || []).some(id => CF_VERSION.test(id));
    if (command === "plugin:cache|get_version") return CF_VERSION.test(args.id || "");
    if (command === "plugin:cache|get_project_versions") return CF_PROJECT.test(args.projectId || "");
    if (command === "plugin:instance|instance_switch_project_version_with_dependencies") {
        return CF_VERSION.test(args.versionId || "");
    }
    if (command === "plugin:cache|get_team" || command === "plugin:cache|get_organization") {
        return CF_TEAM.test(args.id || "");
    }
    return CF_PROJECT.test(args.id || "");
}

const MODRINTH_LINK = /^https:\/\/modrinth\.com\/[a-z]+\/cf(\d+)(?:\/version\/cfv\d+x(\d+))?/;

async function curseForgeUrl(url) {
    const match = MODRINTH_LINK.exec(url || "");
    if (!match) return null;
    const site = (await ML.cf.info(Number(match[1])))?.links?.websiteUrl;
    if (!site) return null;
    return match[2] ? `${site}/files/${match[2]}` : site;
}

const REWRITES = {
    "plugin:opener|open_url": async args => {
        const url = await curseForgeUrl(args.url);
        return url ? { ...args, url } : null;
    },
};

const RESULTS = {
    "plugin:instance|instance_get_content_items": (items, args) => withCurseForge(items, args.instanceId),
    "plugin:instance|instance_update_all": (result, args) => updateCurseForge(args.instanceId).then(() => result),
};

const CF_API = /^https:\/\/api\.modrinth\.com\/v\d\/(?:[a-z]+\/)?(?:user|project|version)\/cf/;
const apiRequests = new Map();
const apiBodies = new Map();
let nextRid = 2 ** 40;

async function apiAnswer(path) {
    const user = /^user\/(cf[au]\d+)$/.exec(path);
    if (user) {
        if (!authors.has(user[1]) && user[1].startsWith("cfa")) {
            rememberAuthors(await ML.cf.info(Number(user[1].slice(3))));
        }
        const known = authors.get(user[1]);
        if (!known) return null;
        const avatar = known.author.avatarUrl || "";
        return {
            id: user[1],
            username: known.author.name,
            avatar_url: avatar,
            raw_avatar_url: avatar,
            bio: null,
            created: known.created,
            role: "developer",
            badges: 0,
        };
    }
    if (/^project\/cf\d+\/disclosures$/.test(path)) return { disclosures: [] };
    return null;
}

function startApiRequest(args) {
    const url = args.clientConfig.url;
    const rid = nextRid++;
    const path = url.replace(/^https:\/\/api\.modrinth\.com\/v\d\//, "").split("?")[0];
    apiRequests.set(rid, { url, answer: apiAnswer(path).catch(() => null) });
    return rid;
}

async function sendApiRequest(args) {
    const request = apiRequests.get(args.rid);
    apiRequests.delete(args.rid);
    const data = await request.answer;
    const body = data === null ? { error: "not_found", description: "the requested route does not exist" } : data;
    const rid = nextRid++;
    apiBodies.set(rid, new TextEncoder().encode(JSON.stringify(body)));
    return {
        status: data === null ? 404 : 200,
        statusText: data === null ? "Not Found" : "OK",
        url: request.url,
        headers: [["content-type", "application/json"]],
        rid,
    };
}

function readApiBody(args) {
    const bytes = apiBodies.get(args.rid);
    if (bytes === null) {
        apiBodies.delete(args.rid);
        return new Uint8Array([1]);
    }
    apiBodies.set(args.rid, null);
    const chunk = new Uint8Array(bytes.length + 1);
    chunk.set(bytes);
    return chunk;
}

function cancelApi(args) {
    apiRequests.delete(args.rid);
    apiBodies.delete(args.rid);
    return null;
}

const fail = message => new Response(JSON.stringify({ field_name: "Ven", message }), {
    status: 200,
    headers: { "content-type": "application/json", "tauri-response": "error" },
});

async function withResult(pending, after, args) {
    const response = await pending;
    if (response.headers.get("tauri-response") !== "ok") return response;
    try {
        return reply(await after(await response.clone().json(), args));
    } catch (e) {
        console.error("[ML] content data failed:", e);
        return response;
    }
}

const reply = data => data instanceof Uint8Array
    ? new Response(data, {
        status: 200,
        headers: { "content-type": "application/octet-stream", "tauri-response": "ok" },
    })
    : new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json", "tauri-response": "ok" },
    });

function hookFetch() {
    if (window.__venFetch) return;
    const original = window.fetch;
    window.__venFetch = original;

    const hooked = async (input, init) => {
        const url = String(input?.url || input);
        if (!url.includes("ipc.localhost")) return original(input, init);

        const command = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
        const handler = HANDLERS[command];
        const rewrite = REWRITES[command];
        const after = RESULTS[command];
        if ((!handler && !rewrite && !after) || typeof init?.body !== "string") return original(input, init);

        let args;
        try {
            args = JSON.parse(init.body);
        } catch {
            return original(input, init);
        }

        if (rewrite) {
            const changed = await rewrite(args).catch(() => null);
            return original(input, changed ? { ...init, body: JSON.stringify(changed) } : init);
        }
        if (after) return withResult(original(input, init), after, args);
        if (!isOurs(command, args)) return original(input, init);

        try {
            return reply(await handler(args));
        } catch (e) {
            console.error("[ML] project data failed:", e);
            return fail(e?.message || String(e));
        }
    };
    window.fetch = hooked;

    ML.cleanups.push(() => {
        if (window.fetch === hooked) window.fetch = original;
        delete window.__venFetch;
    });
}

hookFetch();

const appRouter = () => document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$router;

function waitFor(check, timeout = 5000) {
    return new Promise(resolve => {
        const started = Date.now();
        const tick = () => {
            const found = check();
            if (found || Date.now() - started > timeout) return resolve(found || null);
            setTimeout(tick, 100);
        };
        tick();
    });
}

async function fillChangelog(to) {
    if (!/^\/project\/cf\d+\/version\/cfv/.test(to.path)) return;
    const page = await waitFor(() => ML.findComponent(component =>
        component.type.__name === "VersionPage" && CF_VERSION.test(component.props.version?.id || "")));
    const version = page?.props.version;
    const match = CF_VERSION.exec(version?.id || "");
    if (!match || version.changelog) return;

    const data = await ML.cf.get(`/v1/mods/${match[1]}/files/${match[2]}/changelog`).catch(() => null);
    const markup = ML.cf.cleanHtml(data?.data || "").trim();
    if (markup) version.changelog = markup;
}

function openAuthor(to, from) {
    const match = /^\/user\/([^/]+)/.exec(to.path);
    if (!match) return true;

    const name = decodeURIComponent(match[1]);
    if (!/^\/project\/cf\d+/.test(from.path) && !/^cf[au]\d+$/.test(name)) return true;
    const known = authors.get(name) || [...authors.values()].find(entry => entry.author.name === name);
    if (!known) return true;
    if (known.author.url) ML.invoke("plugin:opener|open_url", { url: known.author.url });
    return false;
}

function hookRouter() {
    const router = appRouter();
    if (!router) return false;
    const removers = [router.beforeEach(openAuthor), router.afterEach(fillChangelog)];
    ML.cleanups.push(() => removers.forEach(remove => remove()));
    fillChangelog(router.currentRoute.value);
    return true;
}

if (!hookRouter()) {
    const timer = setInterval(() => { if (hookRouter()) clearInterval(timer); }, 200);
    setTimeout(() => clearInterval(timer), 60000);
    ML.cleanups.push(() => clearInterval(timer));
}

ML.project = {
    path: modId => `/project/${projectId(modId)}`,
    open(modId) {
        const router = appRouter();
        if (router) router.push(this.path(modId));
        else location.assign(this.path(modId));
    },
};
