import { describe, expect, it } from "vitest";
import {
    apply,
    calc,
    createGame,
    gearScore,
    mulberry32,
    rerollCost,
    sCost,
    SOULS,
    upCost,
    UPGRADES,
} from "../src";
import type { Item, SlotId } from "../src";

const mkItem = (id: number, slot: SlotId, dmg: number): Item => ({
    id,
    slot,
    base: "Test Blade",
    il: 10,
    ri: 2,
    imp: { stat: "dmg", val: dmg },
    aff: [],
    name: `Test Blade ${id}`,
    title: null,
    rr: 0,
});

function game(seed = 1) {
    const rng = mulberry32(seed);
    return { rng, state: createGame(rng).state };
}

describe("skill tree actions", () => {
    it("buys nodes, respects prerequisites, max ranks and points", () => {
        const { rng, state } = game();
        state.lvl = 10; // 9 points

        expect(apply(state, { type: "buyNode", id: "hand" }, rng)[0]).toMatchObject({
            t: "error",
            code: "locked",
        });

        for (let i = 0; i < 5; i++) {
            const ev = apply(state, { type: "buyNode", id: "brut" }, rng);
            expect(ev[0]?.t).toBe("buy");
        }
        expect(state.ranks.brut).toBe(5);

        expect(apply(state, { type: "buyNode", id: "brut" }, rng)[0]).toMatchObject({
            t: "error",
            code: "invalid",
        });

        expect(apply(state, { type: "buyNode", id: "hand" }, rng)[0]?.t).toBe("buy");
        // 5 + 1 points spent; lvl 10 gives 9.
        expect(state.ranks.hand).toBe(1);
    });

    it("reports missing points", () => {
        const { rng, state } = game();
        state.lvl = 1;
        expect(apply(state, { type: "buyNode", id: "brut" }, rng)[0]).toMatchObject({
            t: "error",
            code: "points",
        });
    });

    it("respecs for gold and refunds the points", () => {
        const { rng, state } = game();
        state.lvl = 10;
        state.ranks = { brut: 3 };
        state.gold = 1000;

        const ev = apply(state, { type: "respec" }, rng);
        expect(ev[0]).toMatchObject({ t: "respec", points: 3 });
        expect(state.ranks).toEqual({});
        expect(state.gold).toBe(1000 - 10 * 50);
    });

    it("refuses respec without gold or points", () => {
        const { rng, state } = game();
        state.lvl = 10;
        expect(apply(state, { type: "respec" }, rng)[0]).toMatchObject({
            t: "error",
            code: "invalid",
        });

        state.ranks = { brut: 1 };
        state.gold = 0;
        expect(apply(state, { type: "respec" }, rng)[0]).toMatchObject({
            t: "error",
            code: "gold",
        });
    });
});

describe("currency actions", () => {
    it("buys souls one at a time and in bulk", () => {
        const { rng, state } = game();
        const wrath = SOULS.find((s) => s.id === "wrath")!;
        state.shards = 100;

        expect(apply(state, { type: "buySoul", id: "wrath" }, rng)[0]?.t).toBe("buy");
        expect(state.souls.wrath).toBe(1);
        expect(state.shards).toBe(100 - sCost(wrath, 0));

        const before = state.shards;
        apply(state, { type: "buySoul", id: "wrath", max: true }, rng);
        expect(state.souls.wrath).toBeGreaterThan(1);
        expect(state.shards).toBeLessThan(before);
        expect(state.shards).toBeGreaterThanOrEqual(0);
    });

    it("reports missing shards", () => {
        const { rng, state } = game();
        state.shards = 0;
        expect(
            apply(state, { type: "buySoul", id: "wrath" }, rng)[0],
        ).toMatchObject({ t: "error", code: "shards" });
    });

    it("buys forge upgrades one at a time and in bulk", () => {
        const { rng, state } = game();
        const sharp = UPGRADES.find((u) => u.id === "sharp")!;
        state.gold = 1000;

        expect(
            apply(state, { type: "buyUpgrade", id: "sharp" }, rng)[0]?.t,
        ).toBe("buy");
        expect(state.up.sharp).toBe(1);
        expect(state.gold).toBe(1000 - upCost(sharp, 0));

        apply(state, { type: "buyUpgrade", id: "sharp", max: true }, rng);
        expect(state.up.sharp).toBeGreaterThan(1);
        expect(state.gold).toBeGreaterThanOrEqual(0);
    });

    it("reports missing gold", () => {
        const { rng, state } = game();
        state.gold = 0;
        expect(
            apply(state, { type: "buyUpgrade", id: "sharp" }, rng)[0],
        ).toMatchObject({ t: "error", code: "gold" });
    });
});

describe("inventory actions", () => {
    it("equips, swaps and unequips", () => {
        const { rng, state } = game();
        const a = mkItem(100, "weapon", 5);
        const b = mkItem(101, "weapon", 9);
        state.inv = [a, b];

        expect(apply(state, { type: "equip", itemId: a.id }, rng)[0]?.t).toBe("equip");
        expect(state.eq.weapon?.id).toBe(a.id);
        expect(state.inv.map((i) => i.id)).toEqual([b.id]);

        apply(state, { type: "equip", itemId: b.id }, rng);
        expect(state.eq.weapon?.id).toBe(b.id);
        expect(state.inv.map((i) => i.id)).toEqual([a.id]);

        apply(state, { type: "unequip", slot: "weapon" }, rng);
        expect(state.eq.weapon).toBeUndefined();
        expect(state.inv).toHaveLength(2);
    });

    it("refuses to unequip into a full bag", () => {
        const { rng, state } = game();
        state.eq.weapon = mkItem(1, "weapon", 5);
        state.inv = Array.from({ length: 30 }, (_, i) => mkItem(10 + i, "helm", 1));
        expect(apply(state, { type: "unequip", slot: "weapon" }, rng)[0]).toMatchObject({
            t: "error",
            code: "full",
        });
    });

    it("sells one item, below a threshold, and everything", () => {
        const { rng, state } = game();
        state.gold = 0;
        state.inv = [
            { ...mkItem(1, "helm", 1), ri: 0 },
            { ...mkItem(2, "helm", 1), ri: 1 },
            { ...mkItem(3, "helm", 1), ri: 3 },
        ];
        state.as = 2;

        const one = apply(state, { type: "sell", itemId: 1 }, rng);
        expect(one[0]).toMatchObject({ t: "sell", count: 1 });
        expect(state.inv).toHaveLength(2);
        expect(state.gold).toBeGreaterThan(0);

        const goldBefore = state.gold;
        const below = apply(state, { type: "sellBelow" }, rng);
        expect(below[0]).toMatchObject({ t: "sell", count: 1 });
        expect(state.inv.map((i) => i.id)).toEqual([3]);
        expect(state.gold).toBeGreaterThan(goldBefore);

        const all = apply(state, { type: "sellAll" }, rng);
        expect(all[0]).toMatchObject({ t: "sell", count: 1 });
        expect(state.inv).toEqual([]);
    });

    it("rerolls affixes for gold and increments the counter", () => {
        const { rng, state } = game();
        const item = { ...mkItem(7, "weapon", 5), ri: 5, il: 40 };
        state.inv = [item];
        state.gold = 1_000_000;

        const cost = rerollCost(item);
        const ev = apply(state, { type: "reroll", itemId: item.id }, rng);

        expect(ev[0]).toMatchObject({ t: "reroll", gold: cost });
        expect(item.rr).toBe(1);
        expect(state.gold).toBe(1_000_000 - cost);
        expect(item.aff.length).toBeGreaterThanOrEqual(5);
        expect(item.name.length).toBeGreaterThan(0);
    });

    it("does not reroll without enough gold", () => {
        const { rng, state } = game();
        const item = mkItem(8, "weapon", 5);
        state.inv = [item];
        state.gold = 0;
        expect(apply(state, { type: "reroll", itemId: 8 }, rng)[0]).toMatchObject({
            t: "error",
            code: "gold",
        });
    });

    it("equips the best item per slot", () => {
        const { rng, state } = game();
        const weak = mkItem(1, "weapon", 2);
        const strong = mkItem(2, "weapon", 50);
        const helm: Item = { ...mkItem(3, "helm", 0), imp: { stat: "lifep", val: 20 } };
        state.inv = [weak, strong, helm];

        const before = gearScore(calc(state));
        const ev = apply(state, { type: "equipBest" }, rng);

        expect(ev[0]?.t).toBe("equipBest");
        expect(state.eq.weapon?.id).toBe(2);
        expect(state.eq.helm?.id).toBe(3);
        expect(state.inv.map((i) => i.id)).toContain(1);
        expect(gearScore(calc(state))).toBeGreaterThan(before);
    });
});
