function hookInvoke() {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals) return false;

    ML.invoke = internals.invoke.bind(internals);
    console.log("[ML] IPC bridge hooked");
    return true;
}

if (!hookInvoke()) {
    const timer = setInterval(() => { if (hookInvoke()) clearInterval(timer); }, 100);
    setTimeout(() => clearInterval(timer), 30000);
    ML.cleanups.push(() => clearInterval(timer));
}
