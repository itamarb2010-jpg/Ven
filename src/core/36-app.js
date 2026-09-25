const CHECK_PATH = "M20 6 9 17l-5-5";

ML.queryClient = () =>
    document.querySelector("#app")?.__vue_app__?._context?.provides?.VUE_QUERY_CLIENT;

ML.refresh = filters => {
    const client = ML.queryClient();
    if (!client) return false;
    try {
        client.invalidateQueries(filters);
        return true;
    } catch (e) {
        console.error("[ML] could not refresh the app:", e);
        return false;
    }
};

ML.setButtonLabel = (button, label) => {
    const svg = button.querySelector("svg");
    button.replaceChildren();
    if (svg) button.appendChild(svg);
    button.append(` ${label}`);
};

ML.resetButton = (button, label) => {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
    ML.setButtonLabel(button, label);
};

ML.markButtonDone = (button, label) => {
    const svg = button.querySelector("svg");
    if (svg) {
        svg.replaceChildren();
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", CHECK_PATH);
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
    }
    ML.setButtonLabel(button, label);
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
};

ML.notify = message => {
    if (!document.body) return;

    let stack = document.getElementById("ven-toasts");
    if (!stack) {
        stack = document.createElement("div");
        stack.id = "ven-toasts";
        stack.style.cssText = "position:fixed;bottom:1rem;right:1rem;z-index:2000;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;";
        document.body.appendChild(stack);
    }

    const toast = document.createElement("div");
    toast.className = "rounded-xl px-3 py-2 text-sm font-semibold";
    toast.style.cssText = "background:var(--color-bg-raised,#101014);border:1px solid var(--color-divider);color:var(--color-contrast);box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;transition:opacity .15s;";
    toast.textContent = message;
    stack.appendChild(toast);

    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 200);
    }, 3200);
};

ML.cleanups.push(() => document.getElementById("ven-toasts")?.remove());
