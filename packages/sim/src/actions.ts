// Player actions. Everything that mutates the save goes through `apply`.
//
// Ported from old/js/ui/actions/*. Those functions updated the DOM directly;
// these return events and leave presentation to the caller.

import { NODES } from "./data/tree";
import { SOULS, sCost } from "./data/souls";
import { UPGRADES, upCost } from "./data/forge";
import { TITLES, SLOTS } from "./data/items";
import { pick1, spLeft, spent } from "./format";
import { calc, gearScore, itemValue, rerollCost } from "./stats";
import { rollAffixes } from "./loot";
import { hit, cast as castSkill, rebirth } from "./combat";
import type {
    Action,
    ActionError,
    Item,
    SimEvent,
    SimState,
    SlotId,
} from "./types";
import type { Rng } from "./rng";

const err = (code: ActionError): SimEvent[] => [{ t: "error", code }];

function clampHp(state: SimState): void {
    state.hp = Math.min(state.hp, calc(state).maxHp);
}

function findItem(
    state: SimState,
    itemId: number,
): { item: Item; equipped: boolean } | null {
    const it = state.inv.find((i) => i.id === itemId);
    if (it) return { item: it, equipped: false };
    for (const slot of SLOTS) {
        const eq = state.eq[slot];
        if (eq && eq.id === itemId) return { item: eq, equipped: true };
    }
    return null;
}

function buyNode(state: SimState, id: string): SimEvent[] {
    const node = NODES.find((n) => n.id === id);
    if (!node) return err("invalid");
    if (node.req && !state.ranks[node.req]) return err("locked");
    if ((state.ranks[id] || 0) >= node.max) return err("invalid");
    if (spLeft(state) < (node.cost || 1)) return err("points");

    state.ranks[id] = (state.ranks[id] || 0) + 1;
    return [{ t: "buy", kind: "node", id, rank: state.ranks[id]! }];
}

function respec(state: SimState): SimEvent[] {
    const points = spent(state);
    if (!points) return err("invalid");
    const cost = state.lvl * 50;
    if (state.gold < cost) return err("gold");

    state.gold -= cost;
    state.ranks = {};
    return [{ t: "respec", points }];
}

function buySoul(state: SimState, id: string, max: boolean): SimEvent[] {
    const soul = SOULS.find((s) => s.id === id);
    if (!soul) return err("invalid");

    let rank = state.souls[id] || 0;
    let bought = 0;

    if (max) {
        while (state.shards >= sCost(soul, rank) && bought < 1000) {
            state.shards -= sCost(soul, rank);
            rank++;
            bought++;
        }
    } else {
        const cost = sCost(soul, rank);
        if (state.shards < cost) return err("shards");
        state.shards -= cost;
        rank++;
        bought = 1;
    }

    if (!bought) return err("shards");
    state.souls[id] = rank;
    return [{ t: "buy", kind: "soul", id, rank }];
}

function buyUpgrade(state: SimState, id: string, max: boolean): SimEvent[] {
    const up = UPGRADES.find((u) => u.id === id);
    if (!up) return err("invalid");

    let rank = state.up[id] || 0;
    let bought = 0;

    if (max) {
        while (state.gold >= upCost(up, rank) && bought < 200) {
            state.gold -= upCost(up, rank);
            rank++;
            bought++;
        }
    } else {
        const cost = upCost(up, rank);
        if (state.gold < cost) return err("gold");
        state.gold -= cost;
        rank++;
        bought = 1;
    }

    if (!bought) return err("gold");
    state.up[id] = rank;
    return [{ t: "buy", kind: "upgrade", id, rank }];
}

function equip(state: SimState, itemId: number): SimEvent[] {
    const found = state.inv.find((i) => i.id === itemId);
    if (!found) return err("invalid");

    state.inv = state.inv.filter((i) => i.id !== itemId);
    const previous = state.eq[found.slot];
    state.eq[found.slot] = found;
    if (previous) state.inv.push(previous);
    clampHp(state);

    return [{ t: "equip", itemId: found.id, slot: found.slot }];
}

function unequip(state: SimState, slot: SlotId): SimEvent[] {
    const item = state.eq[slot];
    if (!item) return err("invalid");
    if (state.inv.length >= 30) return err("full");

    delete state.eq[slot];
    state.inv.push(item);
    clampHp(state);

    return [{ t: "unequip", slot }];
}

function sell(state: SimState, itemId: number): SimEvent[] {
    const index = state.inv.findIndex((i) => i.id === itemId);
    if (index < 0) return err("invalid");

    const [item] = state.inv.splice(index, 1);
    const gold = itemValue(item!, calc(state));
    state.gold += gold;

    return [{ t: "sell", count: 1, gold }];
}

function sellBelow(state: SimState): SimEvent[] {
    const sold = state.inv.filter((i) => i.ri < state.as);
    if (!sold.length) return [];

    const gold = sold.reduce((a, i) => a + itemValue(i, calc(state)), 0);
    state.gold += gold;
    state.inv = state.inv.filter((i) => i.ri >= state.as);

    return [{ t: "sell", count: sold.length, gold }];
}

function sellAll(state: SimState): SimEvent[] {
    const count = state.inv.length;
    if (!count) return [];

    const gold = state.inv.reduce(
        (a, i) => a + itemValue(i, calc(state)),
        0,
    );
    state.gold += gold;
    state.inv = [];

    return [{ t: "sell", count, gold }];
}

function reroll(
    state: SimState,
    itemId: number,
    rng: Rng,
): SimEvent[] {
    const found = findItem(state, itemId);
    if (!found) return err("invalid");

    const item = found.item;
    const cost = rerollCost(item);
    if (state.gold < cost) return err("gold");

    if (item.ri >= 4 && !item.title) item.title = pick1(TITLES, rng);
    item.aff = rollAffixes(item.ri, item.il, rng);

    const p = item.aff.find((a) => a.t === "p");
    const s = item.aff.find((a) => a.t === "s");
    item.name =
        item.ri >= 4
            ? `${item.title}, ${item.base}`
            : `${p ? p.name + " " : ""}${item.base}${s ? " " + s.name : ""}`;
    item.rr = (item.rr || 0) + 1;
    state.gold -= cost;

    return [{ t: "reroll", itemId: item.id, gold: cost, name: item.name }];
}

function equipBest(state: SimState): SimEvent[] {
    if (!state.inv.length) return [];

    let swaps = 0;
    for (let pass = 0; pass < 3; pass++) {
        let changed = false;

        for (const slot of SLOTS) {
            const candidates = state.inv.filter((i) => i.slot === slot);
            if (!candidates.length) continue;

            let best: Item | null = null;
            let bestScore = gearScore(calc(state));

            for (const candidate of candidates) {
                const score = gearScore(
                    calc(state, { ...state.eq, [slot]: candidate }),
                );
                if (score > bestScore + 1e-9) {
                    bestScore = score;
                    best = candidate;
                }
            }

            if (best) {
                const previous = state.eq[slot];
                state.inv = state.inv.filter((i) => i !== best);
                state.eq[slot] = best;
                if (previous) state.inv.push(previous);
                swaps++;
                changed = true;
            }
        }

        if (!changed) break;
    }

    if (!swaps) return [];
    clampHp(state);
    return [{ t: "equipBest", swaps }];
}

export function apply(
    state: SimState,
    action: Action,
    rng: Rng,
): SimEvent[] {
    switch (action.type) {
        case "strike":
            return hit(state, rng);
        case "cast":
            return castSkill(state, action.skill, rng);
        case "rebirth":
            return rebirth(state, rng);
        case "buyNode":
            return buyNode(state, action.id);
        case "respec":
            return respec(state);
        case "buySoul":
            return buySoul(state, action.id, action.max === true);
        case "buyUpgrade":
            return buyUpgrade(state, action.id, action.max === true);
        case "equip":
            return equip(state, action.itemId);
        case "unequip":
            return unequip(state, action.slot);
        case "sell":
            return sell(state, action.itemId);
        case "sellBelow":
            return sellBelow(state);
        case "sellAll":
            return sellAll(state);
        case "setAutoSell":
            state.as = Math.max(0, Math.min(5, Math.floor(action.rarity)));
            return [];
        case "reroll":
            return reroll(state, action.itemId, rng);
        case "equipBest":
            return equipBest(state);
    }
}
