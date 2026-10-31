// Cloud saves: pull (with server-side offline catch-up) and push.

import type { FastifyPluginAsync } from "fastify";
import type { Db, WithId } from "mongodb";
import {
    advance,
    createGame,
    hashSeed,
    mulberry32,
    normalizeState,
    offlineStep,
    type SimState,
} from "@cinderfall/sim";
import { saveSchema } from "@cinderfall/contracts";
import type { Env } from "../env";
import type { SaveDoc } from "../db/types";
import { authOf, requireAuth } from "../auth/guards";
import { assertCsrf } from "../auth/session";
import { httpError } from "../lib/errors";
import { parseBody } from "../lib/validate";

export interface AwaySummary {
    /** Seconds actually simulated. */
    seconds: number;
    /** Seconds beyond the offline cap that were not simulated. */
    skipped: number;
    kills: number;
    drops: number;
    levels: number;
    stages: number;
    gold: number;
    shards: number;
    /** Deaths the offline simulation auto-recovered from. */
    deaths: number;
    died: boolean;
}

interface GameRouteOptions {
    db: Db;
    env: Env;
}

/** Below this gap, the client is presumed active; no catch-up runs. */
const CATCHUP_MIN_SECONDS = 30;
const MAX_SAVE_BYTES = 64 * 1024;

type Save = WithId<SaveDoc>;

async function loadOrCreateSave(db: Db, userId: string): Promise<Save> {
    const saves = db.collection<SaveDoc>("saves");
    const existing = await saves.findOne({ _id: userId });
    if (existing) return existing;

    const now = new Date();
    const doc: SaveDoc = {
        _id: userId,
        schemaVersion: 1,
        state: createGame(mulberry32(hashSeed(userId))).state,
        simClock: 0,
        lastSimAt: now,
        revision: 1,
        updatedAt: now,
    };

    try {
        await saves.insertOne(doc);
    } catch {
        // A concurrent request created it; use that one.
    }
    const created = await saves.findOne({ _id: userId });
    if (!created) throw new Error("could not create save");
    return created;
}

function summarize(
    pre: Pick<SimState, "lvl" | "stage" | "gold" | "shards" | "dead">,
    after: SimState,
    events: ReturnType<typeof advance>,
    simulated: number,
    skipped: number,
): AwaySummary {
    let kills = 0;
    let drops = 0;
    let levels = 0;
    let stages = 0;
    let deaths = 0;
    let gold = 0;

    for (const event of events) {
        switch (event.t) {
            case "kill":
                kills++;
                if (event.boss) stages++;
                gold += event.gold;
                break;
            case "drop":
                drops++;
                if (event.sold) gold += event.gold;
                break;
            case "levelup":
                levels++;
                break;
            case "death":
                deaths++;
                break;
        }
    }

    // Levels, stages and gold reset on rebirth, so count events/earnings
    // instead of diffing the final state. Shards are permanent, so the diff
    // is still exact.
    return {
        seconds: Math.round(simulated),
        skipped: Math.round(Math.max(0, skipped)),
        kills,
        drops,
        levels,
        stages,
        gold: Math.round(Math.max(0, gold)),
        shards: Math.max(0, after.shards - pre.shards),
        deaths,
        died: pre.dead || deaths > 0,
    };
}

/**
 * Advance an inactive save to now. Returns the (possibly updated) save and a
 * summary when a real absence was simulated.
 */
async function catchUp(
    db: Db,
    env: Env,
    save: Save,
): Promise<{ save: Save; away: AwaySummary | null }> {
    const now = new Date();
    const elapsed = Math.max(
        0,
        (now.getTime() - save.lastSimAt.getTime()) / 1000,
    );
    if (elapsed < CATCHUP_MIN_SECONDS) return { save, away: null };

    const cap = env.OFFLINE_CAP_HOURS * 3600;
    const simulated = Math.min(elapsed, cap);

    const state = normalizeState(save.state);
    const pre = {
        lvl: state.lvl,
        stage: state.stage,
        gold: state.gold,
        shards: state.shards,
        dead: state.dead,
    };

    const rng = mulberry32(
        hashSeed(save._id, save.lastSimAt.getTime(), save.simClock),
    );
    // Keep the idle loop alive: a death early in a long absence must not
    // discard the remaining offline window.
    const events = advance(state, simulated, rng, {
        step: offlineStep(simulated),
        maxSteps: 100_000,
        autoRebirth: true,
    });
    const away = summarize(pre, state, events, simulated, elapsed - simulated);

    const saves = db.collection<SaveDoc>("saves");
    const updated = await saves.findOneAndUpdate(
        { _id: save._id, revision: save.revision },
        {
            $set: {
                state,
                simClock: save.simClock + simulated,
                lastSimAt: now,
                updatedAt: now,
            },
            $inc: { revision: 1 },
        },
        { returnDocument: "after" },
    );

    if (!updated) {
        // Someone else wrote first (another tab/device). Their state wins.
        const current = await saves.findOne({ _id: save._id });
        if (!current) throw new Error("save disappeared");
        return { save: current, away: null };
    }
    return { save: updated, away };
}

const gameRoutes: FastifyPluginAsync<GameRouteOptions> = async (
    app,
    { db, env },
) => {
    const guard = requireAuth(db, env);
    const saves = db.collection<SaveDoc>("saves");

    app.get("/state", { preHandler: guard }, async (req) => {
        const auth = authOf(req);
        const save = await loadOrCreateSave(db, auth.user._id);

        const started = performance.now();
        const result = await catchUp(db, env, save);
        if (result.away) {
            req.log.info(
                {
                    playerId: auth.user._id,
                    seconds: result.away.seconds,
                    skipped: result.away.skipped,
                    ms: Math.round(performance.now() - started),
                },
                "offline catch-up",
            );
        }

        return {
            state: result.save.state,
            revision: result.save.revision,
            simClock: result.save.simClock,
            lastSimAt: result.save.lastSimAt.toISOString(),
            away: result.away,
        };
    });

    app.put("/state", { preHandler: guard }, async (req) => {
        const auth = authOf(req);
        assertCsrf(req, env, auth.session);

        const input = parseBody(saveSchema, req.body);
        const save = await loadOrCreateSave(db, auth.user._id);

        const conflict = (): never => {
            throw httpError(
                409,
                "conflict",
                "Save changed elsewhere",
                {
                    state: save.state,
                    revision: save.revision,
                    simClock: save.simClock,
                },
            );
        };

        if (input.expectedRevision !== save.revision) conflict();

        const state = normalizeState(input.state);
        if (Buffer.byteLength(JSON.stringify(state)) > MAX_SAVE_BYTES) {
            throw httpError(413, "save_too_large", "Save is too large");
        }

        const now = new Date();
        const elapsed = Math.max(
            0,
            (now.getTime() - save.lastSimAt.getTime()) / 1000,
        );

        if (input.simClock + 1e-6 < save.simClock) {
            throw httpError(
                409,
                "clock_behind",
                "This save is older than the server copy",
                {
                    state: save.state,
                    revision: save.revision,
                    simClock: save.simClock,
                },
            );
        }
        if (input.simClock > save.simClock + elapsed + 5) {
            throw httpError(
                400,
                "clock_ahead",
                "Simulated clock is ahead of real time",
            );
        }

        const updated = await saves.findOneAndUpdate(
            { _id: auth.user._id, revision: save.revision },
            {
                $set: {
                    state,
                    simClock: input.simClock,
                    lastSimAt: now,
                    updatedAt: now,
                },
                $inc: { revision: 1 },
            },
            { returnDocument: "after" },
        );

        if (!updated) conflict();

        return {
            revision: updated!.revision,
            simClock: updated!.simClock,
            updatedAt: now.toISOString(),
        };
    });
};

export default gameRoutes;
