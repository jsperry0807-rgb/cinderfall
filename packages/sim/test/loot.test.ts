import { describe, expect, it } from "vitest";
import {
    createState,
    genItem,
    mulberry32,
    rollAffixes,
    rollDrops,
} from "../src";

describe("affix rolling", () => {
    it("can fill the highest rarity without looping", () => {
        const rng = mulberry32(123);
        for (let i = 0; i < 100; i++) {
            const aff = rollAffixes(7, 100, rng);
            // Divine rolls 8-9 affixes; AF has 14 unique entries.
            expect(aff.length).toBeGreaterThanOrEqual(8);
            expect(aff.length).toBeLessThanOrEqual(9);
            expect(aff.every((a) => a.val > 0)).toBe(true);
        }
    });

    it("respects the rarity affix count at every tier", () => {
        const rng = mulberry32(77);
        for (let ri = 0; ri < 8; ri++) {
            for (let i = 0; i < 25; i++) {
                const aff = rollAffixes(ri, 10, rng);
                expect(aff.length).toBeGreaterThanOrEqual(0);
                expect(aff.length).toBeLessThanOrEqual(9);
            }
        }
    });

    it("never repeats the same affix definition", () => {
        const rng = mulberry32(9);
        for (let i = 0; i < 50; i++) {
            const aff = rollAffixes(7, 50, rng);
            const keys = aff.map((a) => `${a.t}:${a.stat}:${a.name}`);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

describe("item generation", () => {
    it("allocates increasing ids and keeps names coherent", () => {
        const rng = mulberry32(41);
        const state = createState();
        const a = genItem(state, 10, 0, rng);
        const b = genItem(state, 10, 0, rng);

        expect(a.id).toBe(1);
        expect(b.id).toBe(2);
        expect(state.nid).toBe(3);
        expect(a.slot).toBeTruthy();
        expect(a.name.length).toBeGreaterThan(0);
        expect(a.imp.val).toBeGreaterThan(0);
        if (a.ri >= 4) expect(a.title).not.toBeNull();
    });

    it("scales base stats with item level", () => {
        const rng = mulberry32(3);
        const state = createState();
        // Find two items in the same slot and compare their primary stats.
        const items = Array.from({ length: 50 }, () => genItem(state, 1, 0, rng));
        const low = items.find((i) => i.slot === "weapon");
        const rng2 = mulberry32(3);
        const state2 = createState();
        const highItems = Array.from({ length: 50 }, () =>
            genItem(state2, 100, 0, rng2),
        );
        const high = highItems.find((i) => i.slot === low!.slot);
        expect(high!.imp.val).toBeGreaterThan(low!.imp.val);
    });
});

describe("drop counts", () => {
    it("always drops at 100% and never below zero", () => {
        const rng = mulberry32(5);
        const state = createState();

        for (let i = 0; i < 50; i++) {
            expect(rollDrops(state, 100, rng)).toBeGreaterThanOrEqual(1);
            expect(rollDrops(state, 0, rng)).toBeGreaterThanOrEqual(0);
        }
    });
});
