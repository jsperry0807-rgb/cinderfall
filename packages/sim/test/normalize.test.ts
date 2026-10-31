import { describe, expect, it } from "vitest";
import { calc, createState, normalizeState } from "../src";
import type { Item } from "../src";

const item = (id: number, slot = "weapon", stat = "dmg", val = 5): Item => ({
    id,
    slot: slot as Item["slot"],
    base: "Blade",
    il: 10,
    ri: 1,
    imp: { stat: stat as Item["imp"]["stat"], val },
    aff: [{ t: "s", stat: "crit", name: "of Ruin", val: 2 }],
    name: "Test Blade",
    title: null,
    rr: 0,
});

describe("normalizeState hardening", () => {
    it("drops malformed items and duplicate ids", () => {
        const state = normalizeState({
            inv: [
                item(1),
                item(1),
                { ...item(2), slot: "not-a-slot" },
                { ...item(3), imp: { stat: "not-a-stat", val: 1 } },
                { ...item(4), imp: { stat: "dmg", val: Number.NaN } },
                item(5),
            ],
        });

        expect(state.inv.map((i) => i.id)).toEqual([1, 5]);
        expect(state.nid).toBe(6);
    });

    it("caps the bag and keeps only matching equipment slots", () => {
        const inv = Array.from({ length: 40 }, (_, i) => item(i + 1));
        const state = normalizeState({
            inv,
            eq: {
                weapon: item(100, "weapon"),
                helm: item(101, "weapon"),
            },
        });

        expect(state.inv).toHaveLength(30);
        expect(state.eq.weapon?.id).toBe(100);
        expect(state.eq.helm).toBeUndefined();
    });

    it("clamps ranks to node maxima and drops unknown ids", () => {
        const state = normalizeState({
            ranks: { brut: 999, nope: 3, hand: -1 },
            souls: { wrath: 1e9, nope: 1 },
            up: { sharp: 4, nope: 2 },
        });

        expect(state.ranks.brut).toBe(5); // Brutality max
        expect(state.ranks.nope).toBeUndefined();
        expect(state.ranks.hand).toBeUndefined();
        expect(state.souls.wrath).toBe(10_000);
        expect(state.souls.nope).toBeUndefined();
        expect(state.up.sharp).toBe(4);
        expect(state.up.nope).toBeUndefined();
    });

    it("clamps numbers, hp and enemy hp", () => {
        const state = normalizeState({
            lvl: -4,
            gold: Number.POSITIVE_INFINITY,
            shards: -10,
            hp: 1e12,
            dead: "yes" as never,
            enemy: { hp: 999, max: 10 } as never,
            best: 0,
            stage: 8,
        });

        const stats = calc(state);
        expect(state.lvl).toBe(1);
        expect(state.gold).toBe(0);
        expect(state.shards).toBe(0);
        expect(state.hp).toBeLessThanOrEqual(stats.maxHp);
        expect(state.hp).toBe(stats.maxHp);
        expect(state.dead).toBe(false);
        expect(state.enemy.hp).toBe(10);
        expect(state.enemy.max).toBe(10);
        expect(state.best).toBe(8);
    });

    it("strips unknown top-level keys", () => {
        const state = normalizeState({
            ...createState(),
            evil: "<script>",
        } as never);

        expect("evil" in state).toBe(false);
        expect(JSON.stringify(state)).not.toContain("script");
    });
});
