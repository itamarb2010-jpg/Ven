#![windows_subsystem = "windows"]

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const SHIM: &[u8] = include_bytes!("../../ven-shim/target/release/Ven.exe");
const APP_DIR_NAME: &str = "Modrinth App";
const APP_EXE: &str = "Modrinth App.exe";
const SHIM_EXE: &str = "Ven.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const ATTACH_PARENT_PROCESS: u32 = 0xFFFF_FFFF;

extern "system" {
    fn AttachConsole(process_id: u32) -> i32;
}

fn app_dir() -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join(APP_DIR_NAME);
    dir.join(APP_EXE).exists().then_some(dir)
}

fn shortcuts() -> Vec<PathBuf> {
    let mut found = Vec::new();
    let roots = [
        std::env::var_os("APPDATA").map(|p| {
            PathBuf::from(p).join("Microsoft/Windows/Start Menu/Programs")
        }),
        std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Desktop")),
        std::env::var_os("OneDrive").map(|p| PathBuf::from(p).join("Desktop")),
    ];
    for root in roots.into_iter().flatten() {
        let lnk = root.join(format!("{APP_DIR_NAME}.lnk"));
        if lnk.exists() {
            found.push(lnk);
        }
    }
    found
}

fn powershell(script: &str, vars: &[(&str, &Path)]) -> Result<(), String> {
    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW);
    for (name, value) in vars {
        command.env(name, value);
    }
    let out = command.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn retarget(lnk: &PathBuf, target: &PathBuf, icon: &PathBuf) -> Result<(), String> {
    let dir = target.parent().unwrap_or(Path::new(""));
    powershell(
        r#"$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:VEN_LNK);
           $s.TargetPath=$env:VEN_TARGET; $s.IconLocation=$env:VEN_ICON; $s.WorkingDirectory=$env:VEN_DIR; $s.Save()"#,
        &[("VEN_LNK", lnk.as_path()), ("VEN_TARGET", target.as_path()), ("VEN_ICON", icon.as_path()), ("VEN_DIR", dir)],
    )
}

fn discard(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if std::fs::remove_file(path).is_ok() {
        return Ok(());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let parked = path.with_extension(format!("old{stamp}"));
    std::fs::rename(path, &parked)
        .map_err(|e| format!("Could not remove Ven.exe: {e}"))
}

fn sweep_leftovers(dir: &PathBuf) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_leftover = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.starts_with("old"));
        if is_leftover && path.file_stem().is_some_and(|n| n == "Ven") {
            let _ = std::fs::remove_file(&path);
        }
    }
}

fn is_installed() -> bool {
    app_dir().map_or(false, |d| d.join(SHIM_EXE).exists())
}

fn install() -> Result<String, String> {
    let dir = app_dir().ok_or("Modrinth App is not installed on this PC.")?;
    let shim = dir.join(SHIM_EXE);
    let app = dir.join(APP_EXE);

    sweep_leftovers(&dir);
    if std::fs::write(&shim, SHIM).is_err() {
        discard(&shim)?;
        std::fs::write(&shim, SHIM).map_err(|e| format!("Could not write Ven.exe: {e}"))?;
    }

    let links = shortcuts();
    for lnk in &links {
        retarget(lnk, &shim, &app)?;
    }
    Ok("Installed.".into())
}

fn remove() -> Result<String, String> {
    let dir = app_dir().ok_or("Modrinth App is not installed on this PC.")?;
    let app = dir.join(APP_EXE);

    let links = shortcuts();
    for lnk in &links {
        retarget(lnk, &app, &app)?;
    }

    discard(&dir.join(SHIM_EXE))?;
    sweep_leftovers(&dir);
    Ok("Removed.".into())
}

struct App {
    status: String,
    installed: bool,
    error: bool,
}

impl Default for App {
    fn default() -> Self {
        let installed = is_installed();
        Self {
            status: if app_dir().is_none() {
                "Modrinth App was not found on this PC.".into()
            } else if installed {
                "Ven is installed.".into()
            } else {
                "Ven is not installed.".into()
            },
            installed,
            error: false,
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &eframe::egui::Context, _: &mut eframe::Frame) {
        use eframe::egui::{self, Color32, RichText};

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(18.0);
            ui.vertical_centered(|ui| {
                ui.label(RichText::new("Ven").size(34.0).strong());
                ui.label(RichText::new("for Modrinth App").size(13.0).weak());
            });
            ui.add_space(22.0);

            let running = app_dir().is_some();
            ui.vertical_centered(|ui| {
                ui.add_enabled_ui(running, |ui| {
                    let install = egui::Button::new(RichText::new("Install").size(16.0))
                        .min_size(egui::vec2(180.0, 38.0));
                    if ui.add(install).clicked() {
                        match crate::install() {
                            Ok(msg) => { self.status = msg; self.error = false; }
                            Err(msg) => { self.status = msg; self.error = true; }
                        }
                        self.installed = is_installed();
                    }

                    ui.add_space(8.0);

                    let rm = egui::Button::new(RichText::new("Remove").size(16.0))
                        .min_size(egui::vec2(180.0, 38.0));
                    if ui.add_enabled(self.installed, rm).clicked() {
                        match remove() {
                            Ok(msg) => { self.status = msg; self.error = false; }
                            Err(msg) => { self.status = msg; self.error = true; }
                        }
                        self.installed = is_installed();
                    }
                });
            });

            ui.add_space(20.0);
            ui.separator();
            ui.add_space(10.0);
            ui.vertical_centered(|ui| {
                let color = if self.error { Color32::from_rgb(230, 90, 90) } else { ui.visuals().text_color() };
                ui.label(RichText::new(&self.status).color(color));
                ui.add_space(6.0);
                ui.label(RichText::new("Close Modrinth App before installing or removing.")
                    .size(11.0).weak());
            });
        });
    }
}

fn run_headless(action: &str) -> ! {
    let result = match action {
        "--install" => install(),
        "--remove" => remove(),
        "--status" => Ok(if is_installed() { "installed".into() } else { "not installed".into() }),
        _ => Err(format!("unknown flag {action}")),
    };
    match result {
        Ok(message) => {
            println!("{message}");
            std::process::exit(0);
        }
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    }
}

fn main() -> eframe::Result<()> {
    if let Some(flag) = std::env::args().nth(1) {
        if flag.starts_with("--") {
            unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
            run_headless(&flag);
        }
    }

    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([420.0, 340.0])
            .with_resizable(false),
        ..Default::default()
    };
    eframe::run_native("Ven Installer", options, Box::new(|_| Ok(Box::<App>::default())))
}
