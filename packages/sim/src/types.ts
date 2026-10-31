// Shared domain types for the simulation.
//
// Everything here is plain data: no functions, no DOM, no framework types.

export type SlotId =
    | "weapon"
    | "helm"
    | "chest"
    | "gloves"
    | "boots"
    | "ring"
    | "amulet";

export type StatKey =
    | "dmg"
    | "dmgp"
    | "life"
    | "armor"
    | "regen"
    | "spd"
    | "crit"
    | "critd"
    | "gold"
    | "mf"
    | "xp"
    | "ls"
    | "lifep"
    | "armorp"
    | "pxp"
    | "drop"
    | "eld"
    | "bsd"
    | "lhd"
    | "hhd"
    | "mh"
    | "gc"
    | "sb"
    | "sd"
    | "sl"
    | "shb"
    | "msb"
    | "kp"
    | "fg"
    | "thorns"
    | "vd"
    | "tv";

export type AffixScope = "p" | "s";

export type SkillId = "whirl" | "reckoning" | "cataclysm" | "cry";

export interface Rarity {
    n: string;
    c: string;
    /** Inclusive affix-count range. */
    a: [number, number];
    /** Base drop weight. */
    w: number;
}

export interface Affix {
    t: AffixScope;
    stat: StatKey;
    name: string;
    val: number;
}

/** [scope, stat, display name, min, max] */
export type AffixDef = readonly [
    AffixScope,
    StatKey,
    string,
    number,
    number,
];

/** [name, base value, primary stat] */
export type BaseItem = readonly [string, number, StatKey];

export type BaseTable = Record<SlotId, readonly BaseItem[]>;

export interface NodeDef {
    id: string;
    /** Branch index into BR. */
    b: number;
    n: string;
    d: string;
    max: number;
    cost?: number;
    fx?: Partial<Record<StatKey, number>>;
    req?: string;
}

export interface SoulDef {
    id: string;
    n: string;
    d: string;
    stat: StatKey;
    val: number;
    base: number;
    growth: number;
}

export type UpgradeDef = SoulDef;

export interface SkillDef {
    n: string;
    cd: number;
    mult?: number;
}

export interface Item {
    id: number;
    slot: SlotId;
    base: string;
    il: number;
    ri: number;
    imp: { stat: StatKey; val: number };
    aff: Affix[];
    name: string;
    title: string | null;
    rr: number;
}

export interface Enemy {
    boss: boolean;
    elite: boolean;
    hp: number;
    max: number;
    face: string;
    name: string;
    dmg: number;
    /** Seconds since the enemy last attacked. */
    t: number;
    /** Seconds between attacks. */
    spd: number;
    /** Seconds alive; drives boss enrage. */
    age: number;
    /** Vulnerability stacks, 0-100. */
    vuln: number;
}

export interface SimState {
    schemaVersion: 1;

    lvl: number;
    xp: number;
    gold: number;
    stage: number;
    /** Foes killed in the current stage, 0-5. */
    k: number;

    inv: Item[];
    eq: Partial<Record<SlotId, Item>>;

    /** Skill-tree node id -> ranks. */
    ranks: Record<string, number>;
    /** Forge upgrade id -> ranks. */
    up: Record<string, number>;

    hp: number;
    /** Next item id. */
    nid: number;
    /** Attack accumulator, 0-1. */
    ac: number;
    /** Auto-sell rarity threshold. */
    as: number;

    cd: Record<SkillId, number>;
    /** Remaining Battle Cry duration, seconds. */
    buff: number;
    buffMul: number;

    shards: number;
    /** Soul upgrade id -> ranks. */
    souls: Record<string, number>;
    best: number;
    runs: number;
    /** Shards pending collection on rebirth. */
    pend: number;
    elites: number;

    /** True between death and rebirth; the clock stops. */
    dead: boolean;

    /** The current foe. Persisted so an absent player's fight continues. */
    enemy: Enemy;
}

export interface Stats {
    g: (k: StatKey) => number;

    maxHp: number;
    armor: number;
    dmg: number;
    aps: number;
    crit: number;
    critd: number;
    dps: number;

    eliteDmg: number;
    bossDmg: number;
    lowHPDmg: number;
    highHPDmg: number;
    multihit: number;
    gCrit: number;
    sellBonus: number;
    shardBonus: number;
    milestoneBonus: number;
    keepGold: number;
    thorns: number;
    vulnDmg: number;
    twoVuln: boolean;
}

export type ActionError =
    | "gold"
    | "shards"
    | "points"
    | "full"
    | "locked"
    | "invalid";

export type SimEvent =
    | { t: "spawn"; name: string; boss: boolean; elite: boolean }
    | { t: "hit"; dmg: number; crit: number; multihit: boolean }
    | { t: "playerHit"; dmg: number }
    | { t: "thorns"; dmg: number }
    | { t: "kill"; name: string; gold: number; xp: number }
    | { t: "drop"; item: Item; sold: boolean; gold: number }
    | { t: "levelup"; level: number }
    | { t: "death"; shards: number }
    | { t: "rebirth"; shards: number; keepGold: number }
    | { t: "milestone"; stage: number; shards: number }
    | { t: "skill"; id: SkillId }
    | { t: "warn"; msg: string }
    | {
          t: "buy";
          kind: "node" | "soul" | "upgrade";
          id: string;
          rank: number;
      }
    | { t: "respec"; points: number }
    | { t: "equip"; itemId: number; slot: SlotId }
    | { t: "unequip"; slot: SlotId }
    | { t: "equipBest"; swaps: number }
    | { t: "sell"; count: number; gold: number }
    | { t: "reroll"; itemId: number; gold: number; name: string }
    | { t: "error"; code: ActionError };

export type Action =
    | { type: "strike" }
    | { type: "cast"; skill: SkillId }
    | { type: "buyNode"; id: string }
    | { type: "buyUpgrade"; id: string; max?: boolean }
    | { type: "buySoul"; id: string; max?: boolean }
    | { type: "equip"; itemId: number }
    | { type: "unequip"; slot: SlotId }
    | { type: "sell"; itemId: number }
    | { type: "sellBelow" }
    | { type: "sellAll" }
    | { type: "setAutoSell"; rarity: number }
    | { type: "reroll"; itemId: number }
    | { type: "equipBest" }
    | { type: "respec" }
    | { type: "rebirth" };
