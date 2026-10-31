// Deterministic pseudo-random numbers.
//
// The game used Math.random directly. Injecting `Rng` lets the server replay a
// period deterministically (same seed -> same events) and lets tests freeze time.

export type Rng = () => number;

/** mulberry32: tiny, fast, good enough for a single-player game. */
export function mulberry32(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** FNV-1a over a few parts, for seeding from (playerId, clock). */
export function hashSeed(...parts: Array<string | number>): number {
    let h = 0x811c9dc5;
    for (const part of parts) {
        const s = String(part);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
    }
    return h >>> 0;
}
