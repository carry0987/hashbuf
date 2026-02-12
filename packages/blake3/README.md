# @hashbuf/blake3

[![NPM](https://img.shields.io/npm/v/@hashbuf/blake3.svg)](https://www.npmjs.com/package/@hashbuf/blake3)

BLAKE3 cryptographic hash function powered by Rust/WASM. Supports one-shot hashing, double hashing, keyed MAC, and incremental streaming.

## Install

```bash
npm install @hashbuf/blake3
```

## Usage

### One-shot hashing

```ts
import { blake3, blake3Hex, doubleBlake3, blake3Mac } from '@hashbuf/blake3';

const data = new TextEncoder().encode('hello');

const hash = blake3(data);           // Uint8Array (32 bytes)
const hex  = blake3Hex(data);        // hex string (64 chars)
const dhash = doubleBlake3(data);    // blake3(blake3(data))
const mac = blake3Mac(key32, data);  // keyed MAC (key must be 32 bytes)
```

### Streaming

```ts
import { Blake3Hasher } from '@hashbuf/blake3';

const hasher = new Blake3Hasher();
hasher.update(chunk1);
hasher.update(chunk2);
const hash = hasher.finalize(); // non-consumptive, can continue updating
hasher.free();
```

With consumptive `digest()` (mirrors `node:crypto` style):

```ts
const hasher = new Blake3Hasher();
hasher.update(chunk1);
hasher.update(chunk2);
const hash = hasher.digest();       // Uint8Array, auto-frees hasher
// or
const hex = hasher.digest('hex');   // hex string, single WASM call
```

With TC39 Explicit Resource Management:

```ts
using hasher = new Blake3Hasher();
hasher.update(data);
const hash = hasher.finalize();
```

### Async stream

```ts
import { blake3Stream } from '@hashbuf/blake3';

const hash = await blake3Stream(readableStream);
```

### HashAlgorithm interface

```ts
import { BLAKE3 } from '@hashbuf/blake3';

BLAKE3.hash(data);          // one-shot
BLAKE3.doubleHash(data);    // double hash
BLAKE3.digestLength;        // 32
BLAKE3.createHasher();      // streaming hasher
await BLAKE3.stream(source); // async stream
```

## API

| Export | Description |
|--------|-------------|
| `blake3(data)` | One-shot BLAKE3 hash → 32 bytes |
| `blake3Hex(data)` | One-shot BLAKE3 hash → hex string |
| `doubleBlake3(data)` | Double BLAKE3 hash → 32 bytes |
| `blake3Mac(key, data)` | Keyed MAC (32-byte key) → 32 bytes |
| `Blake3Hasher` | Streaming hasher class |
| `Blake3Hasher.digest()` | Consumptive finalize → `Uint8Array` (auto-frees) |
| `Blake3Hasher.digest('hex')` | Consumptive finalize → hex `string` (auto-frees) |
| `blake3Stream(source)` | Hash async iterable → 32 bytes |
| `BLAKE3` | `HashAlgorithm` interface singleton |

## License

Apache-2.0
