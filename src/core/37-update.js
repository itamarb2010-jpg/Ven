const POPUPS = Symbol.for("modrinth:popupNotificationManager");
const ALL_WINDOW_STATE = 63;
const CHECK_EVERY = 60 * 1000;

const popups = () => document.querySelector("#app")?._vnode?.component?.provides?.[POPUPS];

async function reloadToUpdate() {
    await ML.invoke("plugin:window-state|save_window_state", { flags: ALL_WINDOW_STATE });
    await ML.backend.get("/update/restart");
    await ML.invoke("plugin:window|close", { label: "main" });
}

async function announceUpdate() {
    const update = await ML.backend.get("/update").catch(() => null);
    const manager = popups();
    if (!update?.ready || !manager) return false;

    manager.addPopupNotification({
        contentType: "standard",
        type: "success",
        title: "Ven update ready",
        text: `Ven v${update.version} has finished downloading. Reload to update now, or automatically when you close Modrinth App.`,
        autoCloseMs: null,
        buttons: [
            {
                label: "Reload to update",
                color: "brand",
                action: () => reloadToUpdate().catch(e => ML.notify(`Could not update Ven: ${e.message || e}`)),
            },
            {
                label: "Changelog",
                keepOpen: true,
                action: () => ML.invoke("plugin:opener|open_url", { url: update.url }),
            },
        ],
    });
    return true;
}

const updateTimer = setInterval(async () => {
    if (await announceUpdate()) clearInterval(updateTimer);
}, CHECK_EVERY);
ML.cleanups.push(() => clearInterval(updateTimer));
