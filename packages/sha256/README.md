# @hashbuf/sha256

[![NPM](https://img.shields.io/npm/v/@hashbuf/sha256.svg)](https://www.npmjs.com/package/@hashbuf/sha256)

SHA-256 cryptographic hash function and HMAC-SHA256 powered by Rust/WASM. Supports one-shot hashing, double hashing, HMAC, and incremental streaming.

## Install

```bash
npm install @hashbuf/sha256
```

## Usage

### One-shot hashing

```ts
import { sha256, sha256Hex, doubleSha256, hmacSha256 } from '@hashbuf/sha256';

const data = new TextEncoder().encode('hello');

const hash = sha256(data);              // Uint8Array (32 bytes)
const hex  = sha256Hex(data);           // hex string (64 chars)
const dhash = doubleSha256(data);       // sha256(sha256(data))
const mac = hmacSha256(key, data);      // HMAC-SHA256
```

### Streaming

```ts
import { Sha256Hasher } from '@hashbuf/sha256';

const hasher = new Sha256Hasher();
hasher.update(chunk1);
hasher.update(chunk2);
const hash = hasher.finalize(); // non-consumptive, can continue updating
hasher.free();
```

With consumptive `digest()` (mirrors `node:crypto` style):

```ts
const hasher = new Sha256Hasher();
hasher.update(chunk1);
hasher.update(chunk2);
const hash = hasher.digest();       // Uint8Array, auto-frees hasher
// or
const hex = hasher.digest('hex');   // hex string, single WASM call
```

With TC39 Explicit Resource Management:

```ts
using hasher = new Sha256Hasher();
hasher.update(data);
const hash = hasher.finalize();
```

### Async stream

```ts
import { sha256Stream } from '@hashbuf/sha256';

const hash = await sha256Stream(readableStream);
```

### HashAlgorithm interface

```ts
import { SHA256 } from '@hashbuf/sha256';

SHA256.hash(data);          // one-shot
SHA256.doubleHash(data);    // double hash
SHA256.digestLength;        // 32
SHA256.createHasher();      // streaming hasher
await SHA256.stream(source); // async stream
```

## API

| Export | Description |
|--------|-------------|
| `sha256(data)` | One-shot SHA-256 hash → 32 bytes |
| `sha256Hex(data)` | One-shot SHA-256 hash → hex string |
| `doubleSha256(data)` | Double SHA-256 hash → 32 bytes |
| `hmacSha256(key, data)` | HMAC-SHA256 → 32 bytes |
| `Sha256Hasher` | Streaming hasher class |
| `Sha256Hasher.digest()` | Consumptive finalize → `Uint8Array` (auto-frees) |
| `Sha256Hasher.digest('hex')` | Consumptive finalize → hex `string` (auto-frees) |
| `sha256Stream(source)` | Hash async iterable → 32 bytes |
| `SHA256` | `HashAlgorithm` interface singleton |

## License

Apache-2.0
