import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { buildServer } from "../src/server";
import { connectMongo } from "../src/db/mongo";
import { ensureIndexes } from "../src/db/indexes";
import { testEnv, type Env } from "../src/env";
import type { SaveDoc } from "../src/db/types";

let mongo: MongoMemoryServer;
let client: MongoClient;
let counter = 0;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const conn = await connectMongo(mongo.getUri(), "cinderfall_game");
    client = conn.client;
}, 120_000);

afterAll(async () => {
    await client?.close();
    await mongo?.stop();
});

async function freshDb(): Promise<Db> {
    const db = client.db(`game_${++counter}`);
    await ensureIndexes(db);
    return db;
}

async function makeApp(
    overrides: Record<string, string> = {},
): Promise<{ app: FastifyInstance; env: Env; db: Db }> {
    const db = await freshDb();
    const env = testEnv({
        GUEST_RATE_LIMIT: "100",
        SIGNUP_RATE_LIMIT: "100",
        LOGIN_RATE_LIMIT: "100",
        ...overrides,
    });
    const app = await buildServer({ env, db });
    await app.ready();
    return { app, env, db };
}

const headers = (env: Env, cookie?: string, csrf?: string) => ({
    origin: env.PUBLIC_ORIGIN,
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { "x-csrf-token": csrf } : {}),
});

function cookieOf(res: { headers: Record<string, unknown> }, env: Env): string {
    const raw = res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const found = list.find((c) => c.startsWith(`${env.cookieName}=`));
    expect(found).toBeTruthy();
    return found!.split(";")[0]!;
}

async function guest(app: FastifyInstance, env: Env) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/guest",
        headers: headers(env),
    });
    expect(res.statusCode).toBe(200);
    return {
        id: res.json().user.id as string,
        csrf: res.json().csrf as string,
        cookie: cookieOf(res, env),
    };
}

async function getState(
    app: FastifyInstance,
    env: Env,
    cookie: string,
) {
    const res = await app.inject({
        method: "GET",
        url: "/api/game/state",
        headers: headers(env, cookie),
    });
    return res;
}

async function putState(
    app: FastifyInstance,
    env: Env,
    cookie: string,
    csrf: string | null,
    body: unknown,
) {
    return app.inject({
        method: "PUT",
        url: "/api/game/state",
        headers: headers(env, cookie, csrf ?? undefined),
        payload: body as Record<string, unknown>,
    });
}

describe("cloud saves", () => {
    it("returns the initial save", async () => {
        const { app, env } = await makeApp();
        const g = await guest(app, env);

        const res = await getState(app, env, g.cookie);
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.revision).toBe(1);
        expect(body.simClock).toBe(0);
        expect(body.away).toBeNull();
        expect(body.state.lvl).toBe(1);

        await app.close();
    });

    it("persists a pushed state and bumps the revision", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        const first = (await getState(app, env, g.cookie)).json();
        const state = {
            ...first.state,
            lvl: 3,
            gold: 999,
        };

        const put = await putState(app, env, g.cookie, g.csrf, {
            state,
            simClock: 5,
            expectedRevision: first.revision,
        });
        expect(put.statusCode).toBe(200);
        expect(put.json().revision).toBe(2);

        const after = (await getState(app, env, g.cookie)).json();
        expect(after.state.lvl).toBe(3);
        expect(after.state.gold).toBe(999);
        expect(after.simClock).toBe(5);
        expect(after.revision).toBe(2);

        const doc = await db
            .collection<SaveDoc>("saves")
            .findOne({ _id: g.id });
        expect(doc?.simClock).toBe(5);

        await app.close();
    });

    it("rejects a stale revision with the canonical save", async () => {
        const { app, env } = await makeApp();
        const g = await guest(app, env);
        const first = (await getState(app, env, g.cookie)).json();

        const put = await putState(app, env, g.cookie, g.csrf, {
            state: first.state,
            simClock: 1,
            expectedRevision: 999,
        });
        expect(put.statusCode).toBe(409);
        expect(put.json().error.code).toBe("conflict");
        expect(put.json().error.details.revision).toBe(1);

        await app.close();
    });

    it("requires CSRF and sane clock values", async () => {
        const { app, env } = await makeApp();
        const g = await guest(app, env);
        const first = (await getState(app, env, g.cookie)).json();

        const noCsrf = await putState(app, env, g.cookie, null, {
            state: first.state,
            simClock: 1,
            expectedRevision: 1,
        });
        expect(noCsrf.statusCode).toBe(403);

        const ahead = await putState(app, env, g.cookie, g.csrf, {
            state: first.state,
            simClock: 1e9,
            expectedRevision: 1,
        });
        expect(ahead.statusCode).toBe(400);
        expect(ahead.json().error.code).toBe("clock_ahead");

        const ok = await putState(app, env, g.cookie, g.csrf, {
            state: first.state,
            simClock: 3,
            expectedRevision: 1,
        });
        expect(ok.statusCode).toBe(200);

        const behind = await putState(app, env, g.cookie, g.csrf, {
            state: first.state,
            simClock: 1,
            expectedRevision: 2,
        });
        expect(behind.statusCode).toBe(409);
        expect(behind.json().error.code).toBe("clock_behind");

        await app.close();
    });

    it("sanitises client state before storing it", async () => {
        const { app, env } = await makeApp();
        const g = await guest(app, env);
        const first = (await getState(app, env, g.cookie)).json();

        const junk = Array.from({ length: 40 }, (_, i) => ({
            id: i + 1,
            slot: i === 0 ? "not-a-slot" : "weapon",
            base: "Blade",
            il: 10,
            ri: 1,
            imp: { stat: "dmg", val: 5 },
            aff: [],
            name: "Blade",
            title: null,
            rr: 0,
        }));

        const put = await putState(app, env, g.cookie, g.csrf, {
            state: {
                ...first.state,
                inv: junk,
                gold: Number.NaN,
                hp: 1e15,
                ranks: { brut: 999, nope: 2 },
            },
            simClock: 1,
            expectedRevision: 1,
        });
        expect(put.statusCode).toBe(200);

        const after = (await getState(app, env, g.cookie)).json();
        expect(after.state.inv).toHaveLength(29);
        expect(after.state.inv.every((i: { slot: string }) => i.slot === "weapon")).toBe(true);
        expect(after.state.gold).toBe(0);
        expect(after.state.ranks.brut).toBe(5);
        expect(after.state.ranks.nope).toBeUndefined();
        expect(Number.isFinite(after.state.hp)).toBe(true);

        await app.close();
    });

    it("requires authentication", async () => {
        const { app, env } = await makeApp();

        const get = await app.inject({
            method: "GET",
            url: "/api/game/state",
            headers: headers(env),
        });
        expect(get.statusCode).toBe(401);

        const put = await app.inject({
            method: "PUT",
            url: "/api/game/state",
            headers: headers(env),
            payload: { state: {}, simClock: 0, expectedRevision: 1 },
        });
        expect(put.statusCode).toBe(401);

        await app.close();
    });
});

describe("offline catch-up", () => {
    async function setLastSimAt(db: Db, userId: string, msAgo: number) {
        await db.collection<SaveDoc>("saves").updateOne(
            { _id: userId },
            { $set: { lastSimAt: new Date(Date.now() - msAgo) } },
        );
    }

    it("simulates a two-hour absence and reports a summary", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        await setLastSimAt(db, g.id, 2 * 3600 * 1000);

        const res = await getState(app, env, g.cookie);
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.revision).toBe(2);
        expect(body.away).toBeTruthy();
        expect(body.away.seconds).toBeGreaterThanOrEqual(7_190);
        expect(body.away.seconds).toBeLessThanOrEqual(7_210);
        expect(body.away.kills).toBeGreaterThan(0);
        expect(body.away.gold).toBeGreaterThan(0);
        expect(body.simClock).toBeGreaterThan(7_000);
        expect(body.state.stage).toBeGreaterThan(1);

        await app.close();
    }, 30_000);

    it("caps long absences at the configured maximum", async () => {
        const { app, env, db } = await makeApp({ OFFLINE_CAP_HOURS: "2" });
        const g = await guest(app, env);

        await setLastSimAt(db, g.id, 24 * 3600 * 1000);

        const body = (await getState(app, env, g.cookie)).json();
        expect(body.away.seconds).toBe(2 * 3600);
        expect(body.away.skipped).toBeGreaterThan(20 * 3600);
        expect(body.simClock).toBe(2 * 3600);

        await app.close();
    }, 30_000);

    it("does not catch up for a short gap", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        await setLastSimAt(db, g.id, 5_000);

        const body = (await getState(app, env, g.cookie)).json();
        expect(body.away).toBeNull();
        expect(body.revision).toBe(1);

        await app.close();
    });

    it("auto-rebirths after a death and keeps simulating", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        const first = (await getState(app, env, g.cookie)).json();
        const state = {
            ...first.state,
            hp: 10,
            enemy: {
                ...first.state.enemy,
                hp: 1e9,
                max: 1e9,
                dmg: 1e6,
                spd: 0.1,
            },
        };

        await db.collection<SaveDoc>("saves").updateOne(
            { _id: g.id },
            {
                $set: {
                    state,
                    lastSimAt: new Date(Date.now() - 3600 * 1000),
                },
            },
        );

        const body = (await getState(app, env, g.cookie)).json();
        expect(body.away.died).toBe(true);
        expect(body.away.deaths).toBeGreaterThanOrEqual(1);
        // The death no longer freezes the rest of the absence.
        expect(body.state.dead).toBe(false);
        expect(body.away.kills).toBeGreaterThan(0);
        expect(body.away.stages).toBeGreaterThan(0);
        expect(body.state.stage).toBeGreaterThan(1);

        await app.close();
    }, 30_000);

    it("resumes a save that was already dead on the death screen", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        const first = (await getState(app, env, g.cookie)).json();
        const state = {
            ...first.state,
            dead: true,
            hp: 0,
            pend: 12,
        };

        await db.collection<SaveDoc>("saves").updateOne(
            { _id: g.id },
            {
                $set: {
                    state,
                    lastSimAt: new Date(Date.now() - 3600 * 1000),
                },
            },
        );

        const body = (await getState(app, env, g.cookie)).json();
        expect(body.away.died).toBe(true);
        expect(body.state.dead).toBe(false);
        expect(body.state.shards).toBeGreaterThanOrEqual(12);
        expect(body.away.kills).toBeGreaterThan(0);

        await app.close();
    }, 30_000);
});
