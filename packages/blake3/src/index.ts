import type { HashAlgorithm, Hasher } from '@hashbuf/types';
import {
    blake3_hash,
    blake3_hex,
    blake3_mac,
    double_blake3_hash,
    Blake3Hasher as WasmBlake3Hasher
} from './wasm-inline/hashbuf_blake3.js';

// ---------------------------------------------------------------------------
// One-shot helpers
// ---------------------------------------------------------------------------

/**
 * Compute BLAKE3 hash of `data` in one shot.
 * Returns a 32-byte `Uint8Array`.
 */
export function blake3(data: Uint8Array): Uint8Array {
    return blake3_hash(data);
}

/**
 * Compute BLAKE3 hash of `data` in one shot, returning a hex string.
 * More efficient than `blake3()` + manual hex conversion — hex encoding
 * is performed in WASM, avoiding intermediate Uint8Array allocation.
 */
export function blake3Hex(data: Uint8Array): string {
    return blake3_hex(data);
}

/**
 * Compute double BLAKE3 hash: `blake3(blake3(data))`.
 * Returns a 32-byte `Uint8Array`.
 */
export function doubleBlake3(data: Uint8Array): Uint8Array {
    return double_blake3_hash(data);
}

/**
 * Compute a BLAKE3 keyed MAC.
 * `key` must be exactly 32 bytes.
 * Returns a 32-byte `Uint8Array`.
 */
export function blake3Mac(key: Uint8Array, data: Uint8Array): Uint8Array {
    return blake3_mac(key, data);
}

// ---------------------------------------------------------------------------
// Streaming hasher
// ---------------------------------------------------------------------------

/**
 * Streaming BLAKE3 hasher backed by WASM.
 *
 * Usage:
 * ```ts
 * const hasher = new Blake3Hasher();
 * hasher.update(chunk1);
 * hasher.update(chunk2);
 * const hash = hasher.finalize(); // 32 bytes
 * hasher.free(); // release WASM memory
 * ```
 *
 * For keyed hashing, pass a 32-byte key to the constructor:
 * ```ts
 * const hasher = new Blake3Hasher(key);
 * ```
 */
export class Blake3Hasher implements Hasher {
    private inner: WasmBlake3Hasher;
    private freed = false;

    /**
     * Create a new BLAKE3 hasher.
     * @param key Optional 32-byte key for keyed hashing (MAC).
     */
    constructor(key?: Uint8Array) {
        if (key !== undefined) {
            this.inner = WasmBlake3Hasher.new_keyed(key);
        } else {
            this.inner = new WasmBlake3Hasher();
        }
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
     * If the hasher was created with a key, the key is preserved.
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
     * Consumptive finalize — returns the hash and releases WASM memory.
     * The hasher must not be used after calling `digest()`.
     *
     * - `digest()` → `Uint8Array` (raw 32 bytes)
     * - `digest('hex')` → `string` (64-char hex, fast path via WASM)
     */
    digest(): Uint8Array;
    digest(encoding: 'hex'): string;
    digest(encoding?: 'hex'): Uint8Array | string {
        if (this.freed) {
            throw new Error('Hasher has been freed');
        }
        this.freed = true;
        if (encoding === 'hex') {
            return this.inner.digestHex();
        }
        return this.inner.digest();
    }

    /**
     * Support for TC39 Explicit Resource Management.
     * Allows `using hasher = new Blake3Hasher()`.
     */
    [Symbol.dispose](): void {
        this.free();
    }
}

// ---------------------------------------------------------------------------
// Streaming helper for async iterables (ReadableStream, fs streams, etc.)
// ---------------------------------------------------------------------------

/**
 * Hash an async iterable of chunks using BLAKE3 streaming.
 * Ideal for hashing large files or network streams without loading
 * the entire content into memory.
 *
 * ```ts
 * const hash = await blake3Stream(readableStream);
 * ```
 */
export async function blake3Stream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const hasher = new Blake3Hasher();
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
 * BLAKE3 as a `HashAlgorithm` — unified interface for all hashbuf algorithms.
 */
export const BLAKE3: HashAlgorithm = {
    name: 'blake3',
    digestLength: 32,
    hash: blake3,
    doubleHash: doubleBlake3,
    createHasher: () => new Blake3Hasher(),
    stream: blake3Stream
} as const;
