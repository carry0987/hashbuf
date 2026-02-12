use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// One-shot functions
// ---------------------------------------------------------------------------

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn sha256_hash(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

/// One-shot SHA-256 hash returning hex string.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn double_sha256_hash(data: &[u8]) -> Vec<u8> {
    let first = sha256_hash(data);
    sha256_hash(&first)
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn sha256_hmac(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let mut mac =
        HmacSha256::new_from_slice(key).map_err(|e| format!("Invalid key: {}", e))?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

// ---------------------------------------------------------------------------
// Streaming hasher
// ---------------------------------------------------------------------------

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct Sha256Hasher {
    inner: Sha256,
    initial: Sha256,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl Sha256Hasher {
    /// Create a new SHA-256 hasher.
    #[cfg_attr(feature = "wasm", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        Sha256Hasher {
            inner: Sha256::new(),
            initial: Sha256::new(),
        }
    }

    /// Feed data into the hasher. Can be called multiple times.
    pub fn update(&mut self, data: &[u8]) {
        self.inner.update(data);
    }

    /// Finalize and return the 32-byte hash.
    /// The hasher state is NOT consumed — you can continue calling `update`
    /// after `finalize` to get incremental hashes.
    pub fn finalize(&self) -> Vec<u8> {
        self.inner.clone().finalize().to_vec()
    }

    /// Reset the hasher to its initial state.
    pub fn reset(&mut self) {
        self.inner = self.initial.clone();
    }

    /// Consumptive finalize: returns 32-byte hash and drops the hasher.
    /// Single WASM boundary crossing (vs finalize + free = 2 crossings).
    pub fn digest(self) -> Box<[u8]> {
        self.inner.finalize().to_vec().into_boxed_slice()
    }

    /// Consumptive finalize returning hex string directly.
    /// Avoids JS-side Uint8Array → hex conversion.
    #[cfg_attr(feature = "wasm", wasm_bindgen(js_name = "digestHex"))]
    pub fn digest_hex(self) -> String {
        hex::encode(self.inner.finalize())
    }
}

impl Default for Sha256Hasher {
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
    use hex::{decode, encode};

    // -- One-shot tests --

    #[test]
    fn test_sha256_empty() {
        let expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let result = sha256_hash(b"");
        assert_eq!(encode(&result), expected);
    }

    #[test]
    fn test_sha256_abc() {
        // NIST test vector
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let result = sha256_hash(b"abc");
        assert_eq!(encode(&result), expected);
    }

    #[test]
    fn test_sha256_long() {
        let input = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
        let expected = "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";
        let result = sha256_hash(input);
        assert_eq!(encode(&result), expected);
    }

    #[test]
    fn test_double_sha256() {
        let expected = "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358";
        let result = double_sha256_hash(b"abc");
        assert_eq!(encode(&result), expected);
    }

    // -- HMAC tests (RFC 4231) --

    #[test]
    fn test_hmac_rfc4231_case1() {
        let key = decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
        let data = b"Hi There";
        let expected = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
        let result = sha256_hmac(&key, data).unwrap();
        assert_eq!(encode(&result), expected);
    }

    #[test]
    fn test_hmac_rfc4231_case2() {
        let key = b"Jefe";
        let data = b"what do ya want for nothing?";
        let expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
        let result = sha256_hmac(key, data).unwrap();
        assert_eq!(encode(&result), expected);
    }

    // -- Streaming tests --

    #[test]
    fn test_streaming_matches_oneshot() {
        let data = b"test input for streaming";
        let oneshot = sha256_hash(data);

        let mut hasher = Sha256Hasher::new();
        hasher.update(data);
        let streamed = hasher.finalize();

        assert_eq!(oneshot, streamed);
    }

    #[test]
    fn test_streaming_multi_chunk() {
        let data = b"hello world";
        let oneshot = sha256_hash(data);

        let mut hasher = Sha256Hasher::new();
        hasher.update(b"hello");
        hasher.update(b" ");
        hasher.update(b"world");
        let streamed = hasher.finalize();

        assert_eq!(oneshot, streamed);
    }

    #[test]
    fn test_streaming_finalize_no_consume() {
        let mut hasher = Sha256Hasher::new();
        hasher.update(b"abc");
        let h1 = hasher.finalize();
        let h2 = hasher.finalize();
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_streaming_reset() {
        let mut hasher = Sha256Hasher::new();
        hasher.update(b"garbage");
        hasher.reset();
        hasher.update(b"abc");
        let result = hasher.finalize();
        let expected = sha256_hash(b"abc");
        assert_eq!(result, expected);
    }

    #[test]
    fn test_sha256_hex() {
        let hex = sha256_hex(b"abc");
        assert_eq!(
            hex,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn test_sha256_hex_empty() {
        let hex = sha256_hex(b"");
        assert_eq!(
            hex,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_digest_matches_finalize() {
        let mut hasher1 = Sha256Hasher::new();
        hasher1.update(b"abc");
        let finalized = hasher1.finalize();

        let mut hasher2 = Sha256Hasher::new();
        hasher2.update(b"abc");
        let digested = hasher2.digest();

        assert_eq!(finalized, digested.to_vec());
    }

    #[test]
    fn test_digest_hex_matches() {
        let mut hasher = Sha256Hasher::new();
        hasher.update(b"abc");
        let hex = hasher.digest_hex();
        assert_eq!(
            hex,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
