// Number/percent formatting and progression curves.
//
// Ported from old/js/core/format.js. The two functions that used the global
// state (`spent`, `spLeft`) now take it as an argument.

import { NODES } from "./data/tree";
import { FLAT } from "./data/items";
import { SN, PCT } from "./data/stats-defs";
import type { SimState, StatKey } from "./types";
import type { Rng } from "./rng";

export const pick1 = <T>(a: readonly T[], rng: Rng): T =>
    a[(rng() * a.length) | 0]!;

export const need = (l: number): number => 25 * Math.pow(1.22, l - 1);

export const spent = (state: SimState): number =>
    NODES.reduce(
        (a, n) => a + (state.ranks[n.id] || 0) * (n.cost || 1),
        0,
    );

export const spLeft = (state: SimState): number => state.lvl - 1 - spent(state);

export const sc = (stat: StatKey, il: number): number =>
    FLAT.has(stat) ? 1 + il * 0.2 : 1 + il * 0.03;

export function fn(n: number): string {
    return n >= 1e6
        ? (n / 1e6).toFixed(1) + "M"
        : n >= 1e4
            ? (n / 1e3).toFixed(1) + "k"
            : n < 10
                ? n.toFixed(1)
                : Math.round(n) + "";
}

export const fmtS = (stat: StatKey, v: number): string =>
    PCT.has(stat)
        ? `+${Math.round(v)}% ${SN[stat]}`
        : `+${v >= 10 ? Math.round(v) : v.toFixed(1)} ${SN[stat]}`;

export const fmtN = (stat: StatKey, v: number): string =>
    (v > 0 ? "+" : "-") +
    (PCT.has(stat)
        ? Math.round(Math.abs(v)) + "%"
        : Math.abs(v) >= 10
            ? Math.round(Math.abs(v))
            : Math.abs(v).toFixed(1));
