const config = window.__VEN_BACKEND__;

ML.backend = {
    available: !!config,

    async get(path, headers = {}) {
        if (!config) throw new Error("Ven backend is not running.");

        const response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
            headers: { "x-ven-token": config.token, ...headers },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `backend error ${response.status}`);
        return data;
    },
};
