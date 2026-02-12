import { describe, expect, it } from 'vitest';
import { Blake3Hasher, blake3, blake3Hex, blake3Mac, blake3Stream, doubleBlake3 } from '../src/index';

// Helper: convert Uint8Array to hex string
function toHex(buf: Uint8Array): string {
    return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper: string to Uint8Array via TextEncoder
function fromUtf8(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

// ---------------------------------------------------------------------------
// One-shot tests
// ---------------------------------------------------------------------------

describe('blake3 one-shot', () => {
    it('hashes empty input', () => {
        const hash = blake3(fromUtf8(''));
        expect(toHex(hash)).toBe('af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
    });

    it("hashes 'test input'", () => {
        const hash = blake3(fromUtf8('test input'));
        expect(toHex(hash)).toBe('aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c');
    });

    it('returns 32 bytes', () => {
        const hash = blake3(fromUtf8('hello'));
        expect(hash.length).toBe(32);
    });
});

describe('blake3Hex one-shot', () => {
    it('returns hex for empty input', () => {
        expect(blake3Hex(fromUtf8(''))).toBe(
            'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'
        );
    });

    it('returns hex for known input', () => {
        expect(blake3Hex(fromUtf8('test input'))).toBe(
            'aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c'
        );
    });

    it('matches toHex(blake3(data))', () => {
        const data = fromUtf8('consistency check');
        expect(blake3Hex(data)).toBe(toHex(blake3(data)));
    });
});

describe('doubleBlake3', () => {
    it("double hashes 'test input'", () => {
        const hash = doubleBlake3(fromUtf8('test input'));
        expect(toHex(hash)).toBe('f89701be8691e987be5dfc6af49073c1d3faf76fdaa8ae71221f73d7cb2cea60');
    });

    it('equals blake3(blake3(data))', () => {
        const data = fromUtf8('some data to double hash');
        const manual = blake3(blake3(data));
        const builtin = doubleBlake3(data);
        expect(toHex(builtin)).toBe(toHex(manual));
    });
});

describe('blake3Mac', () => {
    it('computes keyed MAC', () => {
        const key = blake3(fromUtf8('key'));
        const mac = blake3Mac(key, fromUtf8('message'));
        expect(toHex(mac)).toBe('55603656ac7bd780db8fece23aad002ee008a605540fe3527a260c4b6e3b2b7e');
    });

    it('throws on invalid key length', () => {
        expect(() => blake3Mac(fromUtf8('short'), fromUtf8('data'))).toThrow('Key must be exactly 32 bytes');
    });
});

// ---------------------------------------------------------------------------
// Streaming hasher tests
// ---------------------------------------------------------------------------

describe('Blake3Hasher streaming', () => {
    it('matches one-shot for single update', () => {
        const data = fromUtf8('test input');
        const hasher = new Blake3Hasher();
        hasher.update(data);
        const hash = hasher.finalize();
        hasher.free();

        expect(toHex(hash)).toBe(toHex(blake3(data)));
    });

    it('matches one-shot for multiple chunks', () => {
        const full = fromUtf8('hello world, this is a streaming test with blake3');
        const oneshot = blake3(full);

        const hasher = new Blake3Hasher();
        hasher.update(full.subarray(0, 5));
        hasher.update(full.subarray(5, 12));
        hasher.update(full.subarray(12));
        const streamed = hasher.finalize();
        hasher.free();

        expect(toHex(streamed)).toBe(toHex(oneshot));
    });

    it('matches one-shot byte by byte', () => {
        const data = fromUtf8('byte by byte');
        const oneshot = blake3(data);

        const hasher = new Blake3Hasher();
        for (let i = 0; i < data.length; i++) {
            hasher.update(data.subarray(i, i + 1));
        }
        const streamed = hasher.finalize();
        hasher.free();

        expect(toHex(streamed)).toBe(toHex(oneshot));
    });

    it('allows chaining update calls', () => {
        const data = fromUtf8('chaining test');
        const hasher = new Blake3Hasher();
        const hash = hasher.update(data.subarray(0, 4)).update(data.subarray(4)).finalize();
        hasher.free();

        expect(toHex(hash)).toBe(toHex(blake3(data)));
    });

    it('finalize does not consume state', () => {
        const hasher = new Blake3Hasher();
        hasher.update(fromUtf8('hello'));
        const h1 = hasher.finalize();
        const h2 = hasher.finalize();
        expect(toHex(h1)).toBe(toHex(h2));

        hasher.update(fromUtf8(' world'));
        const h3 = hasher.finalize();
        expect(toHex(h1)).not.toBe(toHex(h3));
        hasher.free();
    });

    it('reset works', () => {
        const hasher = new Blake3Hasher();
        hasher.update(fromUtf8('garbage data'));
        hasher.reset();
        hasher.update(fromUtf8('test input'));
        const hash = hasher.finalize();
        hasher.free();

        expect(toHex(hash)).toBe('aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c');
    });

    it('keyed hasher matches blake3Mac', () => {
        const key = blake3(fromUtf8('key'));
        const macOneshot = blake3Mac(key, fromUtf8('message'));

        const hasher = new Blake3Hasher(key);
        hasher.update(fromUtf8('mes'));
        hasher.update(fromUtf8('sage'));
        const macStreamed = hasher.finalize();
        hasher.free();

        expect(toHex(macStreamed)).toBe(toHex(macOneshot));
    });

    it('throws after free', () => {
        const hasher = new Blake3Hasher();
        hasher.free();
        expect(() => hasher.update(fromUtf8('x'))).toThrow('Hasher has been freed');
        expect(() => hasher.finalize()).toThrow('Hasher has been freed');
        expect(() => hasher.reset()).toThrow('Hasher has been freed');
    });

    it('free is idempotent', () => {
        const hasher = new Blake3Hasher();
        hasher.free();
        hasher.free(); // should not throw
    });

    it('digest() returns Uint8Array and frees hasher', () => {
        const data = fromUtf8('test input');
        const hasher = new Blake3Hasher();
        hasher.update(data);
        const hash = hasher.digest();
        expect(toHex(hash)).toBe(toHex(blake3(data)));
        // hasher is consumed, should throw on further use
        expect(() => hasher.update(fromUtf8('x'))).toThrow('Hasher has been freed');
    });

    it("digest('hex') returns hex string and frees hasher", () => {
        const data = fromUtf8('test input');
        const hasher = new Blake3Hasher();
        hasher.update(data);
        const hex = hasher.digest('hex');
        expect(hex).toBe('aa4909e14f1389afc428e481ea20ffd9673604711f5afb60a747fec57e4c267c');
        expect(() => hasher.finalize()).toThrow('Hasher has been freed');
    });

    it('digest() matches finalize() output', () => {
        const data = fromUtf8('consistency');
        const hasher1 = new Blake3Hasher();
        hasher1.update(data);
        const finalized = hasher1.finalize();
        hasher1.free();

        const hasher2 = new Blake3Hasher();
        hasher2.update(data);
        const digested = hasher2.digest();

        expect(toHex(digested)).toBe(toHex(finalized));
    });

    it('digest() throws after free', () => {
        const hasher = new Blake3Hasher();
        hasher.free();
        expect(() => hasher.digest()).toThrow('Hasher has been freed');
    });
});

// ---------------------------------------------------------------------------
// blake3Stream async helper
// ---------------------------------------------------------------------------

describe('blake3Stream', () => {
    it('hashes an async iterable', async () => {
        const data = fromUtf8('streaming async iterable test');
        const chunks = [data.subarray(0, 10), data.subarray(10, 20), data.subarray(20)];

        async function* gen() {
            for (const chunk of chunks) {
                yield chunk;
            }
        }

        const hash = await blake3Stream(gen());
        expect(toHex(hash)).toBe(toHex(blake3(data)));
    });

    it('handles single-chunk stream', async () => {
        const data = fromUtf8('single chunk');

        async function* gen() {
            yield data;
        }

        const hash = await blake3Stream(gen());
        expect(toHex(hash)).toBe(toHex(blake3(data)));
    });

    it('handles empty stream', async () => {
        async function* gen(): AsyncGenerator<Uint8Array> {
            // empty
        }

        const hash = await blake3Stream(gen());
        expect(toHex(hash)).toBe('af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
    });
});
