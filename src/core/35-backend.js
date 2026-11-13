const pending = new Map();
let nextId = 1;

const KEY_ACTIVATION_MS = 15 * 60 * 1000;
const KEY_RETRY_DELAYS = [600, 1500, 3000];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

window.__venBackendReply = (id, status, body) => {
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);

    let data = {};
    try {
        data = JSON.parse(body);
    } catch {}
    if (status >= 200 && status < 300) {
        call.resolve(data);
        return;
    }
    const error = new Error(data?.error || data?.errorMessage || `backend error ${status}`);
    error.status = status;
    call.reject(error);
};

function keyError() {
    const activating = ML.cfKey.activating();
    const error = new Error(activating
        ? "CurseForge hasn't activated your new API key yet. New keys take 5 to 10 minutes to start working."
        : "CurseForge rejected your API key. Check it in Ven Settings.");
    error.status = 403;
    error.code = activating ? "key-activating" : "key-rejected";
    error.short = activating ? "Key not active yet" : "API key rejected";
    return error;
}

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

    async cf(path, body) {
        const headers = body === undefined ? {} : { "x-body": JSON.stringify(body) };
        const retries = ML.cfKey.activating() ? KEY_RETRY_DELAYS.length : 1;
        for (let attempt = 0; ; attempt++) {
            try {
                return await ML.backend.get(`/cf${path}`, headers);
            } catch (e) {
                if (e.status !== 403) throw e;
                if (attempt >= retries) throw keyError();
                await wait(KEY_RETRY_DELAYS[attempt]);
            }
        }
    },
};

ML.cfKey = {
    saved: false,
    length: 0,
    savedAt: ML.settings.get("keySavedAt", 0),

    remember(status) {
        this.saved = status.saved;
        this.length = status.length;
    },

    async store(value) {
        this.remember(await ML.backend.get("/key/set", { "x-cf-key": value }));
    },

    async set(value) {
        await this.store(value);
        this.savedAt = this.saved ? Date.now() : 0;
        ML.settings.set("keySavedAt", this.savedAt || undefined);
        window.dispatchEvent(new Event("ven-key-changed"));
    },

    activating() {
        return this.saved && Date.now() - this.savedAt < KEY_ACTIVATION_MS;
    },

    minutesSinceSaved() {
        return Math.max(0, Math.floor((Date.now() - this.savedAt) / 60000));
    },
};

ML.cfKey.ready = (async () => {
    const legacy = ML.settings.get("apiKey");
    if (legacy) {
        await ML.cfKey.store(legacy);
        ML.settings.set("apiKey", undefined);
    }
    ML.cfKey.remember(await ML.backend.get("/key"));
})().catch(e => console.error("[ML] could not read the CurseForge key:", e));
