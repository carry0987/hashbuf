import { describe, expect, it } from 'vitest';
import { doubleSha256, hmacSha256, SHA256, Sha256Hasher, sha256, sha256Stream } from '../src/index.js';

// Helper to convert Uint8Array to hex string
function toHex(buf: Uint8Array): string {
    return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function fromHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

// ---------------------------------------------------------------------------
// One-shot
// ---------------------------------------------------------------------------

describe('sha256 one-shot', () => {
    it('hashes empty input', () => {
        const hash = sha256(new Uint8Array(0));
        expect(toHex(hash)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it("hashes 'abc' (NIST vector)", () => {
        const hash = sha256(new TextEncoder().encode('abc'));
        expect(toHex(hash)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('returns 32 bytes', () => {
        const hash = sha256(new Uint8Array(100));
        expect(hash.length).toBe(32);
    });
});

// ---------------------------------------------------------------------------
// Double SHA-256
// ---------------------------------------------------------------------------

describe('doubleSha256', () => {
    it("double hashes 'abc'", () => {
        const hash = doubleSha256(new TextEncoder().encode('abc'));
        expect(toHex(hash)).toBe('4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358');
    });

    it('equals sha256(sha256(data))', () => {
        const data = new TextEncoder().encode('test');
        const manual = sha256(sha256(data));
        const double = doubleSha256(data);
        expect(toHex(double)).toBe(toHex(manual));
    });
});

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

describe('hmacSha256', () => {
    it('RFC 4231 Test Case 1', () => {
        const key = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
        const data = new TextEncoder().encode('Hi There');
        const mac = hmacSha256(key, data);
        expect(toHex(mac)).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    });

    it('RFC 4231 Test Case 2', () => {
        const key = new TextEncoder().encode('Jefe');
        const data = new TextEncoder().encode('what do ya want for nothing?');
        const mac = hmacSha256(key, data);
        expect(toHex(mac)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    });
});

// ---------------------------------------------------------------------------
// Streaming hasher
// ---------------------------------------------------------------------------

describe('Sha256Hasher streaming', () => {
    it('matches one-shot for single update', () => {
        const data = new TextEncoder().encode('hello');
        const hasher = new Sha256Hasher();
        hasher.update(data);
        const streamed = hasher.finalize();
        hasher.free();
        expect(toHex(streamed)).toBe(toHex(sha256(data)));
    });

    it('matches one-shot for multiple chunks', () => {
        const full = new TextEncoder().encode('hello world');
        const hasher = new Sha256Hasher();
        hasher.update(new TextEncoder().encode('hello'));
        hasher.update(new TextEncoder().encode(' '));
        hasher.update(new TextEncoder().encode('world'));
        const streamed = hasher.finalize();
        hasher.free();
        expect(toHex(streamed)).toBe(toHex(sha256(full)));
    });

    it('finalize does not consume state', () => {
        const hasher = new Sha256Hasher();
        hasher.update(new TextEncoder().encode('abc'));
        const h1 = hasher.finalize();
        const h2 = hasher.finalize();
        hasher.free();
        expect(toHex(h1)).toBe(toHex(h2));
    });

    it('reset works', () => {
        const hasher = new Sha256Hasher();
        hasher.update(new TextEncoder().encode('garbage'));
        hasher.reset();
        hasher.update(new TextEncoder().encode('abc'));
        const result = hasher.finalize();
        hasher.free();
        expect(toHex(result)).toBe(toHex(sha256(new TextEncoder().encode('abc'))));
    });

    it('allows chaining update calls', () => {
        const hasher = new Sha256Hasher();
        const result = hasher.update(new TextEncoder().encode('a')).update(new TextEncoder().encode('b')).finalize();
        hasher.free();
        expect(toHex(result)).toBe(toHex(sha256(new TextEncoder().encode('ab'))));
    });

    it('throws after free', () => {
        const hasher = new Sha256Hasher();
        hasher.free();
        expect(() => hasher.update(new Uint8Array(1))).toThrow('Hasher has been freed');
        expect(() => hasher.finalize()).toThrow('Hasher has been freed');
    });

    it('free is idempotent', () => {
        const hasher = new Sha256Hasher();
        hasher.free();
        expect(() => hasher.free()).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// sha256Stream
// ---------------------------------------------------------------------------

describe('sha256Stream', () => {
    it('hashes an async iterable', async () => {
        const chunks = [new TextEncoder().encode('hello'), new TextEncoder().encode(' world')];
        async function* gen() {
            for (const c of chunks) {
                yield c;
            }
        }
        const hash = await sha256Stream(gen());
        expect(toHex(hash)).toBe(toHex(sha256(new TextEncoder().encode('hello world'))));
    });

    it('handles empty stream', async () => {
        async function* gen() {
            // empty
        }
        const hash = await sha256Stream(gen());
        expect(toHex(hash)).toBe(toHex(sha256(new Uint8Array(0))));
    });
});

// ---------------------------------------------------------------------------
// HashAlgorithm interface
// ---------------------------------------------------------------------------

describe('SHA256 HashAlgorithm', () => {
    it('has correct metadata', () => {
        expect(SHA256.name).toBe('sha256');
        expect(SHA256.digestLength).toBe(32);
    });

    it('hash matches sha256()', () => {
        const data = new TextEncoder().encode('test');
        expect(toHex(SHA256.hash(data))).toBe(toHex(sha256(data)));
    });

    it('doubleHash matches doubleSha256()', () => {
        const data = new TextEncoder().encode('test');
        expect(toHex(SHA256.doubleHash(data))).toBe(toHex(doubleSha256(data)));
    });

    it('stream matches sha256Stream()', async () => {
        const data = new TextEncoder().encode('streaming test');
        async function* gen() {
            yield data;
        }
        const hash = await SHA256.stream(gen());
        expect(toHex(hash)).toBe(toHex(sha256(data)));
    });

    it('createHasher returns a working Hasher', () => {
        const hasher = SHA256.createHasher();
        hasher.update(new TextEncoder().encode('abc'));
        const result = hasher.finalize();
        hasher.free();
        expect(toHex(result)).toBe(toHex(sha256(new TextEncoder().encode('abc'))));
    });
});
