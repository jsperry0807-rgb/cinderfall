import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { buildServer } from "../src/server";
import { connectMongo } from "../src/db/mongo";
import { ensureIndexes } from "../src/db/indexes";
import { testEnv, type Env } from "../src/env";
import type { SaveDoc, SessionDoc, UserDoc } from "../src/db/types";

let mongo: MongoMemoryServer;
let client: MongoClient;
let counter = 0;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const conn = await connectMongo(mongo.getUri(), "cinderfall_accounts");
    client = conn.client;
}, 120_000);

afterAll(async () => {
    await client?.close();
    await mongo?.stop();
});

async function freshDb(): Promise<Db> {
    const db = client.db(`accounts_${++counter}`);
    await ensureIndexes(db);
    return db;
}

async function makeApp(
    overrides: Record<string, string> = {},
): Promise<{ app: FastifyInstance; env: Env; db: Db }> {
    const db = await freshDb();
    const env = testEnv({
        SIGNUP_RATE_LIMIT: "100",
        LOGIN_RATE_LIMIT: "100",
        GUEST_RATE_LIMIT: "100",
        ...overrides,
    });
    const app = await buildServer({ env, db });
    await app.ready();
    return { app, env, db };
}

function setCookie(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers["set-cookie"];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [String(raw)];
}

function cookieOf(res: { headers: Record<string, unknown> }, env: Env): string {
    const found = setCookie(res).find((c) =>
        c.startsWith(`${env.cookieName}=`),
    );
    expect(found, "session cookie").toBeTruthy();
    return found!.split(";")[0]!;
}

function headers(env: Env, cookie?: string, csrf?: string) {
    return {
        origin: env.PUBLIC_ORIGIN,
        ...(cookie ? { cookie } : {}),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
    };
}

const VALID = {
    email: "ash@example.com",
    password: "correct horse battery",
    displayName: "Ash Walker",
};

async function guest(app: FastifyInstance, env: Env) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/guest",
        headers: headers(env),
    });
    expect(res.statusCode).toBe(200);
    return {
        id: res.json().user.id as string,
        body: res.json() as { user: { id: string }; csrf: string },
        cookie: cookieOf(res, env),
    };
}

async function signup(
    app: FastifyInstance,
    env: Env,
    input: Record<string, unknown> = VALID,
    cookie?: string,
) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        headers: headers(env, cookie),
        payload: input,
    });
    return {
        res,
        body: res.json() as {
            user: {
                id: string;
                email: string | null;
                displayName: string;
                isGuest: boolean;
            };
            csrf: string;
        },
        cookie:
            res.statusCode === 200 ? cookieOf(res, env) : undefined,
    };
}

async function login(
    app: FastifyInstance,
    env: Env,
    email: string,
    password: string,
    cookie?: string,
) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: headers(env, cookie),
        payload: { email, password },
    });
    return {
        res,
        body: res.json() as { user: { id: string }; csrf: string },
        cookie: res.statusCode === 200 ? cookieOf(res, env) : undefined,
    };
}

describe("signup and claim", () => {
    it("claims a guest, keeps its save and rotates the session", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        await db
            .collection<SaveDoc>("saves")
            .updateOne({ _id: g.id }, { $set: { "state.gold": 4242 } });

        const s = await signup(app, env, VALID, g.cookie);
        expect(s.res.statusCode).toBe(200);
        expect(s.body.user.id).toBe(g.id);
        expect(s.body.user.isGuest).toBe(false);
        expect(s.body.user.email).toBe("ash@example.com");

        const user = await db
            .collection<UserDoc>("users")
            .findOne({ _id: g.id });
        expect(user?.isGuest).toBe(false);
        expect(user?.emailLower).toBe("ash@example.com");
        expect(user?.passwordHash).toMatch(/^\$argon2id\$/);

        const save = await db
            .collection<SaveDoc>("saves")
            .findOne({ _id: g.id });
        expect((save?.state as { gold: number }).gold).toBe(4242);

        // The guest session was revoked; the new one works.
        const oldSession = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: g.cookie },
        });
        expect(oldSession.statusCode).toBe(204);

        const newSession = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: s.cookie },
        });
        expect(newSession.statusCode).toBe(200);
        expect(newSession.json().user.isGuest).toBe(false);

        await app.close();
    });

    it("creates an account and a save without a guest", async () => {
        const { app, env, db } = await makeApp();
        const s = await signup(app, env);

        expect(s.res.statusCode).toBe(200);
        expect(s.body.user.isGuest).toBe(false);

        const save = await db
            .collection<SaveDoc>("saves")
            .findOne({ _id: s.body.user.id });
        expect(save).toBeTruthy();
        expect(save?.revision).toBe(1);

        await app.close();
    });

    it("rejects duplicate emails, bad input and common passwords", async () => {
        const { app, env } = await makeApp();
        await signup(app, env);

        const duplicate = await signup(app, env, {
            ...VALID,
            displayName: "Someone Else",
        });
        expect(duplicate.res.statusCode).toBe(409);
        expect(duplicate.res.json().error.code).toBe("email_taken");

        const short = await signup(app, env, {
            ...VALID,
            email: "short@example.com",
            password: "short",
        });
        expect(short.res.statusCode).toBe(400);

        const badEmail = await signup(app, env, {
            ...VALID,
            email: "not-an-email",
        });
        expect(badEmail.res.statusCode).toBe(400);

        const badName = await signup(app, env, {
            ...VALID,
            email: "name@example.com",
            displayName: "x",
        });
        expect(badName.res.statusCode).toBe(400);

        const common = await signup(app, env, {
            ...VALID,
            email: "common@example.com",
            password: "password123",
        });
        expect(common.res.statusCode).toBe(400);
        expect(common.res.json().error.code).toBe("weak_password");

        await app.close();
    });

    it("refuses signup when already signed in", async () => {
        const { app, env } = await makeApp();
        const s = await signup(app, env);

        const again = await signup(
            app,
            env,
            { ...VALID, email: "second@example.com" },
            s.cookie,
        );
        expect(again.res.statusCode).toBe(409);
        expect(again.res.json().error.code).toBe("already_authenticated");

        await app.close();
    });
});

describe("login", () => {
    it("logs in and rotates the session", async () => {
        const { app, env } = await makeApp();
        const created = await signup(app, env);

        const l = await login(app, env, VALID.email, VALID.password);
        expect(l.res.statusCode).toBe(200);
        expect(l.body.user.id).toBe(created.body.user.id);

        const session = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: l.cookie! },
        });
        expect(session.statusCode).toBe(200);

        await app.close();
    });

    it("uses a generic error for wrong passwords and unknown emails", async () => {
        const { app, env } = await makeApp();
        await signup(app, env);

        const wrong = await login(app, env, VALID.email, "wrong password");
        expect(wrong.res.statusCode).toBe(401);
        expect(wrong.res.json().error.code).toBe("invalid_credentials");

        const unknown = await login(
            app,
            env,
            "nobody@example.com",
            VALID.password,
        );
        expect(unknown.res.statusCode).toBe(401);
        expect(unknown.res.json().error.code).toBe("invalid_credentials");

        await app.close();
    });

    it("discards the current guest when logging in", async () => {
        const { app, env, db } = await makeApp();
        const created = await signup(app, env);

        const g = await guest(app, env);
        expect(
            await db.collection<UserDoc>("users").countDocuments({ _id: g.id }),
        ).toBe(1);

        const l = await login(
            app,
            env,
            VALID.email,
            VALID.password,
            g.cookie,
        );
        expect(l.res.statusCode).toBe(200);
        expect(l.body.user.id).toBe(created.body.user.id);

        expect(
            await db.collection<UserDoc>("users").countDocuments({ _id: g.id }),
        ).toBe(0);
        expect(
            await db.collection<SaveDoc>("saves").countDocuments({ _id: g.id }),
        ).toBe(0);

        await app.close();
    });

    it("rate-limits login attempts", async () => {
        const { app, env } = await makeApp({ LOGIN_RATE_LIMIT: "3" });
        await signup(app, env);

        for (let i = 0; i < 3; i++) {
            const r = await login(app, env, VALID.email, "wrong password");
            expect(r.res.statusCode).toBe(401);
        }

        const blocked = await login(app, env, VALID.email, "wrong password");
        expect(blocked.res.statusCode).toBe(429);

        await app.close();
    });
});

describe("account", () => {
    it("returns the profile and updates the display name", async () => {
        const { app, env } = await makeApp();
        const s = await signup(app, env);

        const me = await app.inject({
            method: "GET",
            url: "/api/me",
            headers: { cookie: s.cookie },
        });
        expect(me.statusCode).toBe(200);
        expect(me.json().user.id).toBe(s.body.user.id);

        const anon = await app.inject({ method: "GET", url: "/api/me" });
        expect(anon.statusCode).toBe(401);

        const noCsrf = await app.inject({
            method: "PATCH",
            url: "/api/me",
            headers: headers(env, s.cookie),
            payload: { displayName: "No Token" },
        });
        expect(noCsrf.statusCode).toBe(403);

        const patched = await app.inject({
            method: "PATCH",
            url: "/api/me",
            headers: headers(env, s.cookie, s.body.csrf),
            payload: { displayName: "Cinder Ash" },
        });
        expect(patched.statusCode).toBe(200);
        expect(patched.json().user.displayName).toBe("Cinder Ash");

        await app.close();
    });

    it("exports the profile and save without secrets", async () => {
        const { app, env } = await makeApp();
        const s = await signup(app, env);

        const res = await app.inject({
            method: "GET",
            url: "/api/me/export",
            headers: { cookie: s.cookie },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-disposition"]).toMatch(/attachment/);
        expect(res.body).not.toContain("passwordHash");
        expect(res.body).not.toContain("tokenHash");

        const body = res.json();
        expect(body.user.id).toBe(s.body.user.id);
        expect(body.save._id).toBe(s.body.user.id);
        expect(body.exportedAt).toBeTruthy();

        await app.close();
    });

    it("lists, revokes other sessions and revokes the current one", async () => {
        const { app, env } = await makeApp();
        const s = await signup(app, env);

        const second = await login(app, env, VALID.email, VALID.password);

        const list = await app.inject({
            method: "GET",
            url: "/api/me/sessions",
            headers: { cookie: second.cookie! },
        });
        expect(list.statusCode).toBe(200);
        const sessions = list.json().sessions as Array<{
            id: string;
            current: boolean;
        }>;
        expect(sessions).toHaveLength(2);
        expect(sessions.filter((x) => x.current)).toHaveLength(1);

        const revoked = await app.inject({
            method: "POST",
            url: "/api/me/sessions/revoke-others",
            headers: headers(env, second.cookie, second.body.csrf),
        });
        expect(revoked.statusCode).toBe(200);
        expect(revoked.json().revoked).toBe(1);

        const remaining = await app.inject({
            method: "GET",
            url: "/api/me/sessions",
            headers: { cookie: second.cookie! },
        });
        expect(remaining.json().sessions).toHaveLength(1);

        const current = sessions.find((x) => x.current)!;
        const self = await app.inject({
            method: "DELETE",
            url: `/api/me/sessions/${current.id}`,
            headers: headers(env, second.cookie, second.body.csrf),
        });
        expect(self.statusCode).toBe(200);

        const after = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: second.cookie! },
        });
        expect(after.statusCode).toBe(204);

        await app.close();
    });
});

describe("deletion", () => {
    it("deletes a guest without a password", async () => {
        const { app, env, db } = await makeApp();
        const g = await guest(app, env);

        const res = await app.inject({
            method: "DELETE",
            url: "/api/me",
            headers: headers(env, g.cookie, g.body.csrf),
        });
        expect(res.statusCode).toBe(200);

        expect(
            await db.collection<UserDoc>("users").countDocuments({ _id: g.id }),
        ).toBe(0);
        expect(
            await db.collection<SaveDoc>("saves").countDocuments({ _id: g.id }),
        ).toBe(0);
        expect(
            await db.collection<SessionDoc>("sessions").countDocuments({
                userId: g.id,
            }),
        ).toBe(0);

        await app.close();
    });

    it("requires the password for a registered account", async () => {
        const { app, env, db } = await makeApp();
        const s = await signup(app, env);

        const missing = await app.inject({
            method: "DELETE",
            url: "/api/me",
            headers: headers(env, s.cookie, s.body.csrf),
            payload: {},
        });
        expect(missing.statusCode).toBe(400);
        expect(missing.json().error.code).toBe("password_required");

        const wrong = await app.inject({
            method: "DELETE",
            url: "/api/me",
            headers: headers(env, s.cookie, s.body.csrf),
            payload: { password: "wrong password" },
        });
        expect(wrong.statusCode).toBe(403);

        const ok = await app.inject({
            method: "DELETE",
            url: "/api/me",
            headers: headers(env, s.cookie, s.body.csrf),
            payload: { password: VALID.password },
        });
        expect(ok.statusCode).toBe(200);

        expect(
            await db.collection<UserDoc>("users").countDocuments({ _id: s.body.user.id }),
        ).toBe(0);
        expect(
            await db.collection<SaveDoc>("saves").countDocuments({ _id: s.body.user.id }),
        ).toBe(0);

        await app.close();
    });
});
