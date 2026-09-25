use std::fs::File;
use std::io;
use std::path::{Component, Path, PathBuf};

const OVERRIDE_DIRS: [&str; 2] = ["overrides", "client-overrides"];

fn open(path: &Path) -> Result<zip::ZipArchive<File>, String> {
    let file = File::open(path).map_err(|e| format!("could not open pack: {e}"))?;
    zip::ZipArchive::new(file).map_err(|e| format!("not a readable zip: {e}"))
}

pub fn manifest(path: &Path) -> Result<String, String> {
    let mut archive = open(path)?;
    let mut entry = archive
        .by_name("manifest.json")
        .map_err(|_| "this zip has no manifest.json (not a CurseForge pack)".to_string())?;

    let mut text = String::new();
    io::Read::read_to_string(&mut entry, &mut text)
        .map_err(|e| format!("could not read manifest: {e}"))?;
    Ok(text)
}

fn safe_join(dest: &Path, relative: &str) -> Option<PathBuf> {
    let mut out = dest.to_path_buf();
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(piece) => out.push(piece),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

pub fn extract_overrides(path: &Path, destination: &Path) -> Result<Vec<String>, String> {
    if !destination.is_dir() {
        return Err("destination folder does not exist".into());
    }

    let mut archive = open(path)?;
    let mut written = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("bad zip entry: {e}"))?;

        let Some(name) = entry.enclosed_name().map(|p| p.to_path_buf()) else { continue };
        let name = name.to_string_lossy().replace('\\', "/");

        let Some(prefix) = OVERRIDE_DIRS.iter().find(|dir| {
            name.starts_with(&format!("{dir}/"))
        }) else { continue };

        let relative = &name[prefix.len() + 1..];
        if relative.is_empty() {
            continue;
        }

        let Some(target) = safe_join(destination, relative) else { continue };

        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| format!("could not create folder: {e}"))?;
            continue;
        }

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("could not create folder: {e}"))?;
        }

        let mut out = File::create(&target).map_err(|e| format!("could not write {relative}: {e}"))?;
        io::copy(&mut entry, &mut out).map_err(|e| format!("could not write {relative}: {e}"))?;
        written.push(relative.to_string());
    }

    Ok(written)
}
