use sha1::Digest;
use std::io::Read;
use std::path::{Path, PathBuf};

const CF_API: &str = "https://api.curseforge.com";
const DOWNLOAD_HOSTS: [&str; 3] = ["edge.forgecdn.net", "mediafilez.forgecdn.net", "media.forgecdn.net"];
const MAX_REDIRECTS: usize = 5;
const CONTENT_FOLDERS: [&str; 4] = ["mods", "resourcepacks", "shaderpacks", "datapacks"];
const RESERVED_NAMES: [&str; 24] = [
    "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

type Reply = (u16, String);

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => { out.push(b); i += 3; }
                    Err(_) => { out.push(bytes[i]); i += 1; }
                }
            }
            b'+' => { out.push(b' '); i += 1; }
            b => { out.push(b); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(url: &str, name: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == name).then(|| percent_decode(v))
    })
}

fn header(headers: &serde_json::Value, name: &str) -> Option<String> {
    headers.as_object()?
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .and_then(|(_, value)| value.as_str())
        .map(str::to_string)
}

fn json(body: String, status: u16) -> Reply {
    (status, body)
}

fn error(message: &str, status: u16) -> Reply {
    json(serde_json::json!({ "error": message }).to_string(), status)
}

fn downloads_dir() -> PathBuf {
    std::env::temp_dir().join("ven-downloads")
}

fn in_downloads(path: &str) -> Option<PathBuf> {
    let folder = std::fs::canonicalize(downloads_dir()).ok()?;
    let target = std::fs::canonicalize(path).ok()?;
    (target.starts_with(&folder) && target != folder).then_some(target)
}

fn instance_folder(dest: &str) -> Option<PathBuf> {
    let folder = std::fs::canonicalize(dest).ok()?;
    let profiles = folder.parent()?;
    let data = profiles.parent()?;
    let in_profiles = profiles.file_name()?.eq_ignore_ascii_case("profiles");
    let is_app_data = data.join("meta").is_dir() && data.join("caches").is_dir();
    (folder.is_dir() && in_profiles && is_app_data).then_some(folder)
}

fn plain_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or_default().trim_end().to_ascii_uppercase();
    !name.is_empty()
        && !name.chars().all(|c| c == '.')
        && !name.chars().any(|c| c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        && !RESERVED_NAMES.contains(&stem.as_str())
}

fn allowed_source(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.host_str().is_some_and(|host| DOWNLOAD_HOSTS.contains(&host))
}

fn fetch(src: &str, api_key: &str) -> Result<ureq::Response, String> {
    let agent = ureq::AgentBuilder::new().redirects(0).build();
    let mut current = url::Url::parse(src).map_err(|_| "download failed: invalid url".to_string())?;

    for _ in 0..=MAX_REDIRECTS {
        if !allowed_source(&current) {
            return Err(format!("refusing to download from {}", current.host_str().unwrap_or("that address")));
        }
        let mut request = agent.get(current.as_str());
        if !api_key.is_empty() {
            request = request.set("x-api-key", api_key);
        }
        let resp = request.call().map_err(|e| format!("download failed: {e}"))?;
        if !(300..400).contains(&resp.status()) {
            return Ok(resp);
        }
        let location = resp.header("location").ok_or("download failed: redirect without a location")?;
        current = current.join(location).map_err(|_| "download failed: bad redirect".to_string())?;
    }
    Err("download failed: too many redirects".into())
}

fn verify(bytes: &[u8], url: &str) -> Result<(), String> {
    let (actual, expected) = if let Some(expected) = query_param(url, "sha1") {
        (format!("{:x}", sha1::Sha1::digest(bytes)), expected)
    } else if let Some(expected) = query_param(url, "md5") {
        (format!("{:x}", md5::Md5::digest(bytes)), expected)
    } else {
        return Ok(());
    };
    if actual.eq_ignore_ascii_case(expected.trim()) {
        Ok(())
    } else {
        Err("download failed: the file does not match its checksum".into())
    }
}

fn proxy_curseforge(url: &str, api_key: &str, body: Option<String>) -> Reply {
    let rest = url.trim_start_matches("/cf/");
    let target = format!("{CF_API}/{rest}");
    let request = |method| ureq::request(method, &target)
        .set("x-api-key", api_key)
        .set("Accept", "application/json");

    let result = match body {
        Some(body) => request("POST").set("Content-Type", "application/json").send_string(&body),
        None => request("GET").call(),
    };
    match result {
        Ok(resp) => match resp.into_string() {
            Ok(body) => json(body, 200),
            Err(e) => error(&format!("bad response body: {e}"), 502),
        },
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            json(body, code)
        }
        Err(e) => error(&format!("curseforge unreachable: {e}"), 502),
    }
}

fn cleanup(url: &str) -> Reply {
    let Some(target) = query_param(url, "path") else {
        return error("missing path", 400);
    };
    let Some(path) = in_downloads(&target) else {
        return error("refusing to delete outside the download folder", 400);
    };

    let _ = std::fs::remove_file(&path);
    json(serde_json::json!({ "removed": true }).to_string(), 200)
}

fn download(url: &str, api_key: &str) -> Reply {
    let Some(src) = query_param(url, "url") else {
        return error("missing url", 400);
    };
    let Some(name) = query_param(url, "name") else {
        return error("missing name", 400);
    };
    if !plain_name(&name) {
        return error("refusing an unsafe file name", 400);
    }

    let dir = downloads_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return error(&format!("could not create temp folder: {e}"), 500);
    }
    let dest = dir.join(&name);

    let resp = match fetch(&src, api_key) {
        Ok(r) => r,
        Err(message) => return error(&message, 502),
    };

    let mut bytes = Vec::new();
    if let Err(e) = resp.into_reader().take(512 * 1024 * 1024).read_to_end(&mut bytes) {
        return error(&format!("download failed: {e}"), 502);
    }
    if let Err(message) = verify(&bytes, url) {
        return error(&message, 502);
    }
    if let Err(e) = std::fs::write(&dest, &bytes) {
        return error(&format!("could not save file: {e}"), 500);
    }

    json(serde_json::json!({ "path": dest.to_string_lossy(), "bytes": bytes.len() }).to_string(), 200)
}

fn pack_manifest(url: &str) -> Reply {
    let Some(path) = query_param(url, "path") else {
        return error("missing path", 400);
    };
    let Some(path) = in_downloads(&path) else {
        return error("refusing to read outside the download folder", 400);
    };
    match crate::pack::manifest(&path) {
        Ok(text) => json(text, 200),
        Err(message) => error(&message, 400),
    }
}

fn pack_overrides(url: &str) -> Reply {
    let (Some(path), Some(dest)) = (query_param(url, "path"), query_param(url, "dest")) else {
        return error("missing path or dest", 400);
    };
    let Some(path) = in_downloads(&path) else {
        return error("refusing to read outside the download folder", 400);
    };
    let Some(dest) = instance_folder(&dest) else {
        return error("destination is not a Modrinth instance folder", 400);
    };
    match crate::pack::extract_overrides(&path, &dest) {
        Ok(paths) => json(serde_json::json!({ "files": paths.len(), "paths": paths }).to_string(), 200),
        Err(message) => error(&message, 400),
    }
}

fn content_file(folder: &Path, relative: &str) -> Option<PathBuf> {
    let (kind, name) = relative.split_once('/')?;
    (CONTENT_FOLDERS.contains(&kind) && plain_name(name)).then(|| folder.join(kind).join(name))
}

fn fingerprints(url: &str, headers: &serde_json::Value) -> Reply {
    let Some(dest) = query_param(url, "dest") else {
        return error("missing dest", 400);
    };
    let Some(folder) = instance_folder(&dest) else {
        return error("destination is not a Modrinth instance folder", 400);
    };
    let files: Vec<String> = header(headers, "x-files")
        .and_then(|list| serde_json::from_str(&list).ok())
        .unwrap_or_default();

    let mut found = serde_json::Map::new();
    for relative in files {
        let Some(path) = content_file(&folder, &relative) else { continue };
        if let Ok(value) = crate::fingerprint::of(&path) {
            found.insert(relative, value.into());
        }
    }
    json(serde_json::Value::Object(found).to_string(), 200)
}

fn key_status() -> Reply {
    let length = crate::key::load().map_or(0, |key| key.chars().count());
    json(serde_json::json!({ "saved": length > 0, "length": length }).to_string(), 200)
}

pub fn handle(url: &str, headers: &serde_json::Value) -> Reply {
    if url.starts_with("/cf/") {
        match crate::key::load() {
            Some(key) if !key.is_empty() => proxy_curseforge(url, &key, header(headers, "x-body")),
            _ => error("missing CurseForge API key", 400),
        }
    } else if url.starts_with("/download") {
        download(url, &crate::key::load().unwrap_or_default())
    } else if url == "/key" {
        key_status()
    } else if url == "/key/set" {
        match crate::key::save(header(headers, "x-cf-key").unwrap_or_default().trim()) {
            Ok(()) => key_status(),
            Err(message) => error(&message, 500),
        }
    } else if url.starts_with("/cleanup") {
        cleanup(url)
    } else if url.starts_with("/pack/manifest") {
        pack_manifest(url)
    } else if url.starts_with("/pack/overrides") {
        pack_overrides(url)
    } else if url.starts_with("/fingerprints") {
        fingerprints(url, headers)
    } else if url == "/update" {
        json(crate::update::status().to_string(), 200)
    } else if url == "/update/restart" {
        if crate::update::request_restart() {
            json(serde_json::json!({ "restarting": true }).to_string(), 200)
        } else {
            error("no update is ready", 409)
        }
    } else {
        error("not found", 404)
    }
}
