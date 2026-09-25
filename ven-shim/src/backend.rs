use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const CF_API: &str = "https://api.curseforge.com";

pub struct Backend {
    pub port: u16,
    pub token: String,
}

pub fn random_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    format!("{:032x}", nanos.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(pid))
}

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

fn header(request: &tiny_http::Request, name: &str) -> Option<String> {
    request.headers().iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
}

fn make_header(name: &'static [u8], value: &'static [u8]) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name, value).expect("static header")
}

fn json(body: String, status: u16) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(body)
        .with_header(make_header(b"Content-Type", b"application/json"))
        .with_header(make_header(b"Access-Control-Allow-Origin", b"*"))
        .with_status_code(status)
}

fn preflight() -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(String::new())
        .with_header(make_header(b"Access-Control-Allow-Origin", b"*"))
        .with_header(make_header(b"Access-Control-Allow-Headers", b"x-ven-token, x-cf-key, content-type"))
        .with_header(make_header(b"Access-Control-Allow-Methods", b"GET, OPTIONS"))
        .with_status_code(204)
}

fn error(message: &str, status: u16) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    json(serde_json::json!({ "error": message }).to_string(), status)
}

fn proxy_curseforge(url: &str, api_key: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let rest = url.trim_start_matches("/cf/");
    let target = format!("{CF_API}/{rest}");

    match ureq::get(&target)
        .set("x-api-key", api_key)
        .set("Accept", "application/json")
        .call()
    {
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

fn cleanup(url: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let Some(target) = query_param(url, "path") else {
        return error("missing path", 400);
    };

    let folder = PathBuf::from(std::env::temp_dir()).join("ven-downloads");
    let path = PathBuf::from(&target);
    let climbs = path.components().any(|part| matches!(part, std::path::Component::ParentDir));
    if !path.starts_with(&folder) || climbs {
        return error("refusing to delete outside the download folder", 400);
    }

    let _ = std::fs::remove_file(&path);
    json(serde_json::json!({ "removed": true }).to_string(), 200)
}

fn download(url: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let Some(src) = query_param(url, "url") else {
        return error("missing url", 400);
    };
    let Some(name) = query_param(url, "name") else {
        return error("missing name", 400);
    };
    let safe = name.rsplit(['/', '\\']).next().unwrap_or("download.jar").to_string();

    let dir = PathBuf::from(std::env::temp_dir()).join("ven-downloads");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        return error(&format!("could not create temp folder: {e}"), 500);
    }
    let dest = dir.join(&safe);

    let resp = match ureq::get(&src).call() {
        Ok(r) => r,
        Err(e) => return error(&format!("download failed: {e}"), 502),
    };

    let mut bytes = Vec::new();
    if let Err(e) = resp.into_reader().take(512 * 1024 * 1024).read_to_end(&mut bytes) {
        return error(&format!("download failed: {e}"), 502);
    }
    if let Err(e) = std::fs::write(&dest, &bytes) {
        return error(&format!("could not save file: {e}"), 500);
    }

    json(serde_json::json!({ "path": dest.to_string_lossy(), "bytes": bytes.len() }).to_string(), 200)
}

pub fn start() -> Option<Backend> {
    let server = tiny_http::Server::http("127.0.0.1:0").ok()?;
    let port = server.server_addr().to_ip()?.port();
    let token = random_token();
    let expected = token.clone();

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            if request.method() == &tiny_http::Method::Options {
                let _ = request.respond(preflight());
                continue;
            }
            if header(&request, "x-ven-token").as_deref() != Some(expected.as_str()) {
                let _ = request.respond(error("unauthorized", 401));
                continue;
            }

            let url = request.url().to_string();
            let response = if url.starts_with("/cf/") {
                match header(&request, "x-cf-key") {
                    Some(key) if !key.is_empty() => proxy_curseforge(&url, &key),
                    _ => error("missing CurseForge API key", 400),
                }
            } else if url.starts_with("/download") {
                download(&url)
            } else if url.starts_with("/cleanup") {
                cleanup(&url)
            } else if url.starts_with("/pack/manifest") {
                match query_param(&url, "path") {
                    Some(path) => match crate::pack::manifest(&path) {
                        Ok(text) => json(text, 200),
                        Err(message) => error(&message, 400),
                    },
                    None => error("missing path", 400),
                }
            } else if url.starts_with("/pack/overrides") {
                match (query_param(&url, "path"), query_param(&url, "dest")) {
                    (Some(path), Some(dest)) => match crate::pack::extract_overrides(&path, &dest) {
                        Ok(count) => json(serde_json::json!({ "files": count }).to_string(), 200),
                        Err(message) => error(&message, 400),
                    },
                    _ => error("missing path or dest", 400),
                }
            } else {
                error("not found", 404)
            };

            let _ = request.respond(response);
        }
    });

    Some(Backend { port, token })
}
