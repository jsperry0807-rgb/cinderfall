// The save state: creation and normalisation.
//
// `normalizeState` is the trust boundary for saves coming from a client: it
// rebuilds the object from known fields, drops unknown keys, validates items
// and structures, and clamps numbers. It is corruption control, not anti-cheat
// (there is no leaderboard).

import { SLOTS } from "./data/items";
import { SN } from "./data/stats-defs";
import { NODES } from "./data/tree";
import { SOULS } from "./data/souls";
import { UPGRADES } from "./data/forge";
import { calc } from "./stats";
import type {
    Affix,
    Enemy,
    Item,
    SimState,
    SkillId,
    SlotId,
    StatKey,
} from "./types";

export const EMPTY_ENEMY: Enemy = {
    boss: false,
    elite: false,
    hp: 1,
    max: 1,
    face: "💀",
    name: "Nothing",
    dmg: 0,
    t: 0,
    spd: 1.5,
    age: 0,
    vuln: 0,
};

export const createState = (): SimState => ({
    schemaVersion: 1,

    lvl: 1,
    xp: 0,
    gold: 0,
    stage: 1,
    k: 0,

    inv: [],
    eq: {},

    ranks: {},
    up: {},

    hp: 0,
    nid: 1,
    ac: 0,
    as: 0,

    cd: { whirl: 0, cry: 0, reckoning: 0, cataclysm: 0 },
    buff: 0,
    buffMul: 1.6,

    shards: 0,
    souls: {},
    best: 1,
    runs: 0,
    pend: 0,
    elites: 0,

    dead: false,
    enemy: { ...EMPTY_ENEMY },
});

const SLOT_SET = new Set<string>(SLOTS);
const STAT_SET = new Set<string>(Object.keys(SN));
const NODE_MAX = new Map(NODES.map((n) => [n.id, n.max]));
const SOUL_IDS = new Set(SOULS.map((s) => s.id));
const UPGRADE_IDS = new Set(UPGRADES.map((u) => u.id));
const SKILL_IDS: SkillId[] = ["whirl", "cry", "reckoning", "cataclysm"];

const clamp = (value: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, value));

const num = (
    value: unknown,
    fallback: number,
    max = 1e15,
): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return clamp(value, 0, max);
};

const int = (value: unknown, fallback: number, max = 1e9): number =>
    Math.floor(num(value, fallback, max));

const text = (value: unknown, max: number): string =>
    typeof value === "string" ? value.slice(0, max) : "";

const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

function sanitizeAffix(raw: unknown): Affix | null {
    const a = record(raw);
    if (a.t !== "p" && a.t !== "s") return null;
    if (typeof a.stat !== "string" || !STAT_SET.has(a.stat)) return null;
    if (typeof a.val !== "number" || !Number.isFinite(a.val)) return null;
    return {
        t: a.t,
        stat: a.stat as StatKey,
        name: text(a.name, 60),
        val: clamp(a.val, 0, 1e9),
    };
}

function sanitizeItem(raw: unknown): Item | null {
    const it = record(raw);
    if (typeof it.slot !== "string" || !SLOT_SET.has(it.slot)) return null;

    const imp = record(it.imp);
    if (typeof imp.stat !== "string" || !STAT_SET.has(imp.stat)) return null;
    if (typeof imp.val !== "number" || !Number.isFinite(imp.val)) return null;

    const id = int(it.id, 0, 1e15);
    if (!id) return null;

    const affixes: Affix[] = [];
    if (Array.isArray(it.aff)) {
        for (const rawAffix of it.aff.slice(0, 14)) {
            const affix = sanitizeAffix(rawAffix);
            if (affix) affixes.push(affix);
        }
    }

    return {
        id,
        slot: it.slot as SlotId,
        base: text(it.base, 80) || "Unknown",
        il: Math.max(1, int(it.il, 1, 1e6)),
        ri: int(it.ri, 0, 7),
        imp: { stat: imp.stat as StatKey, val: clamp(imp.val, 0, 1e9) },
        aff: affixes,
        name: text(it.name, 120) || "Unknown",
        title: typeof it.title === "string" ? text(it.title, 60) : null,
        rr: int(it.rr, 0, 1e6),
    };
}

function sanitizeRankMap(
    raw: unknown,
    allowed: (id: string) => number | null,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(record(raw))) {
        const max = allowed(id);
        if (max === null) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            continue;
        }
        out[id] = Math.min(Math.floor(value), max);
    }
    return out;
}

function sanitizeEnemy(raw: unknown): Enemy {
    const e = record(raw);
    const max = Math.max(1, num(e.max, 1, 1e15));
    return {
        boss: e.boss === true,
        elite: e.elite === true,
        hp: Math.min(num(e.hp, max, 1e15), max),
        max,
        face: text(e.face, 16) || EMPTY_ENEMY.face,
        name: text(e.name, 80) || EMPTY_ENEMY.name,
        dmg: num(e.dmg, 0, 1e12),
        t: num(e.t, 0, 1e6),
        spd: Math.max(0.1, num(e.spd, 1.5, 1e6)),
        age: num(e.age, 0, 1e9),
        vuln: clamp(num(e.vuln, 0, 100), 0, 100),
    };
}

export function normalizeState(raw: unknown): SimState {
    const base = createState();
    if (!raw || typeof raw !== "object") return base;

    const source = record(raw);

    const inv: Item[] = [];
    const seen = new Set<number>();
    if (Array.isArray(source.inv)) {
        for (const value of source.inv.slice(0, 30)) {
            const item = sanitizeItem(value);
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            inv.push(item);
        }
    }

    const eq: Partial<Record<SlotId, Item>> = {};
    const eqRaw = record(source.eq);
    for (const slot of SLOTS) {
        const item = sanitizeItem(eqRaw[slot]);
        if (!item || item.slot !== slot || seen.has(item.id)) continue;
        seen.add(item.id);
        eq[slot] = item;
    }

    const cd: Record<SkillId, number> = { ...base.cd };
    const cdRaw = record(source.cd);
    for (const id of SKILL_IDS) {
        cd[id] = num(cdRaw[id], 0, 1e6);
    }

    const ranks = sanitizeRankMap(
        source.ranks,
        (id) => NODE_MAX.get(id) ?? null,
    );
    const souls = sanitizeRankMap(source.souls, (id) =>
        SOUL_IDS.has(id) ? 10_000 : null,
    );
    const up = sanitizeRankMap(source.up, (id) =>
        UPGRADE_IDS.has(id) ? 10_000 : null,
    );

    const state: SimState = {
        schemaVersion: 1,

        lvl: Math.max(1, int(source.lvl, 1, 1e6)),
        xp: num(source.xp, 0, 1e15),
        gold: num(source.gold, 0, 1e18),
        stage: Math.max(1, int(source.stage, 1, 1e6)),
        k: int(source.k, 0, 5),

        inv,
        eq,

        ranks,
        up,

        hp: num(source.hp, 0, 1e15),
        nid: Math.max(1, int(source.nid, 1, 1e15)),
        ac: num(source.ac, 0, 1e6),
        as: int(source.as, 0, 5),

        cd,
        buff: num(source.buff, 0, 1e6),
        buffMul: clamp(num(source.buffMul, 1.6, 10), 1, 10),

        shards: num(source.shards, 0, 1e12),
        souls,
        best: Math.max(1, int(source.best, 1, 1e6)),
        runs: int(source.runs, 0, 1e9),
        pend: num(source.pend, 0, 1e12),
        elites: int(source.elites, 0, 1e9),

        dead: source.dead === true,
        enemy: sanitizeEnemy(source.enemy),
    };

    // Keep the id counter ahead of every item, and HP inside the max.
    const maxId = Math.max(
        0,
        ...state.inv.map((i) => i.id),
        ...Object.values(state.eq).map((i) => i?.id ?? 0),
    );
    state.nid = Math.max(state.nid, maxId + 1);
    const stats = calc(state);
    if (!state.dead && state.hp <= 0) state.hp = stats.maxHp;
    state.hp = Math.min(state.hp, stats.maxHp);
    state.best = Math.max(state.best, state.stage);

    return state;
}
