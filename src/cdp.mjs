export class CDP {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        ws.onmessage = e => {
            const msg = JSON.parse(e.data);
            if (msg.id !== undefined) {
                const p = this.pending.get(msg.id);
                if (!p) return;
                this.pending.delete(msg.id);
                if (msg.error) p.reject(new Error(msg.error.message));
                else p.resolve(msg.result);
            } else {
                const l = this.listeners.get(msg.method);
                if (l) l.forEach(fn => fn(msg.params));
            }
        };
    }

    static async attach(port, urlMatch) {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const target = list.find(t => t.type === "page" && t.url.includes(urlMatch));
        if (!target) throw new Error(`no page target matching "${urlMatch}"`);
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.onopen = res;
            ws.onerror = () => rej(new Error("websocket failed"));
        });
        return new CDP(ws);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    on(method, fn) {
        if (!this.listeners.has(method)) this.listeners.set(method, []);
        this.listeners.get(method).push(fn);
    }
}
