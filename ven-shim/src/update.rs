use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const LATEST: &str = "https://api.github.com/repos/itamarb2010-jpg/Ven/releases/latest";
const ASSET: &str = "Ven.exe";
const USER_AGENT: &str = concat!("Ven/", env!("CARGO_PKG_VERSION"));
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

struct Update {
    version: String,
    url: String,
}

static EXE: OnceLock<PathBuf> = OnceLock::new();
static READY: OnceLock<Update> = OnceLock::new();
static RESTART: AtomicBool = AtomicBool::new(false);

fn parse(version: &str) -> Vec<u64> {
    version.trim_start_matches('v').split('.').map(|part| part.parse().unwrap_or(0)).collect()
}

fn installed_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let installed = exe.file_name()? == ASSET && exe.parent()?.join(crate::APP_EXE).exists();
    installed.then_some(exe)
}

fn sweep(exe: &Path) {
    let Some(Ok(entries)) = exe.parent().map(std::fs::read_dir) else { return };
    for path in entries.flatten().map(|entry| entry.path()) {
        let leftover = path.file_stem().is_some_and(|stem| stem == "Ven")
            && path.extension().and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.starts_with("old") || ext == "update");
        if leftover {
            let _ = std::fs::remove_file(&path);
        }
    }
}

fn download(asset: &serde_json::Value) -> Option<Vec<u8>> {
    let size = asset["size"].as_u64()?;
    let mut bytes = Vec::new();
    ureq::get(asset["browser_download_url"].as_str()?)
        .set("User-Agent", USER_AGENT)
        .call()
        .ok()?
        .into_reader()
        .take(size + 1)
        .read_to_end(&mut bytes)
        .ok()?;

    let expected = asset["digest"].as_str().and_then(|digest| digest.strip_prefix("sha256:"));
    let intact = expected.map_or(true, |hash| format!("{:x}", Sha256::digest(&bytes)).eq_ignore_ascii_case(hash));
    (bytes.len() as u64 == size && bytes.starts_with(b"MZ") && intact).then_some(bytes)
}

fn replace(exe: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let staged = exe.with_extension("update");
    std::fs::write(&staged, bytes)?;

    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let parked = exe.with_extension(format!("old{stamp}"));
    std::fs::rename(exe, &parked)?;
    if let Err(e) = std::fs::rename(&staged, exe) {
        let _ = std::fs::rename(&parked, exe);
        return Err(e);
    }
    Ok(())
}

fn check(exe: &Path) -> Option<Update> {
    let body = ureq::get(LATEST)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let release: serde_json::Value = serde_json::from_str(&body).ok()?;

    let tag = release["tag_name"].as_str()?;
    if parse(tag) <= parse(env!("CARGO_PKG_VERSION")) {
        return None;
    }
    let url = release["html_url"].as_str()?.to_string();
    let asset = release["assets"].as_array()?.iter().find(|asset| asset["name"] == ASSET)?;
    replace(exe, &download(asset)?).ok()?;
    Some(Update { version: tag.trim_start_matches('v').to_string(), url })
}

pub fn start() {
    let Some(exe) = installed_exe() else { return };
    let _ = EXE.set(exe.clone());
    std::thread::spawn(move || loop {
        if let Some(update) = check(&exe) {
            let _ = READY.set(update);
            return;
        }
        sweep(&exe);
        std::thread::sleep(CHECK_EVERY);
    });
}

pub fn status() -> serde_json::Value {
    match READY.get() {
        Some(update) => serde_json::json!({ "ready": true, "version": update.version, "url": update.url }),
        None => serde_json::json!({ "ready": false }),
    }
}

pub fn ready() -> bool {
    READY.get().is_some()
}

pub fn request_restart() -> bool {
    RESTART.store(ready(), Ordering::SeqCst);
    ready()
}

pub fn restart_requested() -> bool {
    RESTART.load(Ordering::SeqCst)
}

pub fn launch() {
    if let Some(exe) = EXE.get() {
        let _ = std::process::Command::new(exe).spawn();
    }
}
