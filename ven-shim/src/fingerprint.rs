use std::io::Read;
use std::path::Path;

const M: u32 = 0x5bd1_e995;

fn significant(byte: &u8) -> bool {
    !matches!(byte, 9 | 10 | 13 | 32)
}

fn each_chunk(path: &Path, mut visit: impl FnMut(&[u8])) -> std::io::Result<()> {
    let mut file = std::fs::File::open(path)?;
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            return Ok(());
        }
        visit(&buffer[..read]);
    }
}

pub fn of(path: &Path) -> std::io::Result<u32> {
    let mut length = 0u32;
    each_chunk(path, |chunk| {
        length = length.wrapping_add(chunk.iter().filter(|b| significant(b)).count() as u32);
    })?;

    let mut hash = 1 ^ length;
    let mut word = 0u32;
    let mut filled = 0;
    each_chunk(path, |chunk| {
        for &byte in chunk.iter().filter(|b| significant(b)) {
            word |= (byte as u32) << (8 * filled);
            filled += 1;
            if filled == 4 {
                let mut k = word.wrapping_mul(M);
                k ^= k >> 24;
                hash = hash.wrapping_mul(M) ^ k.wrapping_mul(M);
                word = 0;
                filled = 0;
            }
        }
    })?;

    if filled > 0 {
        hash = (hash ^ word).wrapping_mul(M);
    }
    hash ^= hash >> 13;
    hash = hash.wrapping_mul(M);
    Ok(hash ^ (hash >> 15))
}
