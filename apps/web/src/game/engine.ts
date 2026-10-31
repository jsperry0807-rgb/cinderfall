// The engine owns the mutable simulation and drives it at 10 Hz.
// React never touches the SimState directly; it subscribes to snapshots.

import {
    apply,
    createGame,
    spawn,
    LOGIC_DT,
    mulberry32,
    normalizeState,
    tick,
    type Action,
    type Rng,
    type SimEvent,
    type SimState,
} from "@cinderfall/sim";

const CACHE_KEY = "cinderfall.preview.v1";
const SAVE_EVERY_MS = 5_000;

export type EngineListener = (state: SimState, events: SimEvent[]) => void;

function randomSeed(): number {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === "function") {
        return c.getRandomValues(new Uint32Array(1))[0]!;
    }
    return Date.now() >>> 0;
}

interface CachedSave {
    state: SimState;
    simClock: number;
}

function readCache(): CachedSave | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
            state?: SimState;
            simClock?: number;
        };
        if (!parsed?.state) return null;
        return {
            state: parsed.state,
            simClock:
                typeof parsed.simClock === "number" && parsed.simClock >= 0
                    ? parsed.simClock
                    : 0,
        };
    } catch {
        return null;
    }
}

function writeCache(state: SimState, simClock: number): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ v: 1, savedAt: Date.now(), state, simClock }),
        );
    } catch {
        // Quota/private mode: keep playing in memory.
    }
}

export class GameEngine {
    private state: SimState | null = null;
    private rng: Rng = mulberry32(randomSeed());
    private listeners = new Set<EngineListener>();
    private raf = 0;
    private last = 0;
    private acc = 0;
    private running = false;
    private dirty = false;
    private lastSave = 0;
    private clock = 0;

    get current(): SimState | null {
        return this.state;
    }

    /** Seconds of simulated game time, as the server expects in PUT bodies. */
    get simClock(): number {
        return this.clock;
    }

    boot(): SimState {
        if (this.state) return this.state;
        const cached = readCache();
        if (cached) {
            this.state = normalizeState(cached.state);
            this.clock = cached.simClock;
        } else {
            this.state = createGame(this.rng).state;
            this.clock = 0;
        }
        return this.state;
    }

    /** Replace the state, e.g. after loading a save from the API (M4). */
    load(state: SimState, simClock = 0): void {
        this.state = normalizeState(state);
        this.clock = Math.max(0, simClock);
        this.acc = 0;
        if (!this.state.dead && this.state.enemy.name === "Nothing") {
            spawn(this.state, this.rng);
        }
        this.emit([]);
    }

    subscribe(fn: EngineListener): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    start(): void {
        this.boot();
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        this.lastSave = this.last;
        this.raf = requestAnimationFrame(this.loop);
        this.emit([]);
    }

    stop(): void {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.persist();
    }

    dispatch(action: Action): SimEvent[] {
        const state = this.boot();
        const events = apply(state, action, this.rng);
        this.dirty = true;
        this.emit(events);
        return events;
    }

    reset(): SimState {
        const state = createGame(this.rng).state;
        this.state = state;
        this.clock = 0;
        this.acc = 0;
        this.dirty = true;
        this.persist();
        this.emit([]);
        return state;
    }

    persist(): void {
        if (!this.state) return;
        writeCache(this.state, this.clock);
        this.dirty = false;
    }

    private emit(events: SimEvent[]): void {
        if (!this.state) return;
        for (const fn of this.listeners) fn(this.state, events);
    }

    private loop = (now: number): void => {
        if (!this.running) return;

        const dt = Math.min(0.5, (now - this.last) / 1000);
        this.last = now;
        this.acc += dt;

        const state = this.state;
        const events: SimEvent[] = [];

        if (state && !state.dead) {
            let steps = 0;
            while (this.acc >= LOGIC_DT && steps < 10) {
                this.acc -= LOGIC_DT;
                steps++;
                events.push(...tick(state, LOGIC_DT, this.rng));
            }
            this.clock += steps * LOGIC_DT;
        } else {
            this.acc = 0;
        }

        if (events.length) {
            this.dirty = true;
            this.emit(events);
        }

        if (this.dirty && now - this.lastSave >= SAVE_EVERY_MS) {
            this.persist();
            this.lastSave = now;
        }

        this.raf = requestAnimationFrame(this.loop);
    };
}

export const engine = new GameEngine();
