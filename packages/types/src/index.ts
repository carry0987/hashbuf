/**
 * A streaming hasher that accumulates data incrementally.
 */
export interface Hasher {
    /** Feed data into the hasher. Returns `this` for chaining. */
    update(data: Uint8Array): this;
    /** Finalize and return the hash digest. */
    finalize(): Uint8Array;
    /** Reset the hasher to its initial state. */
    reset(): this;
    /** Release underlying resources (e.g. WASM memory). */
    free(): void;

    /**
     * Consumptive finalize — returns the hash and releases WASM memory.
     * The hasher must not be used after calling `digest()`.
     *
     * Mirrors `node:crypto`'s `Hash.digest()` API:
     * - `digest()` → `Uint8Array` (raw bytes)
     * - `digest('hex')` → `string` (hex-encoded, fast path via WASM)
     */
    digest(): Uint8Array;
    digest(encoding: 'hex'): string;
}

/**
 * A hash algorithm that provides both one-shot and streaming APIs.
 */
export interface HashAlgorithm {
    /** The name of the algorithm (e.g. "blake3", "sha256"). */
    readonly name: string;
    /** The digest length in bytes (e.g. 32 for SHA-256 / BLAKE3). */
    readonly digestLength: number;
    /** Compute a hash in one shot. */
    hash(data: Uint8Array): Uint8Array;
    /** Compute a double hash: `hash(hash(data))`. */
    doubleHash(data: Uint8Array): Uint8Array;
    /** Create a streaming hasher. */
    createHasher(): Hasher;
    /** Hash an async iterable of chunks (streaming). */
    stream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array>;
}
