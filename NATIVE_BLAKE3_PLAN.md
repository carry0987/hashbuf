# Native BLAKE3 Implementation Plan

## Goal

Make `@hashbuf/blake3` a single package that:
- Automatically uses **native** BLAKE3 (via napi-rs) on Node.js for hardware-accelerated performance (AVX2/AVX-512/NEON)
- Falls back to **WASM inline** (existing) when native is unavailable (browser, unsupported platform)
- Provides a **Vite plugin** export for SSR frameworks (TanStack-Start, Nuxt, etc.)

---

## Architecture

```
@hashbuf/blake3                          ← single user-facing package
├── dist/browser.js                      ← pure WASM (existing logic)
├── dist/node.js                         ← try native → fallback WASM
├── dist/vite-plugin.js                  ← Vite plugin for SSR external
├── optionalDependencies:
│   ├── @hashbuf-native/blake3-darwin-arm64
│   ├── @hashbuf-native/blake3-darwin-x64
│   ├── @hashbuf-native/blake3-linux-x64-gnu
│   ├── @hashbuf-native/blake3-linux-x64-musl
│   ├── @hashbuf-native/blake3-linux-arm64-gnu
│   ├── @hashbuf-native/blake3-win32-x64-msvc
│   └── ...
```

---

## Step-by-step Tasks

### 1. Register npm scope `@hashbuf-native`

- Go to https://www.npmjs.com/org/create and create the `hashbuf-native` org
- This scope will host platform-specific prebuilt `.node` binaries

### 2. Create napi-rs Rust crate

**Location:** `rust/blake3-native/` (new crate, separate from existing `rust/blake3/`)

**`rust/blake3-native/Cargo.toml`:**
```toml
[package]
name = "hashbuf-blake3-native"
version = "1.0.0"
edition = "2021"
license = "Apache-2.0"

[lib]
crate-type = ["cdylib"]

[dependencies]
blake3 = "1.5"
hex = "0.4"
napi = { version = "2", features = ["napi4"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"
```

**`rust/blake3-native/build.rs`:**
```rust
extern crate napi_build;

fn main() {
    napi_build::setup();
}
```

**`rust/blake3-native/src/lib.rs`:**
```rust
use napi_derive::napi;
use blake3::Hasher;

#[napi]
pub fn blake3_hash(data: &[u8]) -> Vec<u8> {
    blake3::hash(data).as_bytes().to_vec()
}

#[napi]
pub fn blake3_hex(data: &[u8]) -> String {
    hex::encode(blake3::hash(data).as_bytes())
}

#[napi]
pub fn double_blake3_hash(data: &[u8]) -> Vec<u8> {
    let first = blake3::hash(data);
    blake3::hash(first.as_bytes()).as_bytes().to_vec()
}

#[napi]
pub fn blake3_mac(key: &[u8], data: &[u8]) -> napi::Result<Vec<u8>> {
    let key32: [u8; 32] = key
        .try_into()
        .map_err(|_| napi::Error::from_reason("Key must be exactly 32 bytes"))?;
    let mut hasher = Hasher::new_keyed(&key32);
    hasher.update(data);
    Ok(hasher.finalize().as_bytes().to_vec())
}

#[napi]
pub struct NativeBlake3Hasher {
    inner: Hasher,
}

#[napi]
impl NativeBlake3Hasher {
    #[napi(constructor)]
    pub fn new() -> Self {
        NativeBlake3Hasher { inner: Hasher::new() }
    }

    #[napi(factory)]
    pub fn new_keyed(key: &[u8]) -> napi::Result<Self> {
        let key32: [u8; 32] = key
            .try_into()
            .map_err(|_| napi::Error::from_reason("Key must be exactly 32 bytes"))?;
        Ok(NativeBlake3Hasher { inner: Hasher::new_keyed(&key32) })
    }

    #[napi]
    pub fn update(&mut self, data: &[u8]) {
        self.inner.update(data);
    }

    #[napi]
    pub fn finalize(&self) -> Vec<u8> {
        self.inner.finalize().as_bytes().to_vec()
    }

    #[napi]
    pub fn reset(&mut self) {
        self.inner.reset();
    }

    #[napi]
    pub fn digest(&mut self) -> Vec<u8> {
        let hash = self.inner.finalize().as_bytes().to_vec();
        // Reset after digest to mimic consumptive behavior
        self.inner.reset();
        hash
    }

    #[napi]
    pub fn digest_hex(&mut self) -> String {
        let hash = self.inner.finalize();
        let hex = hex::encode(hash.as_bytes());
        self.inner.reset();
        hex
    }
}
```

### 3. Configure napi-rs package.json

**Location:** `rust/blake3-native/package.json` (napi-rs uses this for `napi build`)

```jsonc
{
  "name": "@hashbuf/blake3-native-binding",
  "version": "1.0.0",
  "private": true,
  "napi": {
    "binaryName": "blake3",
    "packageName": "@hashbuf-native/blake3",
    "targets": [
      "x86_64-apple-darwin",
      "aarch64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "x86_64-unknown-linux-musl",
      "aarch64-unknown-linux-gnu",
      "aarch64-unknown-linux-musl",
      "x86_64-pc-windows-msvc",
      "aarch64-pc-windows-msvc"
    ]
  }
}
```

This will generate platform packages like:
- `@hashbuf-native/blake3-darwin-arm64`
- `@hashbuf-native/blake3-darwin-x64`
- `@hashbuf-native/blake3-linux-x64-gnu`
- etc.

### 4. Restructure `packages/blake3/src/`

Current:
```
src/
  index.ts              ← single entry, WASM only
  wasm-inline/          ← WASM bindings
```

New:
```
src/
  index.ts              ← re-exports (unchanged API surface)
  browser.ts            ← pure WASM implementation (extract from current index.ts)
  node.ts               ← try native → fallback to browser.ts
  native.ts             ← native binding loader
  vite-plugin.ts        ← Vite plugin
  wasm-inline/          ← WASM bindings (unchanged)
```

### 5. Implement `src/native.ts` — Native binding loader

```ts
import type { HashAlgorithm, Hasher } from '@hashbuf/types';

interface NativeBinding {
    blake3Hash(data: Uint8Array): Uint8Array;
    blake3Hex(data: Uint8Array): string;
    doubleBlake3Hash(data: Uint8Array): Uint8Array;
    blake3Mac(key: Uint8Array, data: Uint8Array): Uint8Array;
    NativeBlake3Hasher: {
        new(): NativeHasherInstance;
        newKeyed(key: Uint8Array): NativeHasherInstance;
    };
}

interface NativeHasherInstance {
    update(data: Uint8Array): void;
    finalize(): Uint8Array;
    reset(): void;
    digest(): Uint8Array;
    digestHex(): string;
}

let binding: NativeBinding | null = null;

export function loadNativeBinding(): NativeBinding | null {
    if (binding !== null) return binding;
    try {
        // Use createRequire to avoid bundler static analysis
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        binding = require('@hashbuf-native/blake3');
        return binding;
    } catch {
        return null;
    }
}
```

> **Note:** The exact loading mechanism needs care. napi-rs generates an `index.js` in the main package that auto-detects platform and loads the correct `.node` file. We leverage that.

### 6. Implement `src/browser.ts` — WASM-only entry

Extract the current `index.ts` logic into `browser.ts` — **no changes to functionality**, just a file rename/move. This file will:
- Import from `./wasm-inline/`
- Export all functions: `blake3`, `blake3Hex`, `doubleBlake3`, `blake3Mac`, `Blake3Hasher`, `blake3Stream`, `BLAKE3`

### 7. Implement `src/node.ts` — Node entry with native preference

```ts
import type { HashAlgorithm, Hasher } from '@hashbuf/types';

// Always import WASM as fallback
import * as wasm from './browser.js';

// Attempt native load
let native: NativeBinding | null = null;
try {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    native = req('@hashbuf-native/blake3');
} catch {
    // native unavailable, will use WASM
}

export function blake3(data: Uint8Array): Uint8Array {
    return native ? native.blake3Hash(data) : wasm.blake3(data);
}

export function blake3Hex(data: Uint8Array): string {
    return native ? native.blake3Hex(data) : wasm.blake3Hex(data);
}

export function doubleBlake3(data: Uint8Array): Uint8Array {
    return native ? native.doubleBlake3Hash(data) : wasm.doubleBlake3(data);
}

export function blake3Mac(key: Uint8Array, data: Uint8Array): Uint8Array {
    return native ? native.blake3Mac(key, data) : wasm.blake3Mac(key, data);
}

// Blake3Hasher class wraps native or WASM hasher
// ... (adapter pattern, same interface)

export class Blake3Hasher implements Hasher {
    // If native available, use NativeBlake3Hasher
    // Otherwise delegate to wasm.Blake3Hasher
}

// blake3Stream, BLAKE3 algorithm object — same pattern
```

### 8. Implement `src/vite-plugin.ts`

```ts
import type { Plugin } from 'vite';

export function blake3Plugin(): Plugin {
    return {
        name: 'hashbuf-blake3-native',
        config() {
            return {
                ssr: {
                    external: ['@hashbuf-native/blake3']
                }
            };
        }
    };
}
```

### 9. Update `src/index.ts` — Re-export entry

```ts
// Main entry just re-exports everything
// Conditional exports in package.json will route to node.ts or browser.ts
export {
    blake3,
    blake3Hex,
    doubleBlake3,
    blake3Mac,
    Blake3Hasher,
    blake3Stream,
    BLAKE3
} from './browser.js'; // default; overridden by conditional exports
```

### 10. Update `packages/blake3/package.json`

```jsonc
{
  "name": "@hashbuf/blake3",
  "version": "2.0.0",
  "exports": {
    ".": {
      "node": {
        "types": "./dist/node.d.ts",
        "import": "./dist/node.js"
      },
      "default": {
        "types": "./dist/browser.d.ts",
        "import": "./dist/browser.js"
      }
    },
    "./vite": {
      "types": "./dist/vite-plugin.d.ts",
      "import": "./dist/vite-plugin.js"
    },
    "./wasm": {
      "types": "./dist/browser.d.ts",
      "import": "./dist/browser.js"
    }
  },
  "optionalDependencies": {
    "@hashbuf-native/blake3-darwin-arm64": "1.0.0",
    "@hashbuf-native/blake3-darwin-x64": "1.0.0",
    "@hashbuf-native/blake3-linux-x64-gnu": "1.0.0",
    "@hashbuf-native/blake3-linux-x64-musl": "1.0.0",
    "@hashbuf-native/blake3-linux-arm64-gnu": "1.0.0",
    "@hashbuf-native/blake3-linux-arm64-musl": "1.0.0",
    "@hashbuf-native/blake3-win32-x64-msvc": "1.0.0",
    "@hashbuf-native/blake3-win32-arm64-msvc": "1.0.0"
  },
  "dependencies": {
    "@hashbuf/types": "workspace:^"
  }
}
```

Additional export `./wasm` provides an explicit WASM-only entry for users who want to bypass native detection.

### 11. GitHub Actions workflow (user handles)

CI will use `@napi-rs/cli` to:
1. Cross-compile for each target
2. Publish each `@hashbuf-native/blake3-{platform}` package
3. Publish the main `@hashbuf/blake3` package

### 12. Tests

- Existing tests in `packages/blake3/test/index.test.ts` should pass with both WASM and native paths
- Add a test that verifies fallback behavior (mock native unavailable)
- Add a test that verifies native loads correctly on CI (platform-specific)

---

## User Experience Summary

```bash
npm install @hashbuf/blake3
```

```ts
// Works everywhere — auto-selects native or WASM
import { blake3, Blake3Hasher, BLAKE3 } from '@hashbuf/blake3';

// Explicit WASM-only (if needed)
import { blake3 } from '@hashbuf/blake3/wasm';
```

```ts
// Vite SSR users add one plugin
import { blake3Plugin } from '@hashbuf/blake3/vite';

export default defineConfig({
  plugins: [blake3Plugin()]
});
```

---

## File Change Summary

| File | Action |
|---|---|
| `rust/blake3-native/` | **NEW** — napi-rs crate |
| `rust/blake3-native/Cargo.toml` | **NEW** |
| `rust/blake3-native/build.rs` | **NEW** |
| `rust/blake3-native/src/lib.rs` | **NEW** |
| `rust/blake3-native/package.json` | **NEW** — napi-rs config |
| `rust/Cargo.toml` | **EDIT** — add `blake3-native` to workspace members |
| `packages/blake3/src/browser.ts` | **NEW** — extract from current index.ts |
| `packages/blake3/src/node.ts` | **NEW** — native + fallback |
| `packages/blake3/src/native.ts` | **NEW** — native loader (optional, may inline in node.ts) |
| `packages/blake3/src/vite-plugin.ts` | **NEW** |
| `packages/blake3/src/index.ts` | **EDIT** — becomes re-export |
| `packages/blake3/package.json` | **EDIT** — conditional exports + optionalDeps |
| `packages/blake3/tsconfig.build.json` | **EDIT** — include new files |
| `.github/workflows/` | **NEW** — napi-rs CI (user handles) |
