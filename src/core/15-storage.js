const KEY = "ven.store";

function load() {
    try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
        return {};
    }
}

const data = load();

ML.store = {
    all: () => data,

    clear() {
        for (const key of Object.keys(data)) delete data[key];
        try {
            localStorage.removeItem(KEY);
        } catch (e) {
            console.error("[ML] could not clear settings:", e);
        }
    },

    get(pluginId, key, fallback) {
        return data[pluginId]?.[key] ?? fallback;
    },

    set(pluginId, key, value) {
        (data[pluginId] ||= {})[key] = value;
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
        } catch (e) {
            console.error("[ML] could not save settings:", e);
        }
    },
};

ML.settings = {
    get: (key, fallback) => ML.store.get("curseforge", key, fallback),
    set: (key, value) => ML.store.set("curseforge", key, value),
};
