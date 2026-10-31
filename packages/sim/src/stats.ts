// Derived combat stats.
//
// Ported from old/js/core/stats.js. `calc` takes the state (and optionally an
// equipment override for item comparisons) instead of reading a global.

import { SLOTS } from "./data/items";
import { NODES } from "./data/tree";
import { SOULS } from "./data/souls";
import { UPGRADES } from "./data/forge";
import type { Item, SimState, StatKey, Stats } from "./types";
import type { Rng } from "./rng";

export function rollCrit(stats: Stats, rng: Rng): number {
    const guaranteed = Math.floor(stats.crit / 100) + (stats.gCrit || 0);
    const rem = stats.crit % 100;
    let tiers = guaranteed;
    if (rng() * 100 < rem) tiers++;
    return tiers;
}

export function calc(
    state: SimState,
    eq: SimState["eq"] = state.eq,
    up: SimState["up"] = state.up,
): Stats {
    const st: Partial<Record<StatKey, number>> = {};
    const add = (k: StatKey, v: number) => {
        st[k] = (st[k] || 0) + v;
    };

    for (const sl of SLOTS) {
        const it = eq[sl];
        if (!it) continue;
        add(it.imp.stat, it.imp.val);
        it.aff.forEach((a) => add(a.stat, a.val));
    }

    for (const n of NODES) {
        const r = state.ranks[n.id] || 0;
        if (r && n.fx) {
            for (const k in n.fx) {
                add(k as StatKey, (n.fx[k as StatKey] ?? 0) * r);
            }
        }
    }

    const souls = state.souls || {};
    for (const s of SOULS) {
        const r = souls[s.id] || 0;
        if (r) add(s.stat, s.val * r);
    }

    // Ascension scaling: soul ranks convert into damage/life.
    const soulTotal = SOULS.reduce((a, n) => a + (souls[n.id] || 0), 0);
    if (st.sd) add("dmgp", st.sd * Math.floor(soulTotal / 10));
    if (st.sl) add("lifep", st.sl * Math.floor(soulTotal / 10));

    // Forge upgrades, boosted by the Forger node.
    const fgMult = 1 + (st.fg || 0) / 100;
    for (const u of UPGRADES) {
        const r = up[u.id] || 0;
        if (r) add(u.stat, u.val * r * fgMult);
    }

    const g = (k: StatKey): number => st[k] || 0;

    const maxHp = (50 + state.lvl * 20 + g("life")) * (1 + g("lifep") / 100);
    const armor = g("armor") * (1 + g("armorp") / 100);
    const dmg = (5 + state.lvl * 2.2 + g("dmg")) * (1 + g("dmgp") / 100);
    const aps = 0.8 * (1 + g("spd") / 100);
    const crit = 5 + g("crit");
    const critd = 150 + g("critd");

    return {
        g,
        maxHp,
        armor,
        dmg,
        aps,
        crit,
        critd,
        dps: dmg * aps * (1 + (crit / 100) * (critd / 100 - 1)),
        eliteDmg: g("eld"),
        bossDmg: g("bsd"),
        lowHPDmg: g("lhd"),
        highHPDmg: g("hhd"),
        multihit: g("mh"),
        gCrit: g("gc"),
        sellBonus: g("sb"),
        shardBonus: g("shb"),
        milestoneBonus: g("msb"),
        keepGold: g("kp"),
        thorns: g("thorns"),
        vulnDmg: g("vd"),
        twoVuln: !!g("tv"),
    };
}

export const itemValue = (it: Item, stats: Stats | null): number => {
    const base = Math.round((it.il + 2) * (2 + it.ri * it.ri * 4));
    return stats
        ? Math.round(base * (1 + (stats.sellBonus || 0) / 100))
        : base;
};

export function rerollCost(it: Item): number {
    const base = Math.round((it.il + 2) * (5 + it.ri * 12));
    return Math.round(base * Math.pow(1.6, it.rr || 0));
}

export function gearScore(s: Stats): number {
    return s.dps + s.maxHp * 0.1 + s.armor * 0.2;
}
