// Item generation and drops.

import { R, AF, B, SLOTS, TITLES } from "./data/items";
import { pick1, sc } from "./format";
import { calc, itemValue } from "./stats";
import type { Affix, Item, SimEvent, SimState } from "./types";
import type { Rng } from "./rng";

export function rollAffixes(ri: number, il: number, rng: Rng): Affix[] {
    const lo = R[ri].a[0];
    const hi = R[ri].a[1];
    // Rarity ranges go up to 9 affixes; AF has 14 unique entries, so the
    // uniqueness set is what bounds the roll. (The old 3-per-scope cap made
    // Mythic+ items loop forever.)
    const n = Math.min(lo + ((rng() * (hi - lo + 1)) | 0), AF.length);
    const aff: Affix[] = [];
    const used = new Set<number>();

    while (aff.length < n) {
        const i = (rng() * AF.length) | 0;
        if (used.has(i)) continue;
        const a = AF[i];
        used.add(i);
        const roll = Math.pow(rng(), 1 / (1 + ri * 0.3));
        aff.push({
            t: a[0],
            stat: a[1],
            name: a[2],
            val: (a[3] + (a[4] - a[3]) * roll) * sc(a[1], il),
        });
    }
    return aff;
}

export function genItem(
    state: SimState,
    il: number,
    boost: number,
    rng: Rng,
): Item {
    const stats = calc(state);
    const weights = R.map((r, i) =>
        r.w * (i ? 1 + (stats.g("mf") / 100) * i * 0.5 + boost * i * 2 : 1),
    );
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    let ri = 0;
    for (; ri < 7; ri++) {
        if (x < weights[ri]) break;
        x -= weights[ri];
    }

    const slot = pick1(SLOTS, rng);
    const bs = pick1(B[slot], rng);
    const imp = { stat: bs[2], val: bs[1] * sc(bs[2], il) };
    const aff = rollAffixes(ri, il, rng);
    const p = aff.find((a) => a.t === "p");
    const s = aff.find((a) => a.t === "s");
    const title = ri >= 4 ? pick1(TITLES, rng) : null;
    const name =
        ri >= 4
            ? `${title}, ${bs[0]}`
            : `${p ? p.name + " " : ""}${bs[0]}${s ? " " + s.name : ""}`;

    return {
        id: state.nid++,
        slot,
        base: bs[0],
        il,
        ri,
        imp,
        aff,
        name,
        title,
        rr: 0,
    };
}

export function rollDrops(
    state: SimState,
    baseChance: number,
    rng: Rng,
): number {
    const total = baseChance + calc(state).g("drop");
    const guaranteed = Math.floor(total / 100);
    const rem = total % 100;
    let count = guaranteed;
    if (rng() * 100 < rem) count++;
    return count;
}

export function drop(
    state: SimState,
    boss: boolean,
    elite: boolean,
    rng: Rng,
): SimEvent[] {
    const ilBoost = boss ? 2 : elite ? 1 : 0;
    const rarityBoost = boss ? 0.8 : elite ? 0.4 : 0;
    const item = genItem(state, state.stage + ilBoost, rarityBoost, rng);

    if (item.ri < state.as || state.inv.length >= 30) {
        const gold = itemValue(item, calc(state));
        state.gold += gold;
        return [{ t: "drop", item, sold: true, gold }];
    }

    state.inv.push(item);
    return [{ t: "drop", item, sold: false, gold: 0 }];
}
