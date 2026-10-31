import { fn, type Stats } from "@cinderfall/sim";

export { fn };

export function critStr(stats: Stats): string {
    const mult = (stats.critd / 100).toFixed(2);
    const guaranteed = Math.floor(stats.crit / 100) + (stats.gCrit || 0);
    if (guaranteed === 0) return `${stats.crit.toFixed(0)}% ×${mult}`;
    return `${stats.crit.toFixed(0)}% (${guaranteed}×+) ×${mult}`;
}

export function dropStr(stats: Stats): string {
    const drop = stats.g("drop");
    const total = 25 + drop;
    if (total < 100) return `+${drop.toFixed(0)}%`;
    return `+${drop.toFixed(0)}% (${Math.floor(total / 100)}×+ mobs)`;
}

export function signedPct(value: number): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function tone(value: number): string {
    if (value >= 0.05) return "up";
    if (value <= -0.05) return "dn";
    return "mu";
}
