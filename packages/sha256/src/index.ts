import type { HashAlgorithm, Hasher } from '@hashbuf/types';
import {
    double_sha256_hash,
    sha256_hash,
    sha256_hmac,
    Sha256Hasher as WasmSha256Hasher
} from './wasm-inline/hashbuf_sha256.js';

// ---------------------------------------------------------------------------
// One-shot helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of `data` in one shot.
 * Returns a 32-byte `Uint8Array`.
 */
export function sha256(data: Uint8Array): Uint8Array {
    return sha256_hash(data);
}

/**
 * Compute double SHA-256 hash: `sha256(sha256(data))`.
 * Returns a 32-byte `Uint8Array`.
 */
export function doubleSha256(data: Uint8Array): Uint8Array {
    return double_sha256_hash(data);
}

/**
 * Compute HMAC-SHA256.
 * Returns a 32-byte `Uint8Array`.
 */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    return sha256_hmac(key, data);
}

// ---------------------------------------------------------------------------
// Streaming hasher
// ---------------------------------------------------------------------------

/**
 * Streaming SHA-256 hasher backed by WASM.
 *
 * Usage:
 * ```ts
 * const hasher = new Sha256Hasher();
 * hasher.update(chunk1);
 * hasher.update(chunk2);
 * const hash = hasher.finalize(); // 32 bytes
 * hasher.free(); // release WASM memory
 * ```
 */
export class Sha256Hasher implements Hasher {
    private inner: WasmSha256Hasher;
    private freed = false;

    /** Create a new SHA-256 hasher. */
    constructor() {
        this.inner = new WasmSha256Hasher();
    }

    /**
     * Feed data into the hasher. Can be called multiple times.
     * @returns `this` for chaining.
     */
    update(data: Uint8Array): this {
        if (this.freed) {
            throw new Error('Hasher has been freed');
        }
        this.inner.update(data);
        return this;
    }

    /**
     * Finalize and return the 32-byte hash.
     * The hasher is NOT consumed — you can continue calling `update()`
     * after `finalize()` and call `finalize()` again for an updated hash.
     */
    finalize(): Uint8Array {
        if (this.freed) {
            throw new Error('Hasher has been freed');
        }
        return this.inner.finalize();
    }

    /**
     * Reset the hasher to its initial state.
     * @returns `this` for chaining.
     */
    reset(): this {
        if (this.freed) {
            throw new Error('Hasher has been freed');
        }
        this.inner.reset();
        return this;
    }

    /**
     * Release the underlying WASM memory.
     * The hasher must not be used after calling `free()`.
     */
    free(): void {
        if (!this.freed) {
            this.inner.free();
            this.freed = true;
        }
    }

    /**
     * Support for TC39 Explicit Resource Management.
     * Allows `using hasher = new Sha256Hasher()`.
     */
    [Symbol.dispose](): void {
        this.free();
    }
}

// ---------------------------------------------------------------------------
// Streaming helper for async iterables
// ---------------------------------------------------------------------------

/**
 * Hash an async iterable of chunks using SHA-256 streaming.
 */
export async function sha256Stream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const hasher = new Sha256Hasher();
    try {
        for await (const chunk of source) {
            hasher.update(chunk);
        }
        return hasher.finalize();
    } finally {
        hasher.free();
    }
}

// ---------------------------------------------------------------------------
// HashAlgorithm implementation
// ---------------------------------------------------------------------------

/**
 * SHA-256 as a `HashAlgorithm` — unified interface for all hashbuf algorithms.
 */
export const SHA256: HashAlgorithm = {
    name: 'sha256',
    digestLength: 32,
    hash: sha256,
    doubleHash: doubleSha256,
    createHasher: () => new Sha256Hasher(),
    stream: sha256Stream
} as const;
