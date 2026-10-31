import { SLOTS, type Item, type StatKey } from "@cinderfall/sim";
import type { Snapshot } from "./snapshot";

export function findInSnapshot(
    snap: Snapshot,
    id: number | null,
): { item: Item; equipped: boolean } | null {
    if (id === null) return null;
    const item = snap.inv.find((i) => i.id === id);
    if (item) return { item, equipped: false };
    for (const slot of SLOTS) {
        const eq = snap.eq[slot];
        if (eq && eq.id === id) return { item: eq, equipped: true };
    }
    return null;
}

export function statMap(item: Item): Partial<Record<StatKey, number>> {
    const map: Partial<Record<StatKey, number>> = {};
    const add = (stat: StatKey, value: number) => {
        map[stat] = (map[stat] || 0) + value;
    };
    add(item.imp.stat, item.imp.val);
    for (const aff of item.aff) add(aff.stat, aff.val);
    return map;
}
