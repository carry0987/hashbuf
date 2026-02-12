# hashbuf

High-performance hash functions for JavaScript/TypeScript, powered by Rust and WebAssembly.

## Features

- **BLAKE3** — fast cryptographic hash with streaming support
- **SHA-256** — industry-standard hash and HMAC-SHA256
- **Streaming** — incremental hashing via `Hasher` interface and async iterables
- **Synchronous WASM** — WASM is inlined as base64, no async loading required
- **Cross-platform** — works in Node.js, Deno, Bun, and browsers
- **TypeScript-first** — full type definitions with `Uint8Array` I/O
- **TC39 Explicit Resource Management** — `Symbol.dispose` support

## Packages

| Package | Description |
|---------|-------------|
| [`@hashbuf/blake3`](./packages/blake3) | BLAKE3 hash, double hash, keyed MAC, streaming |
| [`@hashbuf/sha256`](./packages/sha256) | SHA-256 hash, double hash, HMAC-SHA256, streaming |
| [`@hashbuf/types`](./packages/types) | Shared `Hasher` and `HashAlgorithm` interfaces |

## Quick Start

```bash
npm install @hashbuf/blake3
# or
npm install @hashbuf/sha256
```

### One-shot hashing

```ts
import { blake3 } from '@hashbuf/blake3';
import { sha256 } from '@hashbuf/sha256';

const data = new TextEncoder().encode('hello');

const b3 = blake3(data);   // Uint8Array (32 bytes)
const s2 = sha256(data);   // Uint8Array (32 bytes)
```

### Streaming

```ts
import { Blake3Hasher } from '@hashbuf/blake3';

const hasher = new Blake3Hasher();
hasher.update(chunk1);
hasher.update(chunk2);
const hash = hasher.finalize(); // 32 bytes
hasher.free(); // release WASM memory
```

Or with TC39 Explicit Resource Management:

```ts
using hasher = new Blake3Hasher();
hasher.update(data);
const hash = hasher.finalize();
// automatically freed when leaving scope
```

### Async stream hashing

```ts
import { blake3Stream } from '@hashbuf/blake3';

const hash = await blake3Stream(readableStream);
```

### Unified `HashAlgorithm` interface

```ts
import { BLAKE3 } from '@hashbuf/blake3';
import { SHA256 } from '@hashbuf/sha256';

function hashWith(algo: HashAlgorithm, data: Uint8Array): Uint8Array {
    return algo.hash(data);
}

hashWith(BLAKE3, data);
hashWith(SHA256, data);
```

## Development

### Prerequisites

- Node.js >= 25.0.0
- pnpm
- Rust toolchain with `wasm-pack`

### Build

```bash
# Install dependencies
pnpm install

# Build everything (Rust → WASM → TypeScript)
pnpm run build:all

# Or step by step:
pnpm run build:rust        # Compile Rust to WASM
pnpm run sync:from-rust    # Copy WASM to TS packages
pnpm run build             # Inline WASM + compile TypeScript
```

### Test

```bash
pnpm test
```

### Lint & Format

```bash
pnpm run check    # Biome lint + format
```

## Architecture

```
hashbuf/
├── rust/              # Rust workspace
│   ├── blake3/        # BLAKE3 Rust crate
│   └── sha256/        # SHA-256 Rust crate
└── packages/          # TypeScript pnpm monorepo
    ├── blake3/        # @hashbuf/blake3
    ├── sha256/        # @hashbuf/sha256
    └── types/         # @hashbuf/types
```

Each hash package follows this pipeline:

1. **Rust** → compile with `wasm-pack` to produce WASM + JS bindings
2. **Inline** → encode WASM binary as base64 for synchronous loading
3. **TypeScript** → wrap with type-safe API and streaming support

## License

Apache-2.0
