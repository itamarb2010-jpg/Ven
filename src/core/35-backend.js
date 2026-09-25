const pending = new Map();
let nextId = 1;

window.__venBackendReply = (id, status, body) => {
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);

    let data = {};
    try {
        data = JSON.parse(body);
    } catch {}
    if (status >= 200 && status < 300) call.resolve(data);
    else call.reject(new Error(data?.error || `backend error ${status}`));
};

ML.backend = {
    available: typeof window.venBackend === "function",

    get(path, headers = {}) {
        if (typeof window.venBackend !== "function") {
            return Promise.reject(new Error("Ven backend is not running."));
        }
        const id = nextId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            window.venBackend(JSON.stringify({ id, path, headers }));
        });
    },
};

ML.cfKey = {
    saved: false,
    length: 0,

    remember(status) {
        this.saved = status.saved;
        this.length = status.length;
    },

    async set(value) {
        this.remember(await ML.backend.get("/key/set", { "x-cf-key": value }));
    },
};

ML.cfKey.ready = (async () => {
    const legacy = ML.settings.get("apiKey");
    if (legacy) {
        await ML.cfKey.set(legacy);
        ML.settings.set("apiKey", undefined);
    }
    ML.cfKey.remember(await ML.backend.get("/key"));
})().catch(e => console.error("[ML] could not read the CurseForge key:", e));
