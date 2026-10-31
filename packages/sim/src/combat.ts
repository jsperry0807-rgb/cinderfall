// Combat: spawning, striking, the fixed-step tick, death and rebirth.
//
// Ported from old/js/game/combat.js. Every UI side effect (toasts, re-renders,
// DOM shakes, saves) is gone; the functions mutate the state and return a list
// of SimEvent for the caller to present.

import { MOB, BOSS } from "./data/enemies";
import { SK } from "./data/skills";
import { calc, rollCrit } from "./stats";
import { need } from "./format";
import { createState } from "./state";
import { drop, rollDrops } from "./loot";
import type { SimEvent, SimState, SkillId } from "./types";
import type { Rng } from "./rng";

/** The client ticks at this rate; the server uses coarser steps when away. */
export const LOGIC_DT = 0.1;

/** Create a fresh, playable state with its first enemy and full health. */
export function createGame(rng: Rng): {
    state: SimState;
    events: SimEvent[];
} {
    const state = createState();
    const events = spawn(state, rng);
    state.hp = calc(state).maxHp;
    return { state, events };
}

export function spawn(state: SimState, rng: Rng): SimEvent[] {
    const boss = state.k >= 5;
    const s = state.stage;
    const elite = !boss && rng() < 0.15;
    const hp = 15 * Math.pow(1.14, s - 1) * (boss ? 4 : elite ? 2.5 : 1);
    const nm = boss
        ? BOSS[(s - 1) % BOSS.length]
        : MOB[(s * 3 + state.k) % MOB.length];
    const i = nm.indexOf(" ");
    const dmg = 2.5 * Math.pow(1.11, s - 1) * (boss ? 1.5 : elite ? 1.4 : 1);
    const baseName = nm.slice(i + 1);

    state.enemy = {
        boss,
        elite,
        hp,
        max: hp,
        face: nm.slice(0, i),
        name: elite ? "⭐ " + baseName : baseName,
        dmg,
        t: 0,
        spd: boss ? 1.2 : elite ? 1.35 : 1.5,
        age: 0,
        vuln: 0,
    };

    const events: SimEvent[] = [
        { t: "spawn", name: state.enemy.name, boss, elite },
    ];
    if (boss) events.push({ t: "warn", msg: `⚠ ${state.enemy.name} ⚠` });
    return events;
}

export function gainXp(state: SimState, x: number): SimEvent[] {
    state.xp += x;
    let up = false;
    while (state.xp >= need(state.lvl)) {
        state.xp -= need(state.lvl);
        state.lvl++;
        up = true;
    }
    if (!up) return [];
    state.hp = calc(state).maxHp;
    return [{ t: "levelup", level: state.lvl }];
}

export function kill(state: SimState, rng: Rng): SimEvent[] {
    const s = state.stage;
    const boss = state.enemy.boss;
    const elite = state.enemy.elite;
    const name = state.enemy.name;
    const stats = calc(state);

    const goldMul = boss ? 5 : elite ? 2.5 : 1;
    const xpMul = boss ? 4 : elite ? 2 : 1;
    const gold = Math.round(
        3 * Math.pow(1.14, s - 1) * goldMul * (1 + stats.g("gold") / 100),
    );
    const xp =
        6 * Math.pow(1.12, s - 1) * xpMul * (1 + stats.g("xp") / 100);

    state.gold += gold;

    const events: SimEvent[] = [{ t: "kill", name, gold, xp }];
    events.push(...gainXp(state, xp));

    if (boss && s % 10 === 0 && s > 0) {
        const bonus = 15 + s * 3 + (stats.milestoneBonus || 0);
        state.shards = (state.shards || 0) + bonus;
        events.push({ t: "milestone", stage: s, shards: bonus });
    }

    if (elite) state.elites = (state.elites || 0) + 1;

    const baseChance = boss ? 100 : elite ? 100 : 25;
    const dropCount = rollDrops(state, baseChance, rng);
    for (let i = 0; i < dropCount; i++) {
        events.push(...drop(state, boss, elite, rng));
    }

    if (boss) {
        state.stage++;
        state.k = 0;
    } else {
        state.k++;
    }
    events.push(...spawn(state, rng));
    return events;
}

export function hit(state: SimState, rng: Rng, mult = 1): SimEvent[] {
    const stats = calc(state);
    const strikes =
        mult === 1 && rng() * 100 < (stats.multihit || 0) ? 2 : 1;
    const events: SimEvent[] = [];

    for (let s = 0; s < strikes; s++) {
        const enemy = state.enemy;
        let d = stats.dmg * mult * (state.buff > 0 ? state.buffMul || 1.6 : 1);

        if (enemy.boss) d *= 1 + (stats.bossDmg || 0) / 100;
        else if (enemy.elite) d *= 1 + (stats.eliteDmg || 0) / 100;
        if (enemy.hp / enemy.max < 0.5) d *= 1 + (stats.lowHPDmg || 0) / 100;
        if (enemy.hp / enemy.max > 0.75) d *= 1 + (stats.highHPDmg || 0) / 100;
        if (stats.vulnDmg && enemy.vuln) {
            d *= 1 + (enemy.vuln / 100) * (stats.vulnDmg / 100);
        }

        let tiers = 0;
        if (mult === 1) tiers = rollCrit(stats, rng);
        if (tiers >= 1) d *= 1 + tiers * (stats.critd / 100 - 1);

        const leechBase = d;
        if (enemy.vuln) d *= 1 + enemy.vuln / 100;
        if (stats.g("ls")) {
            state.hp = Math.min(
                stats.maxHp,
                state.hp + (leechBase * stats.g("ls")) / 100,
            );
        }

        enemy.hp -= d;
        enemy.vuln = Math.min(100, (enemy.vuln || 0) + (stats.twoVuln ? 2 : 1));

        events.push({ t: "hit", dmg: d, crit: tiers, multihit: strikes > 1 });

        if (enemy.hp <= 0) {
            events.push(...kill(state, rng));
            return events;
        }
    }
    return events;
}

export function cast(
    state: SimState,
    id: SkillId,
    rng: Rng,
): SimEvent[] {
    if (!state.ranks[id] || state.cd[id] > 0) return [];

    state.cd[id] = SK[id].cd;
    const events: SimEvent[] = [{ t: "skill", id }];

    if (id === "cry") {
        state.buff = state.ranks.cry2 ? 12 : 8;
        state.buffMul = state.ranks.cry2 ? 2.0 : 1.6;
    } else if (SK[id].mult) {
        events.push(...hit(state, rng, SK[id].mult!));
    }
    return events;
}

export function die(state: SimState): SimEvent[] {
    if (state.dead) return [];
    state.dead = true;
    state.hp = Math.max(0, state.hp);
    const base = Math.round(state.stage * 3 + state.lvl);
    const earned = Math.max(
        1,
        Math.round(base * (1 + (calc(state).shardBonus || 0) / 100)),
    );
    state.pend = earned;
    return [{ t: "death", shards: earned }];
}

export function rebirth(state: SimState, rng: Rng): SimEvent[] {
    const stats = calc(state);
    const earned = state.pend || 0;
    const keepGold = Math.floor((state.gold * (stats.keepGold || 0)) / 100);

    state.shards = (state.shards || 0) + earned;
    state.runs = (state.runs || 0) + 1;
    state.best = Math.max(state.best || 1, state.stage);

    state.lvl = 1;
    state.xp = 0;
    state.gold = keepGold;
    state.stage = 1;
    state.k = 0;
    state.inv = [];
    state.eq = {};
    state.ranks = {};
    state.up = {};
    state.elites = 0;
    state.cd = { whirl: 0, cry: 0, reckoning: 0, cataclysm: 0 };
    state.buff = 0;
    state.ac = 0;
    state.hp = 0;
    state.pend = 0;
    state.dead = false;

    state.hp = calc(state).maxHp;

    const events: SimEvent[] = [{ t: "rebirth", shards: earned, keepGold }];
    events.push(...spawn(state, rng));
    return events;
}

export function tick(state: SimState, dt: number, rng: Rng): SimEvent[] {
    if (state.dead) return [];

    const events: SimEvent[] = [];
    let stats = calc(state);

    state.ac += dt * stats.aps;
    while (state.ac >= 1) {
        state.ac--;
        events.push(...hit(state, rng));
    }

    // Attacks may have killed the foe, spawned a new one, or levelled us up.
    stats = calc(state);

    state.enemy.age += dt;
    state.enemy.t += dt;

    // Carry the remainder so coarse offline steps do not drift.
    while (state.enemy.t >= state.enemy.spd) {
        state.enemy.t -= state.enemy.spd;
        let eDmg = state.enemy.dmg;
        if (state.enemy.boss && state.enemy.age > 30) {
            const stacks = Math.floor((state.enemy.age - 30) / 15);
            eDmg *= 1 + stacks * 0.5;
        }
        const d = (eDmg * 100) / (100 + stats.armor);
        state.hp -= d;
        events.push({ t: "playerHit", dmg: d });

        if (stats.thorns && d > 0) {
            const r = (d * stats.thorns) / 100;
            state.enemy.hp -= r;
            events.push({ t: "thorns", dmg: r });
            if (state.enemy.hp <= 0) {
                events.push(...kill(state, rng));
                return events;
            }
        }
    }

    state.hp = Math.min(stats.maxHp, state.hp + stats.g("regen") * dt);

    events.push(
        ...gainXp(
            state,
            (0.5 + state.lvl * 0.3 + stats.g("pxp")) *
                (1 + stats.g("xp") / 100) *
                dt,
        ),
    );

    for (const k in state.cd) {
        const id = k as SkillId;
        state.cd[id] = Math.max(0, state.cd[id] - dt);
    }
    state.buff = Math.max(0, state.buff - dt);

    if (state.hp <= 0) events.push(...die(state));
    return events;
}

/**
 * Step the simulation forward. Used for server-side offline progress.
 * `step` is the simulated granularity; coarser steps are cheaper but less exact.
 */
export function advance(
    state: SimState,
    seconds: number,
    rng: Rng,
    opts: { step?: number; maxSteps?: number } = {},
): SimEvent[] {
    if (!Number.isFinite(seconds) || seconds <= 0) return [];

    const step = Math.max(1e-3, opts.step ?? offlineStep(seconds));
    const maxSteps = Math.max(1, opts.maxSteps ?? 100_000);
    const events: SimEvent[] = [];

    let remaining = seconds;
    let steps = 0;

    while (remaining > 1e-9 && steps < maxSteps) {
        const dt = Math.min(step, remaining);
        events.push(...tick(state, dt, rng));
        remaining -= dt;
        steps++;
        if (state.dead) break;
    }
    return events;
}

/** Step size for an absence: exact for short gaps, coarse for long ones. */
export function offlineStep(seconds: number): number {
    if (seconds <= 15 * 60) return 0.1;
    if (seconds <= 2 * 60 * 60) return 0.5;
    return 1;
}
