import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { FastifyInstance } from "fastify";
import type { Db, MongoClient } from "mongodb";
import { buildServer } from "../src/server";
import { connectMongo } from "../src/db/mongo";
import { ensureIndexes } from "../src/db/indexes";
import { testEnv, type Env } from "../src/env";
import { hashToken } from "../src/auth/session";
import type { SaveDoc, SessionDoc, UserDoc } from "../src/db/types";

let mongo: MongoMemoryServer;
let client: MongoClient;
let counter = 0;

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const conn = await connectMongo(mongo.getUri(), "cinderfall_test");
    client = conn.client;
}, 120_000);

afterAll(async () => {
    await client?.close();
    await mongo?.stop();
});

async function freshDb(): Promise<Db> {
    const db = client.db(`test_${++counter}`);
    await ensureIndexes(db);
    return db;
}

async function makeApp(
    overrides: Record<string, string> = {},
): Promise<{ app: FastifyInstance; env: Env; db: Db }> {
    const db = await freshDb();
    const env = testEnv(overrides);
    const app = await buildServer({ env, db });
    await app.ready();
    return { app, env, db };
}

function setCookie(res: { headers: Record<string, unknown> }): string[] {
    const raw = res.headers["set-cookie"];
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [String(raw)];
}

function sessionCookie(res: { headers: Record<string, unknown> }, env: Env): string {
    const found = setCookie(res).find((c) => c.startsWith(`${env.cookieName}=`));
    expect(found, "session cookie").toBeTruthy();
    return found!.split(";")[0]!;
}

async function createGuest(app: FastifyInstance, env: Env) {
    const res = await app.inject({
        method: "POST",
        url: "/api/auth/guest",
        headers: { origin: env.PUBLIC_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
    return {
        res,
        body: res.json() as {
            user: { id: string; isGuest: boolean; displayName: string };
            csrf: string;
        },
        cookie: sessionCookie(res, env),
    };
}

describe("health", () => {
    it("reports liveness and readiness", async () => {
        const { app } = await makeApp();

        const live = await app.inject({ method: "GET", url: "/healthz" });
        expect(live.statusCode).toBe(200);
        expect(live.json()).toEqual({ ok: true });

        const ready = await app.inject({ method: "GET", url: "/readyz" });
        expect(ready.statusCode).toBe(200);
        expect(ready.json()).toEqual({ ok: true });

        await app.close();
    });

    it("returns a JSON 404", async () => {
        const { app } = await makeApp();
        const res = await app.inject({ method: "GET", url: "/nope" });
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe("not_found");
        await app.close();
    });
});

describe("guest sessions", () => {
    it("creates a guest, a save, and an HttpOnly cookie", async () => {
        const { app, env, db } = await makeApp();
        const { body, cookie, res } = await createGuest(app, env);

        expect(body.user.isGuest).toBe(true);
        expect(body.user.displayName).toMatch(/^Wanderer-[0-9A-F]{4}$/);
        expect(body.user).not.toHaveProperty("passwordHash");
        expect(typeof body.csrf).toBe("string");
        expect(body.csrf.length).toBeGreaterThan(20);

        const raw = setCookie(res).find((c) => c.startsWith(env.cookieName))!;
        expect(raw).toMatch(/HttpOnly/i);
        expect(raw).toMatch(/SameSite=Lax/i);
        expect(raw).toMatch(/Path=\//);
        expect(raw).not.toMatch(/Secure/i); // COOKIE_SECURE=false in tests

        const user = await db
            .collection<UserDoc>("users")
            .findOne({ _id: body.user.id });
        expect(user?.isGuest).toBe(true);
        expect(user?.passwordHash).toBeNull();
        expect(user?.email).toBeNull();

        const save = await db
            .collection<SaveDoc>("saves")
            .findOne({ _id: body.user.id });
        expect(save).toBeTruthy();
        expect(save?.schemaVersion).toBe(1);
        expect(save?.revision).toBe(1);
        expect((save?.state as { lvl: number }).lvl).toBe(1);

        expect(cookie).toMatch(/^cf_session=/);
        await app.close();
    });

    it("resolves the session and refuses an absent one", async () => {
        const { app, env } = await makeApp();
        const { body, cookie } = await createGuest(app, env);

        const withCookie = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie },
        });
        expect(withCookie.statusCode).toBe(200);
        expect(withCookie.json().user.id).toBe(body.user.id);
        expect(withCookie.json().csrf).toBe(body.csrf);
        expect(withCookie.headers["cache-control"]).toBe("no-store");

        const without = await app.inject({
            method: "GET",
            url: "/api/auth/session",
        });
        expect(without.statusCode).toBe(204);

        const bogus = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie: `${env.cookieName}=not-a-real-token` },
        });
        expect(bogus.statusCode).toBe(204);

        await app.close();
    });

    it("logs out, requiring a CSRF token and revoking the session", async () => {
        const { app, env, db } = await makeApp();
        const { body, cookie } = await createGuest(app, env);

        const missing = await app.inject({
            method: "POST",
            url: "/api/auth/logout",
            headers: { cookie, origin: env.PUBLIC_ORIGIN },
        });
        expect(missing.statusCode).toBe(403);
        expect(missing.json().error.code).toBe("csrf_missing");

        const wrong = await app.inject({
            method: "POST",
            url: "/api/auth/logout",
            headers: {
                cookie,
                origin: env.PUBLIC_ORIGIN,
                "x-csrf-token": "wrong",
            },
        });
        expect(wrong.statusCode).toBe(403);

        const ok = await app.inject({
            method: "POST",
            url: "/api/auth/logout",
            headers: {
                cookie,
                origin: env.PUBLIC_ORIGIN,
                "x-csrf-token": body.csrf,
            },
        });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({ ok: true });
        const cleared = setCookie(ok).find((c) =>
            c.startsWith(`${env.cookieName}=`),
        );
        expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

        expect(await db.collection("sessions").countDocuments()).toBe(0);

        const after = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie },
        });
        expect(after.statusCode).toBe(204);

        await app.close();
    });

    it("rejects a cross-origin mutation", async () => {
        const { app } = await makeApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/guest",
            headers: { origin: "https://evil.example" },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe("bad_origin");
        await app.close();
    });

    it("rate-limits guest creation per IP", async () => {
        const { app, env } = await makeApp({ GUEST_RATE_LIMIT: "3" });

        for (let i = 0; i < 3; i++) await createGuest(app, env);

        const blocked = await app.inject({
            method: "POST",
            url: "/api/auth/guest",
            headers: { origin: env.PUBLIC_ORIGIN },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json().error.code).toBe("rate_limited");

        await app.close();
    });

    it("treats an expired session as signed out", async () => {
        const { app, env, db } = await makeApp();
        const { cookie } = await createGuest(app, env);

        const token = cookie.split("=")[1]!;
        await db.collection<SessionDoc>("sessions").updateOne(
            { tokenHash: hashToken(token) },
            { $set: { expiresAt: new Date(Date.now() - 1000) } },
        );

        const res = await app.inject({
            method: "GET",
            url: "/api/auth/session",
            headers: { cookie },
        });
        expect(res.statusCode).toBe(204);
        expect(await db.collection("sessions").countDocuments()).toBe(0);

        await app.close();
    });

    it("uses the __Host- cookie when Secure is enabled", async () => {
        const { app, env } = await makeApp({ COOKIE_SECURE: "true" });
        expect(env.cookieName).toBe("__Host-cf_session");

        const res = await app.inject({
            method: "POST",
            url: "/api/auth/guest",
            headers: { origin: env.PUBLIC_ORIGIN },
        });
        const raw = setCookie(res).find((c) =>
            c.startsWith("__Host-cf_session="),
        )!;
        expect(raw).toMatch(/Secure/i);
        expect(raw).toMatch(/Path=\//);
        expect(raw).not.toMatch(/Domain=/i);

        await app.close();
    });

    it("is idempotent when logging out without a session", async () => {
        const { app, env } = await makeApp();
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/logout",
            headers: { origin: env.PUBLIC_ORIGIN },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
        await app.close();
    });

    it("keeps guest accounts out of the email index", async () => {
        const { app, env, db } = await makeApp();
        await createGuest(app, env);
        await createGuest(app, env);

        const users = await db.collection("users").countDocuments();
        expect(users).toBe(2);
        // Two null emails must not collide under the partial unique index.
        const indexed = await db
            .collection("users")
            .countDocuments({ emailLower: { $type: "string" } });
        expect(indexed).toBe(0);

        await app.close();
    });
});
