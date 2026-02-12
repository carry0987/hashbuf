use blake3::Hasher;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// One-shot functions
// ---------------------------------------------------------------------------

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn blake3_hash(data: &[u8]) -> Vec<u8> {
    let mut hasher = Hasher::new();
    hasher.update(data);
    hasher.finalize().as_bytes().to_vec()
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn double_blake3_hash(data: &[u8]) -> Vec<u8> {
    let first = blake3_hash(data);
    blake3_hash(&first)
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn blake3_mac(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let key32: [u8; 32] = key
        .try_into()
        .map_err(|_| "Key must be exactly 32 bytes".to_string())?;
    let mut hasher = Hasher::new_keyed(&key32);
    hasher.update(data);
    Ok(hasher.finalize().as_bytes().to_vec())
}

// ---------------------------------------------------------------------------
// Streaming hasher
// ---------------------------------------------------------------------------

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct Blake3Hasher {
    inner: Hasher,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl Blake3Hasher {
    /// Create a new hasher (unkeyed).
    #[cfg_attr(feature = "wasm", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Blake3Hasher {
            inner: Hasher::new(),
        }
    }

    /// Create a new keyed hasher. `key` must be exactly 32 bytes.
    pub fn new_keyed(key: &[u8]) -> Result<Blake3Hasher, String> {
        let key32: [u8; 32] = key
            .try_into()
            .map_err(|_| "Key must be exactly 32 bytes".to_string())?;
        Ok(Blake3Hasher {
            inner: Hasher::new_keyed(&key32),
        })
    }

    /// Feed data into the hasher. Can be called multiple times.
    pub fn update(&mut self, data: &[u8]) {
        self.inner.update(data);
    }

    /// Finalize and return the 32-byte hash.
    /// The hasher state is NOT consumed — you can continue calling `update`
    /// after `finalize` to get incremental hashes (e.g. for progress).
    pub fn finalize(&self) -> Vec<u8> {
        self.inner.finalize().as_bytes().to_vec()
    }

    /// Reset the hasher to its initial state, preserving the key if keyed.
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

impl Default for Blake3Hasher {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use hex::encode;

    #[test]
    fn test_hash_empty() {
        let hash = blake3_hash(b"");
        assert_eq!(
            encode(&hash),
            "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
        );
    }

    #[test]
    fn test_hash_known_vector() {
        let hash = blake3_hash(b"test input");
        assert_eq!(
            encode(&hash),
            "aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c"
        );
    }

    #[test]
    fn test_double_hash() {
        let hash = double_blake3_hash(b"test input");
        assert_eq!(
            encode(&hash),
            "f89701be8691e987be5dfc6af49073c1d3faf76fdaa8ae71221f73d7cb2cea60"
        );
    }

    #[test]
    fn test_mac() {
        let key = blake3_hash(b"key");
        let mac = blake3_mac(&key, b"message").unwrap();
        assert_eq!(
            encode(&mac),
            "55603656ac7bd780db8fece23aad002ee008a605540fe3527a260c4b6e3b2b7e"
        );
    }

    #[test]
    fn test_mac_bad_key() {
        let result = blake3_mac(b"short", b"data");
        assert!(result.is_err());
    }

    #[test]
    fn test_streaming_matches_oneshot() {
        let data = b"hello world, this is a streaming test with blake3";
        let oneshot = blake3_hash(data);

        let mut hasher = Blake3Hasher::new();
        hasher.update(&data[..5]);
        hasher.update(&data[5..12]);
        hasher.update(&data[12..]);
        let streamed = hasher.finalize();

        assert_eq!(oneshot, streamed);
    }

    #[test]
    fn test_streaming_byte_by_byte() {
        let data = b"byte by byte";
        let oneshot = blake3_hash(data);

        let mut hasher = Blake3Hasher::new();
        for &b in data.iter() {
            hasher.update(&[b]);
        }
        let streamed = hasher.finalize();

        assert_eq!(oneshot, streamed);
    }

    #[test]
    fn test_streaming_reset() {
        let mut hasher = Blake3Hasher::new();
        hasher.update(b"garbage");
        hasher.reset();
        hasher.update(b"test input");
        let hash = hasher.finalize();

        assert_eq!(
            encode(&hash),
            "aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c"
        );
    }

    #[test]
    fn test_streaming_keyed() {
        let key = blake3_hash(b"key");
        let oneshot_mac = blake3_mac(&key, b"message").unwrap();

        let mut hasher = Blake3Hasher::new_keyed(&key).unwrap();
        hasher.update(b"mes");
        hasher.update(b"sage");
        let streamed_mac = hasher.finalize();

        assert_eq!(oneshot_mac, streamed_mac);
    }

    #[test]
    fn test_finalize_does_not_consume() {
        let mut hasher = Blake3Hasher::new();
        hasher.update(b"hello");
        let h1 = hasher.finalize();
        let h2 = hasher.finalize();
        assert_eq!(h1, h2);

        hasher.update(b" world");
        let h3 = hasher.finalize();
        assert_ne!(h1, h3);
    }
}
