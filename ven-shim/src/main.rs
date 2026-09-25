#![windows_subsystem = "windows"]

mod backend;
mod key;
mod pack;

use std::collections::HashMap;
use std::net::TcpListener;
use std::path::PathBuf;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const BUNDLE: &str = include_str!("../../dist/bundle.js");
const APP_EXE: &str = "Modrinth App.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const BINDING: &str = "venBackend";
const APP_ORIGIN: &str = "http://tauri.localhost";
const FRAME_TREE: u32 = 5;

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

fn free_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}

fn app_path() -> Option<PathBuf> {
    let here = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let candidates = [
        here.join(APP_EXE),
        dirs_local_appdata()?.join("Modrinth App").join(APP_EXE),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn dirs_local_appdata() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

fn wait_for_target(port: u16) -> Option<String> {
    for _ in 0..60 {
        sleep(Duration::from_millis(500));
        let url = format!("http://127.0.0.1:{port}/json/list");
        let Ok(resp) = ureq::get(&url).call() else { continue };
        let Ok(body) = resp.into_string() else { continue };
        let Ok(list) = serde_json::from_str::<serde_json::Value>(&body) else { continue };
        let found = list.as_array()?.iter().find(|t| {
            t["type"] == "page"
                && t["url"].as_str().map_or(false, |u| u.contains("tauri.localhost"))
        });
        if let Some(t) = found {
            if let Some(ws) = t["webSocketDebuggerUrl"].as_str() {
                return Some(ws.to_string());
            }
        }
    }
    None
}

fn inject(ws_url: &str, payload: &str) -> Result<Socket, Box<dyn std::error::Error>> {
    let (mut socket, _) = tungstenite::connect(ws_url)?;

    let send = |socket: &mut tungstenite::WebSocket<_>, id: u32, method: &str, params: serde_json::Value| {
        let msg = serde_json::json!({ "id": id, "method": method, "params": params });
        socket.send(tungstenite::Message::Text(msg.to_string()))
    };

    send(&mut socket, 1, "Page.enable", serde_json::json!({}))?;
    send(&mut socket, 2, "Runtime.enable", serde_json::json!({}))?;
    send(&mut socket, 3, "Runtime.addBinding", serde_json::json!({ "name": BINDING }))?;
    send(&mut socket, 4, "Page.addScriptToEvaluateOnNewDocument",
         serde_json::json!({ "source": payload }))?;
    send(&mut socket, FRAME_TREE, "Page.getFrameTree", serde_json::json!({}))?;
    send(&mut socket, 6, "Page.navigate", serde_json::json!({ "url": format!("{APP_ORIGIN}/") }))?;

    Ok(socket)
}

fn serve(mut socket: Socket) {
    let mut next_id = 100u64;
    let mut main_frame = serde_json::Value::Null;
    let mut contexts: HashMap<i64, serde_json::Value> = HashMap::new();
    loop {
        let text = match socket.read() {
            Ok(tungstenite::Message::Text(text)) => text,
            Ok(_) => continue,
            Err(_) => return,
        };
        let Ok(event) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let params = &event["params"];
        match event["method"].as_str() {
            Some("Runtime.executionContextCreated") => {
                if let Some(id) = params["context"]["id"].as_i64() {
                    contexts.insert(id, params["context"].clone());
                }
                continue;
            }
            Some("Runtime.executionContextDestroyed") => {
                if let Some(id) = params["executionContextId"].as_i64() {
                    contexts.remove(&id);
                }
                continue;
            }
            Some("Runtime.executionContextsCleared") => {
                contexts.clear();
                continue;
            }
            Some("Page.frameNavigated") if params["frame"]["parentId"].is_null() => {
                main_frame = params["frame"]["id"].clone();
                continue;
            }
            Some("Runtime.bindingCalled") if params["name"] == BINDING => {}
            _ => {
                if event["id"] == FRAME_TREE {
                    main_frame = event["result"]["frameTree"]["frame"]["id"].clone();
                }
                continue;
            }
        }

        let caller = params["executionContextId"].as_i64().and_then(|id| contexts.get(&id));
        let trusted = caller.is_some_and(|context| {
            context["origin"] == APP_ORIGIN
                && context["auxData"]["isDefault"] == true
                && !main_frame.is_null()
                && context["auxData"]["frameId"] == main_frame
        });
        if !trusted {
            continue;
        }

        let payload = event["params"]["payload"].as_str().unwrap_or_default();
        let Ok(call) = serde_json::from_str::<serde_json::Value>(payload) else { continue };
        let Some(id) = call["id"].as_u64() else { continue };
        let (status, body) = backend::handle(call["path"].as_str().unwrap_or_default(), &call["headers"]);

        let expression = format!(
            "window.__venBackendReply({id}, {status}, {})",
            serde_json::Value::String(body)
        );
        next_id += 1;
        let reply = serde_json::json!({
            "id": next_id,
            "method": "Runtime.evaluate",
            "params": { "expression": expression, "contextId": event["params"]["executionContextId"] },
        });
        if socket.send(tungstenite::Message::Text(reply.to_string())).is_err() {
            return;
        }
    }
}

const RELAUNCH_WATCH_SECS: u64 = 25;
const MAX_TAKEOVERS: u32 = 5;

fn app_pids() -> Vec<u32> {
    let Ok(output) = Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {APP_EXE}"), "/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else { return Vec::new() };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.contains(APP_EXE))
        .filter_map(|line| line.split(',').nth(1))
        .map(|field| field.trim_matches(['"', ' ']))
        .filter_map(|field| field.parse::<u32>().ok())
        .collect()
}

fn app_is_running() -> bool {
    !app_pids().is_empty()
}

fn another_shim_running() -> bool {
    let Ok(output) = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq Ven.exe", "/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    else { return false };

    let me = std::process::id();
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.contains("Ven.exe"))
        .filter_map(|line| line.split(',').nth(1))
        .map(|field| field.trim_matches(['"', ' ']))
        .filter_map(|field| field.parse::<u32>().ok())
        .any(|pid| pid != me)
}

fn ask_app_to_close() {
    let _ = Command::new("taskkill")
        .args(["/IM", APP_EXE])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

fn force_close_app() {
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", APP_EXE])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

fn wait_until_closed() -> bool {
    for attempt in 0..40 {
        if !app_is_running() {
            return true;
        }
        if attempt == 20 {
            force_close_app();
        }
        sleep(Duration::from_millis(500));
    }
    !app_is_running()
}

fn launch_and_inject(exe: &PathBuf, payload: &str) -> Option<(std::process::Child, Socket)> {
    let Some(port) = free_port() else {
        let _ = Command::new(exe).spawn();
        return None;
    };
    let child = Command::new(exe)
        .env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
             format!("--remote-debugging-port={port}"))
        .spawn()
        .ok()?;

    let socket = wait_for_target(port).and_then(|ws| inject(&ws, payload).ok());
    Some((child, socket?))
}

fn main() {
    let Some(exe) = app_path() else { return };

    let payload = BUNDLE;

    let mut takeovers = 0;

    loop {
        let Some((mut child, socket)) = launch_and_inject(&exe, payload) else { return };
        let child_pid = child.id();
        std::thread::spawn(move || serve(socket));
        let _ = child.wait();

        if takeovers >= MAX_TAKEOVERS {
            return;
        }

        let mut restarted = false;
        for _ in 0..(RELAUNCH_WATCH_SECS * 2) {
            sleep(Duration::from_millis(500));
            if another_shim_running() {
                return;
            }
            if app_pids().iter().any(|pid| *pid != child_pid) {
                restarted = true;
                break;
            }
        }

        if another_shim_running() {
            return;
        }

        if !restarted {
            return;
        }

        ask_app_to_close();
        if !wait_until_closed() {
            return;
        }
        takeovers += 1;
    }
}
