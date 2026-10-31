// Immutable view of the simulation, published to Zustand.
//
// Arrays/objects that rarely change are cached by signature so components that
// select them do not re-render on every 100 ms tick.

import {
    calc,
    need,
    spent,
    spLeft,
    type Enemy,
    type Item,
    type SimState,
    type SkillId,
    type SlotId,
    type Stats,
} from "@cinderfall/sim";

export interface Snapshot {
    lvl: number;
    xp: number;
    xpNeed: number;
    gold: number;
    shards: number;
    /** Auto-sell rarity threshold. */
    as: number;

    stage: number;
    k: number;
    best: number;
    runs: number;
    elites: number;
    pend: number;
    dead: boolean;

    hp: number;
    maxHp: number;
    buff: number;

	/** Unspent skill points. */
    sp: number;
    spSpent: number;

    enemy: Enemy;
    stats: Stats;

    inv: Item[];
    eq: Partial<Record<SlotId, Item>>;
    ranks: Record<string, number>;
    souls: Record<string, number>;
    up: Record<string, number>;
    cd: Record<SkillId, number>;
}

let invSig = "";
let invCache: Item[] = [];

let eqSig = "";
let eqCache: Partial<Record<SlotId, Item>> = {};

let statsSig = "";
let statsCache: Stats | null = null;

let ranksSig = "";
let ranksCache: Record<string, number> = {};

let soulsSig = "";
let soulsCache: Record<string, number> = {};

let upSig = "";
let upCache: Record<string, number> = {};

function cloneItem(item: Item): Item {
    return {
        ...item,
        imp: { ...item.imp },
        aff: item.aff.map((a) => ({ ...a })),
    };
}

export function resetSnapshotCache(): void {
    invSig = "";
    invCache = [];
    eqSig = "";
    eqCache = {};
    statsSig = "";
    statsCache = null;
    ranksSig = "";
    ranksCache = {};
    soulsSig = "";
    soulsCache = {};
    upSig = "";
    upCache = {};
}

export function buildSnapshot(state: SimState): Snapshot {
    const nextInvSig = state.inv.map((i) => `${i.id}:${i.rr}`).join(",");
    if (nextInvSig !== invSig) {
        invSig = nextInvSig;
        invCache = state.inv.map(cloneItem);
    }

    const nextEqSig = Object.entries(state.eq)
        .map(([slot, item]) => `${slot}:${item?.id ?? 0}:${item?.rr ?? 0}`)
        .join(",");
    if (nextEqSig !== eqSig) {
        eqSig = nextEqSig;
        const next: Partial<Record<SlotId, Item>> = {};
        for (const [slot, item] of Object.entries(state.eq)) {
            if (item) next[slot as SlotId] = cloneItem(item);
        }
        eqCache = next;
    }

    const nextStatsSig = `${state.lvl}|${eqSig}|${JSON.stringify(state.ranks)}|${JSON.stringify(state.souls)}|${JSON.stringify(state.up)}`;
    if (nextStatsSig !== statsSig || !statsCache) {
        statsSig = nextStatsSig;
        statsCache = calc(state);
    }

    const nextRanksSig = JSON.stringify(state.ranks);
    if (nextRanksSig !== ranksSig) {
        ranksSig = nextRanksSig;
        ranksCache = { ...state.ranks };
    }

    const nextSoulsSig = JSON.stringify(state.souls);
    if (nextSoulsSig !== soulsSig) {
        soulsSig = nextSoulsSig;
        soulsCache = { ...state.souls };
    }

    const nextUpSig = JSON.stringify(state.up);
    if (nextUpSig !== upSig) {
        upSig = nextUpSig;
        upCache = { ...state.up };
    }

    return {
        lvl: state.lvl,
        xp: state.xp,
        xpNeed: need(state.lvl),
        gold: state.gold,
        shards: state.shards,
        as: state.as,

        stage: state.stage,
        k: state.k,
        best: state.best,
        runs: state.runs,
        elites: state.elites,
        pend: state.pend,
        dead: state.dead,

        hp: state.hp,
        maxHp: statsCache.maxHp,
        buff: state.buff,

        sp: spLeft(state),
        spSpent: spent(state),

        enemy: { ...state.enemy },
        stats: statsCache,

        inv: invCache,
        eq: eqCache,
        ranks: ranksCache,
        souls: soulsCache,
        up: upCache,
        cd: { ...state.cd },
    };
}
