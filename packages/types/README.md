# @hashbuf/types

[![NPM](https://img.shields.io/npm/v/@hashbuf/types.svg)](https://www.npmjs.com/package/@hashbuf/types)

Shared type definitions for hashbuf packages.

## Install

```bash
npm install @hashbuf/types
```

## Interfaces

### `Hasher`

A streaming hasher that accumulates data incrementally.

```ts
interface Hasher {
    update(data: Uint8Array): this;
    finalize(): Uint8Array;
    reset(): this;
    free(): void;
    digest(): Uint8Array;
    digest(encoding: 'hex'): string;
}
```

### `HashAlgorithm`

A hash algorithm providing both one-shot and streaming APIs.

```ts
interface HashAlgorithm {
    readonly name: string;
    readonly digestLength: number;
    hash(data: Uint8Array): Uint8Array;
    doubleHash(data: Uint8Array): Uint8Array;
    createHasher(): Hasher;
    stream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array>;
}
```

## License

Apache-2.0
