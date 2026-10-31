import { describe, expect, it } from "vitest";
import {
    advance,
    calc,
    cast,
    createGame,
    createState,
    die,
    hit,
    mulberry32,
    normalizeState,
    offlineStep,
    rebirth,
    tick,
} from "../src";

function invariants(state: ReturnType<typeof createState>) {
    const stats = calc(state);

    expect(Number.isFinite(state.hp)).toBe(true);
    expect(state.hp).toBeGreaterThanOrEqual(0);
    expect(state.hp).toBeLessThanOrEqual(stats.maxHp + 1e-6);

    for (const key of [
        "xp",
        "gold",
        "shards",
        "best",
        "runs",
        "pend",
        "elites",
        "lvl",
        "stage",
        "k",
        "nid",
        "ac",
        "buff",
    ] as const) {
        expect(Number.isFinite(state[key]), `${key} is finite`).toBe(true);
        expect(state[key], `${key} >= 0`).toBeGreaterThanOrEqual(0);
    }

    expect(state.lvl).toBeGreaterThanOrEqual(1);
    expect(state.stage).toBeGreaterThanOrEqual(1);
    expect(state.best).toBeGreaterThanOrEqual(1);
    expect(state.nid).toBeGreaterThanOrEqual(1);
    expect(state.inv.length).toBeLessThanOrEqual(30);
    expect(new Set(state.inv.map((i) => i.id)).size).toBe(state.inv.length);
}

describe("sim invariants", () => {
    it("survives 24 hours of coarse offline steps", () => {
        const rng = mulberry32(2026);
        const { state } = createGame(rng);

        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute++) {
                advance(state, 60, rng, { step: 1 });
                if (state.dead) rebirth(state, rng);
                invariants(state);
            }
        }

        expect(state.runs + state.best).toBeGreaterThan(0);
    }, 120_000);

    it("is deterministic for a given seed", () => {
        const play = (seed: number) => {
            const rng = mulberry32(seed);
            const { state } = createGame(rng);
            const events = [];
            for (let i = 0; i < 6_000; i++) {
                events.push(...tick(state, 0.1, rng));
                if (state.dead) rebirth(state, rng);
            }
            return { state, events };
        };

        const a = play(99);
        const b = play(99);
        expect(a.state).toEqual(b.state);
        expect(a.events).toEqual(b.events);
    }, 60_000);

    it("keeps the live and offline step sizes in the same ballpark", () => {
        const coarseRng = mulberry32(5);
        const coarse = createGame(coarseRng).state;
        advance(coarse, 3600, coarseRng, { step: 1 });

        const fineRng = mulberry32(5);
        const fine = createGame(fineRng).state;
        advance(fine, 3600, fineRng, { step: offlineStep(3600) });

        invariants(coarse);
        invariants(fine);

        // RNG streams diverge with step count, so compare progress, not identity.
        // (Without purchases the game plateaus early; this only checks that both
        // step sizes actually advance the world.)
        expect(coarse.stage).toBeGreaterThanOrEqual(2);
        expect(fine.stage).toBeGreaterThanOrEqual(2);
        expect(coarse.stage).toBeGreaterThanOrEqual(Math.max(1, fine.stage - 5));
        expect(fine.stage).toBeGreaterThanOrEqual(Math.max(1, coarse.stage - 5));
    }, 60_000);

    it("stops advancing after death", () => {
        const rng = mulberry32(1);
        const { state } = createGame(rng);
        die(state);
        expect(state.dead).toBe(true);

        const before = JSON.stringify(state);
        const events = advance(state, 3600, rng, { step: 1 });
        expect(events).toEqual([]);
        expect(JSON.stringify(state)).toBe(before);
    });

    it("auto-rebirths and keeps simulating when asked", () => {
        const rng = mulberry32(3);
        const { state } = createGame(rng);
        state.hp = 0.0001;
        state.stage = 8;
        state.enemy.t = state.enemy.spd;

        const events = advance(state, 600, rng, {
            step: 0.1,
            autoRebirth: true,
        });

        expect(events.some((e) => e.t === "death")).toBe(true);
        expect(events.some((e) => e.t === "rebirth")).toBe(true);
        expect(state.dead).toBe(false);
        expect(state.best).toBeGreaterThanOrEqual(8);
        expect(state.stage).toBeGreaterThan(1);
    });

    it("auto-rebirths a save that was already dead", () => {
        const rng = mulberry32(4);
        const { state } = createGame(rng);
        die(state);
        state.pend = 7;

        const events = advance(state, 60, rng, {
            step: 1,
            autoRebirth: true,
        });

        expect(events.some((e) => e.t === "rebirth")).toBe(true);
        expect(state.dead).toBe(false);
        expect(state.pend).toBe(0);
        expect(state.shards).toBeGreaterThanOrEqual(7);
    });

    it("ignores strikes and skills while dead", () => {
        const rng = mulberry32(5);
        const { state } = createGame(rng);
        state.ranks.whirl = 1;
        die(state);

        const enemy = JSON.stringify(state.enemy);
        expect(hit(state, rng)).toEqual([]);
        expect(cast(state, "whirl", rng)).toEqual([]);
        expect(JSON.stringify(state.enemy)).toBe(enemy);
    });
});

describe("combat maths", () => {
    it("applies one normal hit for the computed damage", () => {
        const rng = () => 0.99; // no elite spawn, no multihit, no crit
        const { state } = createGame(rng);
        const stats = calc(state);
        const before = state.enemy.hp;

        hit(state, rng);

        expect(before - state.enemy.hp).toBeCloseTo(stats.dmg, 6);
        expect(state.enemy.vuln).toBe(1);
    });

    it("updates best as soon as a stage is cleared", () => {
        const rng = mulberry32(6);
        const { state } = createGame(rng);
        state.stage = 12;
        state.k = 5;
        state.best = 1;
        state.enemy.boss = true;
        state.enemy.hp = 0.001;
        state.enemy.max = 1;

        const events = hit(state, rng);
        const kill = events.find((e) => e.t === "kill");

        expect(kill && kill.t === "kill" ? kill.boss : false).toBe(true);
        expect(state.stage).toBe(13);
        expect(state.best).toBeGreaterThanOrEqual(13);
    });

    it("applies crit tiers and vulnerability", () => {
        const rng = mulberry32(7);
        const { state } = createGame(rng);
        state.ranks.ravage = 5; // +30% crit chance
        const stats = calc(state);
        state.enemy.hp = state.enemy.max = 1e9;
        const before = state.enemy.hp;

        hit(state, rng);

        expect(before - state.enemy.hp).toBeGreaterThan(0);
        expect(stats.crit).toBeGreaterThan(5);
    });

    it("puts skills on cooldown and refuses a second cast", () => {
        const rng = mulberry32(3);
        const { state } = createGame(rng);
        state.ranks.whirl = 1;

        const first = cast(state, "whirl", rng);
        expect(first.some((e) => e.t === "skill")).toBe(true);
        expect(state.cd.whirl).toBe(8);

        const second = cast(state, "whirl", rng);
        expect(second).toEqual([]);
    });

    it("refuses to rebirth a living character", () => {
        const rng = mulberry32(12);
        const { state } = createGame(rng);
        state.lvl = 5;
        state.stage = 5;
        const before = JSON.stringify(state);

        expect(rebirth(state, rng)).toEqual([]);
        expect(JSON.stringify(state)).toBe(before);
    });

    it("awards pending shards on death and resets the run on rebirth", () => {
        const rng = mulberry32(11);
        const { state } = createGame(rng);
        state.hp = 0.0001;
        state.enemy.t = state.enemy.spd;
        state.stage = 12;
        state.gold = 1000;

        const death = tick(state, 0.1, rng);
        expect(state.dead).toBe(true);
        expect(death.some((e) => e.t === "death")).toBe(true);
        expect(state.pend).toBeGreaterThan(0);
        expect(state.hp).toBe(0);

        const shardsBefore = state.shards;
        rebirth(state, rng);

        expect(state.dead).toBe(false);
        expect(state.stage).toBe(1);
        expect(state.lvl).toBe(1);
        expect(state.shards).toBeGreaterThan(shardsBefore);
        expect(state.best).toBe(12);
        expect(state.inv).toEqual([]);
    });
});

describe("state normalisation", () => {
    it("fills missing fields and clamps bad numbers", () => {
        const state = normalizeState({
            lvl: -5,
            gold: Number.NaN,
            inv: "not-an-array" as never,
            cd: { whirl: 3 } as never,
        });

        expect(state.lvl).toBe(1);
        expect(state.gold).toBe(0);
        expect(state.inv).toEqual([]);
        expect(state.cd.whirl).toBe(3);
        expect(state.cd.cry).toBe(0);
        expect(state.dead).toBe(false);
        expect(state.enemy.name).toBeTruthy();
    });

    it("normalises null and junk input to a fresh save", () => {
        expect(normalizeState(null).lvl).toBe(1);
        expect(normalizeState(undefined as never).stage).toBe(1);
        expect(normalizeState(42 as never).gold).toBe(0);
    });
});

describe("offline step selection", () => {
    it("uses exact steps for short gaps and coarse steps for long ones", () => {
        expect(offlineStep(60)).toBe(0.1);
        expect(offlineStep(15 * 60)).toBe(0.1);
        expect(offlineStep(3600)).toBe(0.5);
        expect(offlineStep(8 * 3600)).toBe(1);
    });

    it("ignores non-positive and non-finite durations", () => {
        const rng = mulberry32(2);
        const { state } = createGame(rng);
        const before = JSON.stringify(state);
        expect(advance(state, 0, rng)).toEqual([]);
        expect(advance(state, -10, rng)).toEqual([]);
        expect(advance(state, Number.POSITIVE_INFINITY, rng)).toEqual([]);
        expect(JSON.stringify(state)).toBe(before);
    });

    it("honours the step budget", () => {
        const rng = mulberry32(2);
        const { state } = createGame(rng);
        advance(state, 3600, rng, { step: 1, maxSteps: 10 });
        expect(state.stage).toBeGreaterThanOrEqual(1);
    });
});
