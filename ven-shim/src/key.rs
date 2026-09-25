use std::ffi::c_void;
use std::path::PathBuf;
use std::ptr::{null, null_mut};

const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

#[repr(C)]
struct Blob {
    size: u32,
    data: *mut u8,
}

#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(input: *const Blob, description: *const u16, entropy: *const Blob,
                        reserved: *const c_void, prompt: *const c_void, flags: u32, output: *mut Blob) -> i32;
    fn CryptUnprotectData(input: *const Blob, description: *mut *mut u16, entropy: *const Blob,
                          reserved: *const c_void, prompt: *const c_void, flags: u32, output: *mut Blob) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(memory: *mut c_void) -> *mut c_void;
}

fn transform(bytes: &[u8], protect: bool) -> Option<Vec<u8>> {
    let input = Blob { size: bytes.len() as u32, data: bytes.as_ptr() as *mut u8 };
    let mut output = Blob { size: 0, data: null_mut() };
    let ok = unsafe {
        if protect {
            CryptProtectData(&input, null(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&input, null_mut(), null(), null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if ok == 0 {
        return None;
    }
    let result = unsafe { std::slice::from_raw_parts(output.data, output.size as usize) }.to_vec();
    unsafe { LocalFree(output.data as *mut c_void) };
    Some(result)
}

fn folder() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Ven"))
}

pub fn load() -> Option<String> {
    let sealed = std::fs::read(folder()?.join("curseforge.key")).ok()?;
    String::from_utf8(transform(&sealed, false)?).ok()
}

pub fn save(key: &str) -> Result<(), String> {
    let dir = folder().ok_or("could not find the local app data folder")?;
    let file = dir.join("curseforge.key");
    if key.is_empty() {
        let _ = std::fs::remove_file(&file);
        return Ok(());
    }
    let sealed = transform(key.as_bytes(), true).ok_or("could not protect the key")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not save the key: {e}"))?;
    std::fs::write(&file, sealed).map_err(|e| format!("could not save the key: {e}"))
}
